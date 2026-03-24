/**
 * api/extract-cv-text.ts
 * 
 * Endpoint dedicado para extração de texto de CVs
 * Aceita PDF, DOCX e TXT via multipart/form-data
 * 
 * Vantagem sobre gemini-analyze: usa multipart (limite 50MB no Vercel)
 * em vez de JSON body (limite 4.5MB) — resolve o HTTP 413 em PDFs grandes
 * 
 * Versão: 1.0
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { IncomingForm, Fields, Files } from 'formidable';
import fs from 'fs';

// ============================================================
// CONFIGURAÇÃO — bodyParser: false é OBRIGATÓRIO para multipart
// ============================================================
export const config = {
  maxDuration: 60,
  api: {
    bodyParser: false,
  },
};

// ============================================================
// AI — Lazy initialization
// ============================================================
let aiInstance: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.API_KEY || '';
    if (!apiKey) throw new Error('API_KEY não configurada.');
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

// ============================================================
// HANDLER PRINCIPAL
// ============================================================
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  let tempFilePath: string | null = null;

  try {
    // 1. Parse do multipart/form-data
    const { files } = await parseForm(req);
    const arquivo = Array.isArray(files.arquivo) ? files.arquivo[0] : files.arquivo;

    if (!arquivo) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo recebido. Envie o campo "arquivo".' });
    }

    tempFilePath = arquivo.filepath;
    const nomeArquivo = (arquivo.originalFilename || '').toLowerCase();
    const extensao = nomeArquivo.split('.').pop() || '';
    const tamanhoMB = arquivo.size / 1024 / 1024;

    console.log(`📄 [extract-cv-text] Arquivo: ${arquivo.originalFilename} | Extensão: ${extensao} | ${tamanhoMB.toFixed(2)} MB`);

    // 2. Validações
    if (!['pdf', 'docx', 'doc', 'txt'].includes(extensao)) {
      return res.status(400).json({
        success: false,
        error: 'Formato não suportado. Use PDF, DOCX ou TXT.'
      });
    }

    if (tamanhoMB > 20) {
      return res.status(400).json({
        success: false,
        error: 'Arquivo muito grande. Máximo 20MB.'
      });
    }

    // 3. Extrair texto conforme tipo
    let textoExtraido = '';

    if (extensao === 'txt') {
      // TXT: leitura direta do arquivo temporário
      textoExtraido = fs.readFileSync(tempFilePath, 'utf-8');
      console.log(`✅ [extract-cv-text] TXT lido: ${textoExtraido.length} chars`);

    } else if (extensao === 'docx' || extensao === 'doc') {
      // DOCX: extrair texto com mammoth
      const mammoth = await import('mammoth');
      const buffer = fs.readFileSync(tempFilePath);
      const result = await mammoth.extractRawText({ buffer });
      textoExtraido = result.value;

      if (!textoExtraido || textoExtraido.trim().length === 0) {
        return res.status(200).json({ success: false, error: 'Documento DOCX vazio ou sem texto extraível.' });
      }
      console.log(`✅ [extract-cv-text] DOCX extraído: ${textoExtraido.length} chars`);

    } else if (extensao === 'pdf') {
      // PDF: enviar ao Gemini como inlineData
      const fileBuffer = fs.readFileSync(tempFilePath);
      const base64 = fileBuffer.toString('base64');

      console.log(`🤖 [extract-cv-text] Enviando PDF ao Gemini (${tamanhoMB.toFixed(2)} MB em base64)...`);

      const result = await getAI().models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'application/pdf', data: base64 } },
            {
              text: 'Extraia TODO o texto deste currículo exatamente como está. ' +
                    'Retorne APENAS o texto puro, sem formatação, sem JSON, sem markdown. ' +
                    'Preserve nomes, datas, cargos e tecnologias exatamente como aparecem.'
            }
          ]
        }],
        config: {
          temperature: 0.1,
          maxOutputTokens: 8192
        }
      });

      textoExtraido = result.text || '';

      if (!textoExtraido || textoExtraido.trim().length < 50) {
        return res.status(200).json({ success: false, error: 'Não foi possível extrair texto do PDF. Tente converter para DOCX ou TXT.' });
      }
      console.log(`✅ [extract-cv-text] PDF extraído via Gemini: ${textoExtraido.length} chars`);
    }

    // 4. Retornar texto extraído
    return res.status(200).json({
      success: true,
      data: {
        texto_original: textoExtraido.trim(),
        extensao,
        tamanho_mb: parseFloat(tamanhoMB.toFixed(2))
      }
    });

  } catch (error: any) {
    console.error('❌ [extract-cv-text] Erro:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro ao processar arquivo'
    });
  } finally {
    // Limpar arquivo temporário sempre
    if (tempFilePath) {
      try { fs.unlinkSync(tempFilePath); } catch {}
    }
  }
}

// ============================================================
// HELPER: parse multipart/form-data
// ============================================================
function parseForm(req: VercelRequest): Promise<{ fields: Fields; files: Files }> {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({
      maxFileSize: 20 * 1024 * 1024, // 20MB
      keepExtensions: true,
    });
    form.parse(req as any, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}
