/**
 * API Route: /api/vaga-analistas-recomendados
 * Recomenda analistas para uma vaga usando Gemini AI
 * 
 * Esta API roda no backend (Vercel Functions) onde a API_KEY está disponível
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from "@google/genai";
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ============================================
// CONFIGURAÇÃO
// ============================================

const AI_MODEL_NAME = 'gemini-2.5-flash';

// Função para obter clientes (lazy initialization)
function getApiKey(): string {
    return process.env.API_KEY || '';
}

function getSupabaseClient(): SupabaseClient {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
    
    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase URL ou Key não configurados');
    }
    
    return createClient(supabaseUrl, supabaseKey);
}

function getAI(): GoogleGenAI {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error('API_KEY não configurada');
    }
    return new GoogleGenAI({ apiKey });
}

// ============================================
// HELPER: Normalizar stack_tecnologica
// ============================================

function normalizeStackToString(stack: any): string {
    if (!stack) return 'Não informado';
    if (Array.isArray(stack)) return stack.join(', ');
    if (typeof stack === 'string') {
        const trimmed = stack.trim();
        if (trimmed.startsWith('[')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) return parsed.join(', ');
            } catch (e) { /* ignore */ }
        }
        return trimmed;
    }
    return String(stack);
}

// ============================================
// COLETA DE DADOS
// ============================================

async function coletarDadosVaga(supabase: SupabaseClient, vagaId: string) {
    const { data: vaga, error } = await supabase
        .from('vagas')
        .select('*')
        .eq('id', vagaId)
        .single();

    if (error || !vaga) return null;

    // Buscar cliente
    let clienteNome = 'Cliente não informado';
    let clienteVip = false;
    if (vaga.cliente_id) {
        const { data: cliente } = await supabase
            .from('clients')
            .select('razao_social_cliente, vip')
            .eq('id', vaga.cliente_id)
            .single();
        
        if (cliente) {
            clienteNome = cliente.razao_social_cliente || clienteNome;
            clienteVip = cliente.vip || false;
        }
    }

    return {
        titulo_vaga: vaga.titulo,
        cliente_id: vaga.cliente_id,
        cliente_nome: clienteNome,
        cliente_vip: clienteVip,
        stack_tecnologica: vaga.stack_tecnologica,
        senioridade: vaga.senioridade
    };
}

async function coletarAnalistasDisponiveis(supabase: SupabaseClient) {
    const { data: analistas, error } = await supabase
        .from('users')
        .select('id, nome_usuario, tipo_usuario')
        .in('tipo_usuario', ['Analista de R&S', 'Gestão de R&S'])
        .eq('ativo_usuario', true);

    if (error || !analistas) return [];

    // Para cada analista, buscar métricas
    const analistasComMetricas = await Promise.all(
        analistas.map(async (a: any) => {
            // Buscar quantidade de vagas ativas
            const { count: vagasAtivas } = await supabase
                .from('vagas')
                .select('*', { count: 'exact', head: true })
                .eq('analista_id', a.id)
                .eq('status', 'aberta');

            return {
                id: a.id,
                nome: a.nome_usuario,
                stack_experiencia: ['Dynatrace', 'Kubernetes', 'AWS', 'Java', 'Python'], // Placeholder
                carga_trabalho_atual: vagasAtivas || 0,
                taxa_aprovacao_geral: 75, // Placeholder
                tempo_medio_fechamento_dias: 15 // Placeholder
            };
        })
    );

    return analistasComMetricas;
}

async function buscarPrioridadeVaga(supabase: SupabaseClient, vagaId: string) {
    const { data } = await supabase
        .from('vaga_priorizacao')
        .select('*')
        .eq('vaga_id', vagaId)
        .order('calculado_em', { ascending: false })
        .limit(1)
        .single();

    return data;
}

// ============================================
// RECOMENDAR ANALISTAS COM IA
// ============================================

