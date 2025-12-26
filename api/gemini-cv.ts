/**
 * gemini-cv.ts - API de Processamento de CV com Gemini
 * 
 * Endpoints:
 * - extrair_texto: Extrai texto de PDF/DOCX
 * - processar_cv: Analisa CV e extrai dados estruturados
 * 
 * Versão: 1.0
 * Data: 26/12/2024
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Inicializar Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, texto_cv, pessoa_id, pessoa_nome, arquivo_base64, arquivo_nome, arquivo_tipo } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'Action is required' });
    }

    switch (action) {
      case 'extrair_texto':
        return await extrairTexto(res, arquivo_base64, arquivo_nome, arquivo_tipo);
      
      case 'processar_cv':
        return await processarCV(res, texto_cv, pessoa_id, pessoa_nome);
      
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

  } catch (error: any) {
    console.error('❌ Erro no gemini-cv:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

/**
 * Extrai texto de arquivo PDF/DOCX
 * Nota: Para produção, recomenda-se usar bibliotecas específicas como pdf-parse ou mammoth
 */
async function extrairTexto(
  res: VercelResponse, 
  base64: string, 
  nome: string, 
  tipo: string
): Promise<VercelResponse> {
  try {
    if (!base64) {
      return res.status(400).json({ error: 'arquivo_base64 is required' });
    }

    // Para PDFs, usar Gemini Vision para extrair texto
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const extensao = nome?.split('.').pop()?.toLowerCase();

    if (extensao === 'pdf') {
      // Usar Gemini com documento PDF
      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: base64
          }
        },
        `Extraia todo o texto deste documento PDF de currículo. 
         Retorne APENAS o texto extraído, sem formatação adicional, 
         mantendo a estrutura de parágrafos e seções.`
      ]);

      const response = await result.response;
      const texto = response.text();

      return res.status(200).json({
        sucesso: true,
        texto: texto,
        metodo: 'gemini-vision-pdf'
      });
    }

    // Para outros tipos, tentar como texto
    const buffer = Buffer.from(base64, 'base64');
    let texto = '';

    if (extensao === 'txt') {
      texto = buffer.toString('utf-8');
    } else {
      // Para DOCX, usar Gemini como fallback
      // Em produção, usar mammoth.js
      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: tipo || 'application/octet-stream',
            data: base64
          }
        },
        `Extraia todo o texto deste documento. 
         Retorne APENAS o texto extraído, sem formatação adicional.`
      ]);

      const response = await result.response;
      texto = response.text();
    }

    return res.status(200).json({
      sucesso: true,
      texto: texto,
      metodo: extensao === 'txt' ? 'direct' : 'gemini-fallback'
    });

  } catch (error: any) {
    console.error('Erro na extração de texto:', error);
    return res.status(500).json({ 
      error: 'Erro ao extrair texto do arquivo',
      details: error.message 
    });
  }
}

/**
 * Processa CV e extrai dados estruturados usando Gemini
 */
async function processarCV(
  res: VercelResponse, 
  textoCV: string, 
  pessoaId: number, 
  pessoaNome: string
): Promise<VercelResponse> {
  try {
    if (!textoCV) {
      return res.status(400).json({ error: 'texto_cv is required' });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const prompt = `Você é um especialista em análise de currículos de TI.
    
Analise o currículo abaixo e extraia as informações em formato JSON estruturado.

CURRÍCULO:
"""
${textoCV}
"""

RETORNE EXATAMENTE neste formato JSON (sem markdown, sem \`\`\`json):
{
  "sucesso": true,
  "titulo_sugerido": "Título profissional mais adequado baseado no perfil",
  "senioridade_detectada": "junior|pleno|senior|especialista",
  "resumo": "Resumo de 2-3 frases sobre o profissional",
  "skills": [
    {
      "nome": "Nome da skill",
      "categoria": "linguagem|framework|banco|cloud|ferramenta|soft_skill",
      "nivel": "basico|intermediario|avancado|especialista",
      "anos_experiencia": 0
    }
  ],
  "experiencias": [
    {
      "empresa": "Nome da empresa",
      "cargo": "Cargo ocupado",
      "data_inicio": "YYYY-MM-DD ou null",
      "data_fim": "YYYY-MM-DD ou null se atual",
      "atual": true|false,
      "descricao": "Descrição breve das atividades",
      "tecnologias": ["tech1", "tech2"]
    }
  ],
  "formacao": [
    {
      "tipo": "graduacao|pos_graduacao|mestrado|doutorado|tecnico|curso_livre",
      "curso": "Nome do curso",
      "instituicao": "Nome da instituição",
      "ano_conclusao": 2020,
      "em_andamento": false
    }
  ],
  "idiomas": [
    {
      "idioma": "Nome do idioma",
      "nivel": "basico|intermediario|avancado|fluente|nativo"
    }
  ]
}

REGRAS:
1. Extraia TODAS as skills técnicas mencionadas (linguagens, frameworks, bancos, cloud, ferramentas)
2. Para senioridade, considere: anos de experiência, complexidade dos projetos, cargos ocupados
3. Datas devem estar no formato YYYY-MM-DD ou null se não encontradas
4. Se uma informação não for encontrada, use null ou array vazio []
5. O resumo deve ser em português
6. Retorne APENAS o JSON, sem texto adicional antes ou depois`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let responseText = response.text();

    // Limpar resposta - remover markdown se presente
    responseText = responseText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim();

    // Tentar parsear JSON
    let dados;
    try {
      dados = JSON.parse(responseText);
    } catch (parseError) {
      // Se falhar, tentar extrair JSON da resposta
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        dados = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Resposta da IA não está em formato JSON válido');
      }
    }

    // Validar estrutura mínima
    if (!dados.skills) dados.skills = [];
    if (!dados.experiencias) dados.experiencias = [];
    if (!dados.formacao) dados.formacao = [];
    if (!dados.idiomas) dados.idiomas = [];
    if (!dados.titulo_sugerido) dados.titulo_sugerido = 'Profissional de TI';
    if (!dados.senioridade_detectada) dados.senioridade_detectada = 'pleno';
    if (!dados.resumo) dados.resumo = 'Profissional com experiência em tecnologia.';

    dados.sucesso = true;

    console.log(`✅ CV processado: ${dados.skills.length} skills, ${dados.experiencias.length} experiências`);

    return res.status(200).json(dados);

  } catch (error: any) {
    console.error('Erro no processamento do CV:', error);
    return res.status(500).json({ 
      error: 'Erro ao processar CV com IA',
      details: error.message,
      sucesso: false
    });
  }
}
