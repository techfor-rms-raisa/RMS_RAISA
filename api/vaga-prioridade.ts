/**
 * API Route: /api/vaga-prioridade
 * Calcula a prioridade de uma vaga usando Gemini AI
 * 
 * Esta API roda no backend (Vercel Functions) onde a API_KEY está disponível
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from "@google/genai";
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ============================================
// CONFIGURAÇÃO
// ============================================

const AI_MODEL_NAME = 'gemini-2.0-flash';

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
// COLETA DE DADOS DA VAGA
// ============================================

async function coletarDadosVaga(supabase: SupabaseClient, vagaId: string) {
    // Buscar vaga
    const { data: vaga, error: vagaError } = await supabase
        .from('vagas')
        .select('*')
        .eq('id', vagaId)
        .single();

    if (vagaError || !vaga) {
        console.error('Erro ao buscar vaga:', vagaError);
        return null;
    }

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

    // Calcular dias em aberto
    const dataAbertura = new Date(vaga.criado_em || vaga.created_at);
    const hoje = new Date();
    const diasAberto = Math.floor((hoje.getTime() - dataAbertura.getTime()) / (1000 * 60 * 60 * 24));

    return {
        titulo_vaga: vaga.titulo,
        cliente_nome: clienteNome,
        cliente_vip: clienteVip,
        prazo_fechamento: vaga.prazo_fechamento,
        faturamento_estimado: vaga.faturamento_mensal,
        stack_tecnologica: vaga.stack_tecnologica,
        senioridade: vaga.senioridade,
        dias_vaga_aberta: diasAberto,
        media_dias_vagas_similares: null // Pode ser implementado depois
    };
}

// ============================================
// CALCULAR PRIORIDADE COM IA
// ============================================

async function calculateVagaPriority(ai: GoogleGenAI, dados: any): Promise<any> {
    const prompt = `
        Você é um **Especialista em Gestão de Recrutamento e Seleção**.
        
        Analise os dados da vaga abaixo e calcule um **Score de Prioridade** de 0 a 100, considerando:
        
        **DADOS DA VAGA:**
        - Título: ${dados.titulo_vaga}
        - Cliente: ${dados.cliente_nome} ${dados.cliente_vip ? '(VIP)' : ''}
        - Prazo de Fechamento: ${dados.prazo_fechamento || 'Não definido'}
        - Faturamento Estimado: R$ ${dados.faturamento_estimado || 'Não informado'}
        - Stack Tecnológica: ${normalizeStackToString(dados.stack_tecnologica)}
        - Senioridade: ${dados.senioridade}
        - Dias em Aberto: ${dados.dias_vaga_aberta}
        - Média de Fechamento (vagas similares): ${dados.media_dias_vagas_similares || 'Sem histórico'} dias
        
        **CRITÉRIOS DE PRIORIZAÇÃO:**
        1. **Urgência do Prazo (0-100):** Quanto mais próximo o prazo, maior a urgência
        2. **Valor de Faturamento (0-100):** Maior faturamento = maior prioridade
        3. **Cliente VIP:** Se VIP, adicione 20 pontos ao score final
        4. **Tempo em Aberto (0-100):** Vagas abertas há muito tempo precisam de atenção
        5. **Complexidade da Stack (0-100):** Stacks complexas/raras precisam de mais tempo
        
        **CÁLCULO DO SLA (PRAZO SUGERIDO):**
        - Baseie-se na média histórica de vagas similares
        - Ajuste conforme a urgência e complexidade
        - Retorne em dias
        
        **NÍVEL DE PRIORIDADE:**
        - Score 80-100: "Alta"
        - Score 50-79: "Média"
        - Score 0-49: "Baixa"
        
        Retorne APENAS um JSON válido (sem markdown) com esta estrutura:
        {
            "score_prioridade": número de 0 a 100,
            "nivel_prioridade": "Alta" | "Média" | "Baixa",
            "sla_dias": número de dias sugerido,
            "justificativa": "explicação breve",
            "fatores_considerados": {
                "urgencia_prazo": número 0-100,
                "valor_faturamento": número 0-100,
                "cliente_vip": boolean,
                "tempo_aberto": número 0-100,
                "complexidade_stack": número 0-100
            }
        }
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

        console.log(`📊 Calculando prioridade para vaga ${vagaId}...`);

        // 1. Coletar dados da vaga
        const dadosVaga = await coletarDadosVaga(supabase, vagaId);
        if (!dadosVaga) {
            return res.status(404).json({ error: 'Vaga não encontrada' });
        }

        // 2. Calcular prioridade com IA
        const resultado = await calculateVagaPriority(ai, dadosVaga);

        // 3. Montar objeto completo
        const prioridade = {
            vaga_id: vagaId,
            score_prioridade: resultado.score_prioridade,
            nivel_prioridade: resultado.nivel_prioridade,
            sla_dias: resultado.sla_dias,
            justificativa: resultado.justificativa,
            fatores_considerados: resultado.fatores_considerados,
            calculado_em: new Date().toISOString()
        };

        // 4. Salvar no Supabase
        const { error: saveError } = await supabase
            .from('vaga_priorizacao')
            .upsert({
                vaga_id: vagaId,
                score_prioridade: prioridade.score_prioridade,
                nivel_prioridade: prioridade.nivel_prioridade,
                sla_dias: prioridade.sla_dias,
                justificativa: prioridade.justificativa,
                fatores_considerados: prioridade.fatores_considerados,
                calculado_em: prioridade.calculado_em
            });

        if (saveError) {
            console.error('Erro ao salvar prioridade:', saveError);
        }

        console.log(`✅ Prioridade calculada: ${prioridade.nivel_prioridade} (${prioridade.score_prioridade})`);

        return res.status(200).json({
            success: true,
            prioridade
        });

    } catch (error: any) {
        console.error('❌ Erro ao calcular prioridade:', error);
        return res.status(500).json({ 
            error: 'Falha ao calcular prioridade',
            details: error.message 
        });
    }
}
