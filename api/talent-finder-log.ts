/**
 * api/talent-finder-log.ts
 *
 * Registra e atualiza eventos do Talent Finder na tabela talent_finder_logs.
 *
 * Ações suportadas:
 * - 'gerar'   → cria novo registro quando o usuário gera queries
 * - 'abrir'   → incrementa queries_abertas (clique em "Abrir no Google")
 * - 'copiar'  → incrementa queries_copiadas (clique em "Copiar")
 * - 'captura' → incrementa leads_capturados (extensão trouxe leads)
 *
 * Versão: 1.0
 * Data: 17/03/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const config = { maxDuration: 10 };

// ── Extrair contexto dos requisitos (tecnologias, localização, senioridade) ──

function extrairContexto(requisitos: string): {
    tecnologias: string[];
    localizacao: string | null;
    senioridade: string | null;
} {
    const txt = requisitos.toLowerCase();

    // Tecnologias conhecidas
    const TECHS = [
        'SAP', 'React', 'React Native', 'Angular', 'Vue', 'Node', 'Python',
        'Java', 'Kotlin', 'Android', 'iOS', 'Swift', 'Flutter', 'AWS', 'Azure',
        'GCP', 'Docker', 'Kubernetes', 'Salesforce', 'ServiceNow', 'Oracle',
        'SQL', 'PostgreSQL', 'MongoDB', 'Redis', 'Selenium', 'Playwright',
        'JUnit', 'Appium', 'REST', 'GraphQL', 'TypeScript', 'JavaScript',
        'DevOps', 'Scrum', 'Agile', 'Power BI', 'Tableau', 'Databricks',
        'Open Finance', 'PIX', 'COBOL', 'ABAP', 'IS-Oil', 'IS Oil',
    ];

    const tecnologias = TECHS.filter(t =>
        txt.includes(t.toLowerCase())
    );

    // Localização
    const LOCAIS = [
        'São Paulo', 'Rio de Janeiro', 'Brasília', 'Curitiba', 'Porto Alegre',
        'Belo Horizonte', 'Campinas', 'Recife', 'Fortaleza', 'Salvador',
        'Grande São Paulo', 'Brasil', 'Remoto', 'Híbrido',
    ];
    const localizacao = LOCAIS.find(l => txt.includes(l.toLowerCase())) || null;

    // Senioridade
    const SENIORS: Record<string, string> = {
        'júnior': 'Júnior', 'junior': 'Júnior', 'jr': 'Júnior',
        'pleno': 'Pleno', 'mid': 'Pleno',
        'sênior': 'Sênior', 'senior': 'Sênior', 'sr': 'Sênior',
        'especialista': 'Especialista', 'specialist': 'Especialista',
        'lead': 'Lead', 'líder': 'Lead',
        'coordenador': 'Coordenador', 'gerente': 'Gerente',
        'diretor': 'Diretor',
    };
    const senioridade = Object.entries(SENIORS).find(([k]) =>
        txt.includes(k)
    )?.[1] || null;

    return { tecnologias, localizacao, senioridade };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });

    const { acao, log_id, usuario_id, nome_usuario, requisitos, queries, leads_count } = req.body as {
        acao:         'gerar' | 'abrir' | 'copiar' | 'captura';
        log_id?:      number;
        usuario_id?:  number;
        nome_usuario?: string;
        requisitos?:  string;
        queries?:     any[];
        leads_count?: number;
    };

    if (!acao) return res.status(400).json({ error: 'Campo "acao" obrigatório.' });

    try {

        // ── AÇÃO: gerar — cria novo log ───────────────────────────────────────
        if (acao === 'gerar') {
            if (!requisitos) return res.status(400).json({ error: 'requisitos obrigatório para acao=gerar.' });

            const { tecnologias, localizacao, senioridade } = extrairContexto(requisitos);

            const queriesParaGravar = (queries || []).map((q: any) => ({
                tipo:   q.tipo,
                titulo: q.titulo,
                query:  q.query,
            }));

            const { data, error } = await supabase
                .from('talent_finder_logs')
                .insert({
                    usuario_id:     usuario_id || null,
                    nome_usuario:   nome_usuario || null,
                    requisitos:     requisitos.trim(),
                    queries_geradas: queriesParaGravar,
                    total_queries:  queriesParaGravar.length,
                    queries_abertas:  0,
                    queries_copiadas: 0,
                    leads_capturados: 0,
                    tecnologias:    tecnologias.length > 0 ? tecnologias : null,
                    localizacao:    localizacao,
                    senioridade:    senioridade,
                })
                .select('id')
                .single();

            if (error) throw new Error(error.message);

            console.log(`✅ [talent-finder-log] Novo log criado: id=${data.id} | user=${nome_usuario || usuario_id}`);
            return res.status(200).json({ success: true, log_id: data.id });
        }

        // ── AÇÕES: abrir / copiar / captura — incrementam contadores ──────────
        if (['abrir', 'copiar', 'captura'].includes(acao)) {
            if (!log_id) return res.status(400).json({ error: 'log_id obrigatório para esta ação.' });

            const campo: Record<string, string> = {
                abrir:   'queries_abertas',
                copiar:  'queries_copiadas',
                captura: 'leads_capturados',
            };

            // Buscar valor atual e incrementar
            const { data: atual, error: e1 } = await supabase
                .from('talent_finder_logs')
                .select(campo[acao])
                .eq('id', log_id)
                .maybeSingle();

            if (e1) throw new Error(e1.message);
            if (!atual) return res.status(404).json({ error: 'Log não encontrado.' });

            const valorAtual = (atual as any)[campo[acao]] || 0;
            const incremento = acao === 'captura' ? (leads_count || 1) : 1;

            const { error: e2 } = await supabase
                .from('talent_finder_logs')
                .update({
                    [campo[acao]]:  valorAtual + incremento,
                    ultima_acao_em: new Date().toISOString(),
                })
                .eq('id', log_id);

            if (e2) throw new Error(e2.message);

            console.log(`✅ [talent-finder-log] ${acao} registrado: log_id=${log_id} | ${campo[acao]}=${valorAtual + incremento}`);
            return res.status(200).json({ success: true, acao, log_id });
        }

        return res.status(400).json({ error: `Ação inválida: ${acao}` });

    } catch (err: any) {
        console.error('❌ [talent-finder-log] Erro:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
}
