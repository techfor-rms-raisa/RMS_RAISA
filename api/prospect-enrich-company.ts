/**
 * api/prospect-enrich-company.ts
 * 
 * Busca dados cadastrais de empresa brasileira via Gemini Search Grounding.
 * Retorna: CNPJ, razão social, nome fantasia, endereço completo.
 * 
 * Cache: consulta prospect_leads antes de gastar chamada Gemini.
 * 
 * Versão: 1.0
 * Data: 18/03/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 30 };

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

let aiInstance: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.API_KEY || '';
    if (!apiKey) throw new Error('API_KEY não configurada.');
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { dominio } = req.body;
    if (!dominio) return res.status(400).json({ error: 'dominio é obrigatório' });

    console.log(`🔍 [enrich-company] Buscando dados para: ${dominio}`);

    // ─── CACHE: Verificar se já temos dados no banco ───
    const { data: cached } = await supabase
      .from('prospect_leads')
      .select('empresa_nome, cidade, estado')
      .eq('empresa_dominio', dominio)
      .not('empresa_nome', 'is', null)
      .limit(1);

    // Se temos dados parciais no cache, vamos buscar mais via Gemini mesmo assim
    // (CNPJ e endereço completo raramente estão no prospect_leads)

    // ─── GEMINI SEARCH GROUNDING ───
    const ai = getAI();
    const prompt = `Busque os dados cadastrais da empresa brasileira com o domínio "${dominio}".

Retorne SOMENTE um JSON válido (sem backticks, sem markdown) com estes campos:
{
  "cnpj": "XX.XXX.XXX/XXXX-XX",
  "razao_social": "Nome completo da razão social",
  "nome_fantasia": "Nome fantasia/marca",
  "logradouro": "Rua/Avenida da sede principal",
  "numero": "Número",
  "complemento": "Complemento (andar, sala, etc)",
  "bairro": "Bairro",
  "cidade": "Cidade",
  "estado": "UF (2 letras)",
  "cep": "XXXXX-XXX"
}

Se não encontrar algum campo, use string vazia "".
Priorize dados oficiais (Receita Federal, CNPJ.info, site oficial).
NÃO invente dados. Se não encontrar, retorne campos vazios.`;

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.1,
        thinkingConfig: { thinkingBudget: 2048 },
      },
    });

    const responseText = (result as any).text || '';
    const cleanJson = responseText
      .replace(/```json\n?|\n?```/g, '')
      .replace(/[\x00-\x1F\x7F]/g, ' ')
      .trim();

    let empresa;
    try {
      empresa = JSON.parse(cleanJson);
    } catch {
      console.warn(`⚠️ [enrich-company] JSON inválido para ${dominio}:`, cleanJson.substring(0, 200));
      // Tentar extrair com regex
      const cnpjMatch = cleanJson.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
      empresa = {
        cnpj: cnpjMatch ? cnpjMatch[0] : '',
        razao_social: cached?.[0]?.empresa_nome || '',
        nome_fantasia: '',
        logradouro: '', numero: '', complemento: '', bairro: '',
        cidade: cached?.[0]?.cidade || '',
        estado: cached?.[0]?.estado || '',
        cep: ''
      };
    }

    console.log(`✅ [enrich-company] ${dominio}: ${empresa.razao_social || 'parcial'}`);
    return res.status(200).json({ empresa, dominio });

  } catch (error: any) {
    console.error('❌ [enrich-company]:', error?.message);
    return res.status(500).json({ error: error?.message || 'Erro interno' });
  }
}
