/**
 * api/update-report-meta.ts
 * Atualiza campos meta (confidencial, risco_analista) no relatório mais recente
 * do consultor para o mês/ano especificado — chamado após updateConsultantScore.
 * v1.0 — 11/04/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !supabaseKey) {
    console.error('[update-report-meta] ❌ Credenciais Supabase ausentes');
    return res.status(500).json({ error: 'Configuração do servidor incompleta' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { consultant_id, month, year, confidencial, risco_analista } = req.body;

    if (!consultant_id || !month || !year) {
      return res
        .status(400)
        .json({ error: 'consultant_id, month e year são obrigatórios' });
    }

    console.log(
      `[update-report-meta] Consultor ${consultant_id} | ${month}/${year} | confidencial=${confidencial} | risco_analista=${risco_analista}`
    );

    // Buscar o ID do registro mais recente para este consultor/mês/ano
    const { data: records, error: selectError } = await supabase
      .from('consultant_reports')
      .select('id')
      .eq('consultant_id', consultant_id)
      .eq('month', month)
      .eq('year', year)
      .order('created_at', { ascending: false })
      .limit(1);

    if (selectError) {
      console.error('[update-report-meta] Erro no SELECT:', selectError);
      return res.status(500).json({ error: selectError.message });
    }

    if (!records || records.length === 0) {
      console.warn('[update-report-meta] Nenhum relatório encontrado para atualização de meta');
      // Não é erro crítico — o relatório pode estar em processamento
      return res.status(200).json({
        success: false,
        message: 'Nenhum relatório encontrado para este consultor/mês/ano',
      });
    }

    const reportId = records[0].id;

    // Atualizar os campos meta no registro encontrado
    const { error: updateError } = await supabase
      .from('consultant_reports')
      .update({
        confidencial: confidencial ?? false,
        risco_analista: risco_analista ?? null,
      })
      .eq('id', reportId);

    if (updateError) {
      console.error('[update-report-meta] Erro no UPDATE:', updateError);
      return res.status(500).json({ error: updateError.message });
    }

    console.log(
      `[update-report-meta] ✅ Relatório ${reportId} atualizado com sucesso`
    );
    return res.status(200).json({ success: true, report_id: reportId });
  } catch (err: any) {
    console.error('[update-report-meta] Erro inesperado:', err);
    return res.status(500).json({ error: err.message || 'Erro interno do servidor' });
  }
}