async function recommendAnalyst(ai: GoogleGenAI, dados: any): Promise<any[]> {
    const analistasDesc = dados.analistas_disponiveis.map((a: any) => `
        - **${a.nome}** (ID: ${a.id})
          - Stack de Experiência: ${a.stack_experiencia.join(', ')}
          - Carga Atual: ${a.carga_trabalho_atual} vagas ativas
          - Taxa de Aprovação Geral: ${a.taxa_aprovacao_geral}%
          - Tempo Médio de Fechamento: ${a.tempo_medio_fechamento_dias} dias
    `).join('\n');

    const prompt = `
        Você é um **Algoritmo de Matching de Analistas de R&S**.
        
        Analise os dados abaixo e recomende os melhores analistas para esta vaga.
        
        **VAGA A SER PREENCHIDA:**
        - Título: ${dados.vaga.titulo_vaga}
        - Cliente: ${dados.vaga.cliente_nome}
        - Stack Necessária: ${normalizeStackToString(dados.vaga.stack_tecnologica)}
        - Senioridade: ${dados.vaga.senioridade}
        - Prioridade: ${dados.prioridade_vaga?.nivel_prioridade || 'Não calculada'} (Score: ${dados.prioridade_vaga?.score_prioridade || 'N/A'})
        - SLA Sugerido: ${dados.prioridade_vaga?.sla_dias || 'N/A'} dias
        
        **ANALISTAS DISPONÍVEIS:**
        ${analistasDesc}
        
        **CRITÉRIOS DE MATCHING:**
        1. **Fit Stack Tecnológica (0-100):** Experiência nas tecnologias da vaga
        2. **Fit Cliente (0-100):** Histórico com o cliente ou segmento
        3. **Disponibilidade (0-100):** Carga de trabalho atual
        4. **Taxa de Sucesso Histórica (0-100):** Aprovações em vagas similares
        
        **NÍVEL DE ADEQUAÇÃO:**
        - Score 80-100: "Excelente"
        - Score 60-79: "Bom"
        - Score 40-59: "Regular"
        - Score 0-39: "Baixo"
        
        Retorne APENAS um array JSON válido (sem markdown) com até 3 analistas recomendados:
        [
            {
                "analista_id": número,
                "analista_nome": "string",
                "score_match": número 0-100,
                "nivel_adequacao": "Excelente" | "Bom" | "Regular" | "Baixo",
                "justificativa_match": "explicação breve",
                "fatores_match": {
                    "fit_stack_tecnologica": número 0-100,
                    "fit_cliente": número 0-100,
                    "disponibilidade": número 0-100,
                    "taxa_sucesso_historica": número 0-100
                },
                "tempo_estimado_fechamento_dias": número,
                "recomendacao": "Altamente Recomendado" | "Recomendado" | "Com Ressalvas"
            }
        ]
    `;

    try {
        const result = await ai.models.generateContent({ 
            model: AI_MODEL_NAME, 
            contents: prompt 
        });
        
        const text = (result.text || '')
            .replace(/^```json\n?/gi, '')
            .replace(/^```\n?/gi, '')
            .replace(/```$/gi, '')
            .trim();
        
        if (!text) {
            throw new Error('Resposta vazia da IA');
        }
        
        // Tentar extrair JSON da resposta
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        
        return JSON.parse(text);
    } catch (error) {
        console.error('Erro na chamada do Gemini:', error);
        throw error;
    }
}

// ============================================
// HANDLER PRINCIPAL
// ============================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { vagaId } = req.body;

        if (!vagaId) {
            return res.status(400).json({ error: 'vagaId é obrigatório' });
        }

        // Verificar API Key
        const apiKey = getApiKey();
        if (!apiKey) {
            return res.status(500).json({ error: 'API_KEY não configurada no servidor' });
        }

        // Inicializar clientes
        const supabase = getSupabaseClient();
        const ai = getAI();

        console.log(`👥 Recomendando analistas para vaga ${vagaId}...`);

        // 1. Buscar prioridade da vaga
        const prioridade = await buscarPrioridadeVaga(supabase, vagaId);

        // 2. Coletar dados da vaga e analistas
        const dadosVaga = await coletarDadosVaga(supabase, vagaId);
        const analistas = await coletarAnalistasDisponiveis(supabase);

        if (!dadosVaga) {
            return res.status(404).json({ error: 'Vaga não encontrada' });
        }

        if (analistas.length === 0) {
            return res.status(404).json({ error: 'Nenhum analista disponível' });
        }

        // 3. Chamar IA para recomendar
        const resultados = await recommendAnalyst(ai, {
            vaga: dadosVaga,
            analistas_disponiveis: analistas,
            prioridade_vaga: prioridade
        });

        // 4. Salvar no Supabase
        for (const rec of resultados) {
            await supabase
                .from('vaga_distribuicao')
                .upsert({
                    vaga_id: vagaId,
                    analista_id: rec.analista_id,
                    score_match: rec.score_match,
                    nivel_adequacao: rec.nivel_adequacao,
                    justificativa_match: rec.justificativa_match,
                    fatores_match: rec.fatores_match,
                    tempo_estimado_fechamento_dias: rec.tempo_estimado_fechamento_dias,
                    recomendacao: rec.recomendacao,
                    calculado_em: new Date().toISOString()
                });
        }

        console.log(`✅ ${resultados.length} analistas recomendados`);

        return res.status(200).json({
            success: true,
            recomendacoes: resultados.map((r: any) => ({
                ...r,
                vaga_id: vagaId,
                calculado_em: new Date().toISOString()
            }))
        });

    } catch (error: any) {
        console.error('❌ Erro ao recomendar analistas:', error);
        return res.status(500).json({ 
            error: 'Falha ao recomendar analistas',
            details: error.message 
        });
    }
}
