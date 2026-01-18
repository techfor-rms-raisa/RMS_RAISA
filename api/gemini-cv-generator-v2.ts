/**
 * gemini-cv-generator-v2.ts - API de Geração de CV Padronizado
 * 
 * 🆕 v59.0 - NOVOS TEMPLATES:
 * - gerar_html_techfor_simples: Tabela básica de requisitos
 * - gerar_html_techfor_detalhado: Com observações e motivos de saída
 * - gerar_html_tsystems: Layout T-Systems com capa
 * 
 * FUNDO PADRÃO:
 * - Logo TechFor no canto superior direito
 * - Barra lateral vermelha
 * - Rodapé com endereço e contato
 * 
 * Versão: 59.0
 * Data: 18/01/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

// Lazy initialization
let aiInstance: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
      throw new Error('API_KEY não configurada.');
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

const GEMINI_MODEL = 'gemini-2.0-flash';

// ============================================
// HANDLER PRINCIPAL
// ============================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { action } = req.body;

    switch (action) {
      case 'extrair_dados':
        return await extrairDados(req, res);
      case 'gerar_html_techfor_simples':
        return await gerarHTMLTechforSimples(req, res);
      case 'gerar_html_techfor_detalhado':
        return await gerarHTMLTechforDetalhado(req, res);
      case 'gerar_html_tsystems':
        return await gerarHTMLTSystems(req, res);
      case 'gerar_parecer':
        return await gerarParecer(req, res);
      // Manter compatibilidade com versão anterior
      case 'gerar_html_techfor':
        return await gerarHTMLTechforSimples(req, res);
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error('❌ Erro:', error);
    return res.status(500).json({ error: error.message });
  }
}

// ============================================
// EXTRAÇÃO DE DADOS VIA GEMINI
// ============================================

async function extrairDados(req: VercelRequest, res: VercelResponse) {
  const { texto_cv, vaga_info } = req.body;

  if (!texto_cv) {
    return res.status(400).json({ error: 'texto_cv is required' });
  }

  const prompt = `Você é um especialista em análise de currículos para a consultoria Techfor.

Analise o currículo abaixo e extraia TODAS as informações para geração de um CV padronizado.

${vaga_info ? `INFORMAÇÕES DA VAGA:
Título: ${vaga_info.titulo}
Requisitos: ${vaga_info.requisitos}
` : ''}

CURRÍCULO:
"""
${texto_cv}
"""

RETORNE EXATAMENTE neste formato JSON (sem markdown):
{
  "nome": "Nome completo",
  "email": "email@exemplo.com",
  "telefone": "(XX) XXXXX-XXXX",
  "celular": "(XX) XXXXX-XXXX",
  "idade": 30,
  "estado_civil": "solteiro|casado|divorciado|viuvo|uniao_estavel",
  "cidade": "Cidade",
  "estado": "UF",
  "disponibilidade": "Imediata|15 dias|30 dias|etc",
  "modalidade_trabalho": "presencial|remoto|hibrido",
  "titulo_profissional": "Título mais adequado baseado na experiência",
  "nivel_hierarquico": "junior|pleno|senior|especialista|coordenador|gerente",
  "resumo": "Resumo profissional de 4-5 linhas destacando competências e experiência total",
  "linkedin_url": "URL ou null",
  
  "experiencias": [
    {
      "empresa": "Nome da empresa",
      "cargo": "Cargo ocupado",
      "cliente": "Nome do cliente se houver (ex: alocado em banco)",
      "data_inicio": "MM/AAAA",
      "data_fim": "MM/AAAA ou null",
      "atual": true|false,
      "descricao": "Descrição detalhada das atividades",
      "principais_atividades": ["Atividade 1", "Atividade 2"],
      "tecnologias": ["Tech1", "Tech2"],
      "motivo_saida": "Motivo da saída (se mencionado)"
    }
  ],
  
  "formacao_academica": [
    {
      "tipo": "tecnico|graduacao|pos_graduacao|mba|mestrado|doutorado",
      "curso": "Nome do curso",
      "instituicao": "Nome da instituição",
      "data_conclusao": "AAAA",
      "em_andamento": false,
      "concluido": "S|N"
    }
  ],
  
  "requisitos_match": [
    {
      "tecnologia": "Nome da tecnologia/competência",
      "tempo_experiencia": "+ X anos",
      "requerido": true,
      "atendido": true,
      "observacao": "Descrição detalhada da experiência com esta tecnologia"
    }
  ],
  
  "requisitos_desejaveis": [
    {
      "tecnologia": "Nome da tecnologia",
      "tempo_experiencia": "+ X anos",
      "atendido": true
    }
  ],
  
  "hard_skills_tabela": [
    {
      "tecnologia": "Nome da tecnologia/competência",
      "tempo_experiencia": "+ X anos"
    }
  ],
  
  "idiomas": [
    {
      "idioma": "Nome do idioma",
      "nivel": "basico|intermediario|avancado|fluente|nativo",
      "certificacao": "Nome da certificação ou null",
      "possui_certificacao": "S|N"
    }
  ],
  
  "informacoes_adicionais": ["Info 1", "Info 2"]
}

REGRAS:
1. Extraia TODAS as tecnologias mencionadas
2. Experiências em ordem cronológica reversa (mais recente primeiro)
3. Inclua motivo_saida se mencionado no CV
4. Detecte o nível hierárquico baseado nos cargos
5. O resumo deve ser impactante e profissional
6. Retorne JSON válido, sem backticks ou markdown`;

  try {
    const result = await getAI().models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    const responseText = result.text || '';
    const cleanJson = responseText.replace(/```json\n?|\n?```/g, '').trim();
    const dados = JSON.parse(cleanJson);

    return res.status(200).json({ sucesso: true, dados });
  } catch (error: any) {
    console.error('Erro na extração:', error);
    return res.status(500).json({ error: error.message });
  }
}

// ============================================
// CSS BASE COMUM
// ============================================

const CSS_BASE = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { 
    font-family: Arial, sans-serif; 
    font-size: 10pt;
    line-height: 1.4;
    color: #333;
    background: #fff;
  }
  .page {
    position: relative;
    width: 210mm;
    min-height: 297mm;
    padding: 15mm 20mm 25mm 25mm;
    background: #fff;
  }
  /* Fundo TechFor */
  .fundo-techfor {
    position: relative;
  }
  .fundo-techfor::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 8mm;
    background: linear-gradient(180deg, #a31621 0%, #E31837 100%);
  }
  .logo-techfor {
    position: absolute;
    top: 10mm;
    right: 15mm;
    width: 80px;
    height: auto;
  }
  .rodape-techfor {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 5mm 20mm;
    text-align: center;
    font-size: 8pt;
    color: #666;
    border-top: 1px solid #ddd;
    background: #fff;
  }
  .rodape-techfor .telefone {
    color: #E31837;
    font-weight: bold;
  }
  h1 { font-size: 14pt; color: #E31837; margin-bottom: 10px; }
  h2 { font-size: 11pt; color: #333; margin: 15px 0 8px; border-bottom: 1px solid #E31837; padding-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  th, td { padding: 6px 8px; text-align: left; border: 1px solid #ddd; font-size: 9pt; }
  th { background: #FFF3CD; font-weight: bold; }
  .secao { margin-bottom: 15px; }
  .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 5px; margin-bottom: 10px; }
  .info-item { font-size: 9pt; }
  .info-label { font-weight: bold; color: #666; }
  .parecer { background: #f9f9f9; padding: 10px; border-radius: 5px; font-size: 9pt; line-height: 1.5; }
  .experiencia { margin-bottom: 12px; page-break-inside: avoid; }
  .exp-header { display: flex; justify-content: space-between; margin-bottom: 5px; }
  .exp-empresa { font-weight: bold; color: #E31837; }
  .exp-periodo { color: #666; font-size: 9pt; }
  .exp-cargo { font-weight: bold; margin-bottom: 5px; }
  .exp-atividades { font-size: 9pt; margin-left: 15px; }
  .exp-atividades li { margin-bottom: 3px; }
  .motivo-saida { background: #f5f0ff; padding: 5px 10px; margin-top: 5px; border-left: 3px solid #7c3aed; font-size: 8pt; color: #5b21b6; }
  .obs-cell { font-size: 8pt; color: #555; max-width: 300px; }
  @media print {
    .page { padding: 10mm 15mm 20mm 20mm; }
    .rodape-techfor { position: fixed; bottom: 0; }
  }
`;

// ============================================
// LOGO TECHFOR (Base64 SVG simplificado)
// ============================================

const LOGO_TECHFOR_SVG = `<svg width="100" height="40" viewBox="0 0 100 40" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="20" r="10" fill="#E31837"/>
  <text x="25" y="25" font-family="Arial" font-size="16" font-weight="bold">
    <tspan fill="#333">Tech</tspan><tspan fill="#E31837">For</tspan>
  </text>
  <text x="25" y="35" font-family="Arial" font-size="6" fill="#666">Soluções em TI</text>
</svg>`;

const LOGO_TECHFOR_BASE64 = `data:image/svg+xml;base64,${Buffer.from(LOGO_TECHFOR_SVG).toString('base64')}`;

// ============================================
// TEMPLATE TECHFOR SIMPLES
// ============================================

async function gerarHTMLTechforSimples(req: VercelRequest, res: VercelResponse) {
  const { dados } = req.body;

  if (!dados) {
    return res.status(400).json({ error: 'dados is required' });
  }

  const estadoCivilLabel = {
    'solteiro': 'Solteiro(a)',
    'casado': 'Casado(a)',
    'divorciado': 'Divorciado(a)',
    'viuvo': 'Viúvo(a)',
    'uniao_estavel': 'União Estável'
  };

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>CV - ${dados.nome}</title>
  <style>${CSS_BASE}</style>
</head>
<body>
  <div class="page fundo-techfor">
    <img src="${LOGO_TECHFOR_BASE64}" alt="TechFor" class="logo-techfor">
    
    <!-- Header -->
    <h1>${dados.titulo_vaga || dados.titulo_profissional || 'PROFISSIONAL DE TI'}</h1>
    
    <div class="info-grid">
      <div class="info-item"><span class="info-label">Nome:</span> ${dados.nome}</div>
      <div class="info-item"><span class="info-label">Idade:</span> ${dados.idade || '-'} anos</div>
      <div class="info-item"><span class="info-label">Estado Civil:</span> ${estadoCivilLabel[dados.estado_civil] || dados.estado_civil || '-'}</div>
      <div class="info-item"><span class="info-label">Disponibilidade:</span> ${dados.disponibilidade || 'Imediato'}</div>
      <div class="info-item"><span class="info-label">Cidade:</span> ${dados.cidade || '-'} / ${dados.estado || '-'}</div>
      <div class="info-item"><span class="info-label">Gestor/Cliente:</span> ${dados.gestor_destino || '-'}/${dados.cliente_destino || '-'}</div>
    </div>

    <!-- Parecer de Seleção -->
    <div class="secao">
      <h2>Parecer Seleção</h2>
      <div class="parecer">${(dados.parecer_selecao || '').replace(/\n/g, '<br>')}</div>
    </div>

    <!-- Requisitos Mandatórios -->
    ${(dados.requisitos_match && dados.requisitos_match.length > 0) ? `
    <div class="secao">
      <h2>Requisitos Mandatórios</h2>
      <table>
        <thead>
          <tr>
            <th style="width: 60%">Tecnologia</th>
            <th style="width: 40%">Tempo de Experiência</th>
          </tr>
        </thead>
        <tbody>
          ${dados.requisitos_match.map((req: any) => `
          <tr>
            <td>${req.tecnologia}</td>
            <td>${req.tempo_experiencia || '-'}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <!-- Requisitos Desejáveis -->
    ${(dados.requisitos_desejaveis && dados.requisitos_desejaveis.length > 0) ? `
    <div class="secao">
      <h2>Requisitos Desejáveis</h2>
      <table>
        <thead>
          <tr>
            <th style="width: 60%">Tecnologia</th>
            <th style="width: 40%">Tempo de Experiência</th>
          </tr>
        </thead>
        <tbody>
          ${dados.requisitos_desejaveis.map((req: any) => `
          <tr>
            <td>${req.tecnologia}</td>
            <td>${req.tempo_experiencia || '-'}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <!-- Formação Acadêmica -->
    ${(dados.formacao_academica && dados.formacao_academica.length > 0) ? `
    <div class="secao">
      <h2>Formação Acadêmica</h2>
      <table>
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Curso</th>
            <th>Instituição</th>
            <th>Concluído?</th>
            <th>Ano</th>
          </tr>
        </thead>
        <tbody>
          ${dados.formacao_academica.map((f: any) => `
          <tr>
            <td>${f.tipo || '-'}</td>
            <td>${f.curso}</td>
            <td>${f.instituicao}</td>
            <td>${f.concluido || (f.em_andamento ? 'N' : 'S')}</td>
            <td>${f.data_conclusao || '-'}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <!-- Idiomas -->
    ${(dados.idiomas && dados.idiomas.length > 0) ? `
    <div class="secao">
      <h2>Idiomas</h2>
      <table>
        <thead>
          <tr>
            <th>Idioma</th>
            <th>Nível</th>
            <th>Certificação?</th>
          </tr>
        </thead>
        <tbody>
          ${dados.idiomas.map((i: any) => `
          <tr>
            <td>${i.idioma}</td>
            <td>${i.nivel}</td>
            <td>${i.possui_certificacao || 'N'}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <!-- Histórico Profissional -->
    ${(dados.experiencias && dados.experiencias.length > 0) ? `
    <div class="secao">
      <h2>Histórico Profissional</h2>
      ${dados.experiencias.map((exp: any) => `
      <div class="experiencia">
        <div class="exp-header">
          <span class="exp-empresa">${exp.empresa}${exp.cliente ? ` (Cliente: ${exp.cliente})` : ''}</span>
          <span class="exp-periodo">${exp.data_inicio} - ${exp.atual ? 'Atual' : exp.data_fim || '-'}</span>
        </div>
        <div class="exp-cargo">${exp.cargo}</div>
        ${exp.principais_atividades && exp.principais_atividades.length > 0 ? `
        <div style="font-size: 9pt; font-weight: bold; margin-top: 5px;">Principais Atividades:</div>
        <ul class="exp-atividades">
          ${exp.principais_atividades.map((a: string) => `<li>${a}</li>`).join('')}
        </ul>
        ` : ''}
      </div>
      `).join('')}
    </div>
    ` : ''}

    <!-- Recomendação -->
    ${dados.recomendacao_final ? `
    <div class="secao">
      <div class="parecer" style="background: #e8f5e9; border-left: 3px solid #4caf50;">
        ${dados.recomendacao_final}
      </div>
    </div>
    ` : ''}
  </div>

  <!-- Rodapé -->
  <div class="rodape-techfor">
    Avenida Paulista, 1.765 - 7º andar - Conjunto 72 - Bela Vista - São Paulo - SP - Cep 01311-930<br>
    <span class="telefone">(11) 3138-5800</span> - www.techforti.com.br
  </div>
</body>
</html>`;

  return res.status(200).json({ html });
}

// ============================================
// TEMPLATE TECHFOR DETALHADO (COM OBSERVAÇÕES E MOTIVOS)
// ============================================

async function gerarHTMLTechforDetalhado(req: VercelRequest, res: VercelResponse) {
  const { dados } = req.body;

  if (!dados) {
    return res.status(400).json({ error: 'dados is required' });
  }

  const estadoCivilLabel = {
    'solteiro': 'Solteiro(a)',
    'casado': 'Casado(a)',
    'divorciado': 'Divorciado(a)',
    'viuvo': 'Viúvo(a)',
    'uniao_estavel': 'União Estável'
  };

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>CV Detalhado - ${dados.nome}</title>
  <style>
    ${CSS_BASE}
    /* Estilos específicos para template detalhado */
    .obs-cell {
      font-size: 8pt;
      color: #444;
      line-height: 1.4;
      padding: 8px;
      background: #fafafa;
    }
    .motivo-saida {
      background: #f3e8ff;
      border-left: 3px solid #9333ea;
      padding: 8px 12px;
      margin-top: 8px;
      font-size: 9pt;
      color: #6b21a8;
    }
    .motivo-saida strong {
      color: #581c87;
    }
    .tabela-detalhada th {
      background: #fef3c7;
      font-size: 9pt;
    }
    .tabela-detalhada td {
      vertical-align: top;
    }
  </style>
</head>
<body>
  <div class="page fundo-techfor">
    <img src="${LOGO_TECHFOR_BASE64}" alt="TechFor" class="logo-techfor">
    
    <!-- Header -->
    <h1>${dados.titulo_vaga || dados.titulo_profissional || 'PROFISSIONAL DE TI'}</h1>
    
    <div class="info-grid">
      <div class="info-item"><span class="info-label">Nome:</span> ${dados.nome}</div>
      <div class="info-item"><span class="info-label">Idade:</span> ${dados.idade || '-'} anos</div>
      <div class="info-item"><span class="info-label">Estado Civil:</span> ${estadoCivilLabel[dados.estado_civil] || dados.estado_civil || '-'}</div>
      <div class="info-item"><span class="info-label">Disponibilidade:</span> ${dados.disponibilidade || 'Imediato'}</div>
      <div class="info-item"><span class="info-label">Cidade:</span> ${dados.cidade || '-'} / ${dados.estado || '-'}</div>
      <div class="info-item"><span class="info-label">Gestor/Cliente:</span> ${dados.gestor_destino || '-'}/${dados.cliente_destino || '-'}</div>
    </div>

    <!-- Parecer de Seleção -->
    <div class="secao">
      <h2>Parecer Seleção</h2>
      <div class="parecer">${(dados.parecer_selecao || '').replace(/\n/g, '<br>')}</div>
    </div>

    <!-- Requisitos Mandatórios COM OBSERVAÇÃO -->
    ${(dados.requisitos_match && dados.requisitos_match.length > 0) ? `
    <div class="secao">
      <h2>Requisitos Mandatórios</h2>
      <table class="tabela-detalhada">
        <thead>
          <tr>
            <th style="width: 25%">Tecnologia</th>
            <th style="width: 15%">Tempo de Experiência</th>
            <th style="width: 60%">Observação</th>
          </tr>
        </thead>
        <tbody>
          ${dados.requisitos_match.map((req: any) => `
          <tr>
            <td>${req.tecnologia}</td>
            <td>${req.tempo_experiencia || '-'}</td>
            <td class="obs-cell">${(req.observacao || '-').replace(/\n/g, '<br>')}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <!-- Requisitos Desejáveis -->
    ${(dados.requisitos_desejaveis && dados.requisitos_desejaveis.length > 0) ? `
    <div class="secao">
      <h2>Requisitos Desejáveis</h2>
      <table>
        <thead>
          <tr>
            <th style="width: 60%">Tecnologia</th>
            <th style="width: 40%">Tempo de Experiência</th>
          </tr>
        </thead>
        <tbody>
          ${dados.requisitos_desejaveis.map((req: any) => `
          <tr>
            <td>${req.tecnologia}</td>
            <td>${req.tempo_experiencia || '-'}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <!-- Formação Acadêmica -->
    ${(dados.formacao_academica && dados.formacao_academica.length > 0) ? `
    <div class="secao">
      <h2>Formação Acadêmica</h2>
      <table>
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Curso</th>
            <th>Instituição</th>
            <th>Concluído?</th>
            <th>Ano</th>
          </tr>
        </thead>
        <tbody>
          ${dados.formacao_academica.map((f: any) => `
          <tr>
            <td>${f.tipo || '-'}</td>
            <td>${f.curso}</td>
            <td>${f.instituicao}</td>
            <td>${f.concluido || (f.em_andamento ? 'N' : 'S')}</td>
            <td>${f.data_conclusao || '-'}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <!-- Idiomas -->
    ${(dados.idiomas && dados.idiomas.length > 0) ? `
    <div class="secao">
      <h2>Idiomas</h2>
      <table>
        <thead>
          <tr>
            <th>Idioma</th>
            <th>Nível</th>
            <th>Certificação?</th>
          </tr>
        </thead>
        <tbody>
          ${dados.idiomas.map((i: any) => `
          <tr>
            <td>${i.idioma}</td>
            <td>${i.nivel}</td>
            <td>${i.possui_certificacao || 'N'}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <!-- Histórico Profissional COM MOTIVO DE SAÍDA -->
    ${(dados.experiencias && dados.experiencias.length > 0) ? `
    <div class="secao">
      <h2>Histórico Profissional</h2>
      ${dados.experiencias.map((exp: any) => `
      <div class="experiencia">
        <div class="exp-header">
          <span class="exp-empresa">${exp.empresa}${exp.cliente ? ` (Cliente: ${exp.cliente})` : ''}</span>
          <span class="exp-periodo">${exp.data_inicio} - ${exp.atual ? 'Atual' : exp.data_fim || '-'}</span>
        </div>
        <div class="exp-cargo">${exp.cargo}</div>
        ${exp.principais_atividades && exp.principais_atividades.length > 0 ? `
        <div style="font-size: 9pt; font-weight: bold; margin-top: 5px;">Principais Atividades:</div>
        <ul class="exp-atividades">
          ${exp.principais_atividades.map((a: string) => `<li>${a}</li>`).join('')}
        </ul>
        ` : ''}
        ${(!exp.atual && exp.motivo_saida) ? `
        <div class="motivo-saida">
          <strong>Motivo de saída:</strong> ${exp.motivo_saida}
        </div>
        ` : ''}
      </div>
      `).join('')}
    </div>
    ` : ''}

    <!-- Recomendação -->
    ${dados.recomendacao_final ? `
    <div class="secao">
      <div class="parecer" style="background: #e8f5e9; border-left: 3px solid #4caf50;">
        ${dados.recomendacao_final}
      </div>
    </div>
    ` : ''}

    <!-- Status de processos -->
    ${(dados.participando_outros_processos !== undefined || dados.participando_processo_cliente !== undefined) ? `
    <div class="secao" style="font-size: 9pt; color: #666;">
      ${dados.participando_outros_processos ? '✓ Está participando de processos seletivos no mercado.<br>' : ''}
      ${dados.participando_processo_cliente === false ? `✓ Não está participando de processo na empresa ${dados.cliente_destino || 'cliente'} e/ou através de seu R&S ou de outra consultoria.` : ''}
    </div>
    ` : ''}
  </div>

  <!-- Rodapé -->
  <div class="rodape-techfor">
    Avenida Paulista, 1.765 - 7º andar - Conjunto 72 - Bela Vista - São Paulo - SP - Cep 01311-930<br>
    <span class="telefone">(11) 3138-5800</span> - www.techforti.com.br
  </div>
</body>
</html>`;

  return res.status(200).json({ html });
}

// ============================================
// TEMPLATE T-SYSTEMS (com capa)
// ============================================

async function gerarHTMLTSystems(req: VercelRequest, res: VercelResponse) {
  const { dados } = req.body;

  if (!dados) {
    return res.status(400).json({ error: 'dados is required' });
  }

  // CSS específico T-Systems
  const CSS_TSYSTEMS = `
    ${CSS_BASE}
    body { font-family: Calibri, Arial, sans-serif; }
    .page-tsystems {
      position: relative;
      width: 210mm;
      min-height: 297mm;
      padding: 20mm;
      background: #fff;
    }
    .header-tsystems {
      border-bottom: 4px solid #E20074;
      padding-bottom: 15px;
      margin-bottom: 20px;
    }
    .header-tsystems h1 {
      color: #E20074;
      font-size: 18pt;
      margin-bottom: 10px;
    }
    .header-tsystems .subtitulo {
      color: #666;
      font-size: 12pt;
    }
    h2 { color: #E20074; border-bottom: 2px solid #E20074; }
    th { background: #E20074; color: white; }
    .capa-tsystems {
      width: 210mm;
      height: 297mm;
      background: linear-gradient(135deg, #E20074 0%, #b8005c 100%);
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      color: white;
      text-align: center;
      page-break-after: always;
    }
    .capa-titulo {
      font-size: 28pt;
      font-weight: bold;
      margin-bottom: 20px;
    }
    .capa-nome {
      font-size: 24pt;
      margin-bottom: 30px;
    }
    .capa-info {
      font-size: 14pt;
      opacity: 0.9;
    }
  `;

  // Gerar capa
  const htmlCapa = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Capa CV - ${dados.nome}</title>
  <style>${CSS_TSYSTEMS}</style>
</head>
<body>
  <div class="capa-tsystems">
    <div class="capa-titulo">CURRÍCULO PROFISSIONAL</div>
    <div class="capa-nome">${dados.nome}</div>
    <div class="capa-info">
      ${dados.titulo_profissional || dados.titulo_vaga || 'Profissional de TI'}<br><br>
      ${dados.cidade ? `${dados.cidade} - ${dados.estado}` : ''}
    </div>
  </div>
</body>
</html>`;

  // Gerar conteúdo
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>CV T-Systems - ${dados.nome}</title>
  <style>${CSS_TSYSTEMS}</style>
</head>
<body>
  <div class="page-tsystems">
    <div class="header-tsystems">
      <h1>${dados.titulo_profissional || dados.titulo_vaga || 'PROFISSIONAL DE TI'}</h1>
      <div class="subtitulo">${dados.nome}</div>
    </div>

    <!-- Dados Pessoais -->
    <div class="secao">
      <h2>Dados Pessoais</h2>
      <div class="info-grid">
        <div class="info-item"><span class="info-label">Cidade:</span> ${dados.cidade || '-'} / ${dados.estado || '-'}</div>
        <div class="info-item"><span class="info-label">Disponibilidade:</span> ${dados.disponibilidade || 'Imediato'}</div>
      </div>
    </div>

    <!-- Hard Skills -->
    ${(dados.hard_skills_tabela && dados.hard_skills_tabela.length > 0) ? `
    <div class="secao">
      <h2>Competências Técnicas</h2>
      <table>
        <thead>
          <tr>
            <th>Tecnologia</th>
            <th>Tempo de Experiência</th>
          </tr>
        </thead>
        <tbody>
          ${dados.hard_skills_tabela.map((skill: any) => `
          <tr>
            <td>${skill.tecnologia}</td>
            <td>${skill.tempo_experiencia || '-'}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <!-- Experiência Profissional -->
    ${(dados.experiencias && dados.experiencias.length > 0) ? `
    <div class="secao">
      <h2>Experiência Profissional</h2>
      ${dados.experiencias.map((exp: any) => `
      <div class="experiencia">
        <div class="exp-header">
          <span class="exp-empresa">${exp.empresa}</span>
          <span class="exp-periodo">${exp.data_inicio} - ${exp.atual ? 'Atual' : exp.data_fim || '-'}</span>
        </div>
        <div class="exp-cargo">${exp.cargo}</div>
        ${exp.principais_atividades && exp.principais_atividades.length > 0 ? `
        <ul class="exp-atividades">
          ${exp.principais_atividades.map((a: string) => `<li>${a}</li>`).join('')}
        </ul>
        ` : ''}
      </div>
      `).join('')}
    </div>
    ` : ''}

    <!-- Formação -->
    ${(dados.formacao_academica && dados.formacao_academica.length > 0) ? `
    <div class="secao">
      <h2>Formação Acadêmica</h2>
      <table>
        <thead>
          <tr>
            <th>Curso</th>
            <th>Instituição</th>
            <th>Conclusão</th>
          </tr>
        </thead>
        <tbody>
          ${dados.formacao_academica.map((f: any) => `
          <tr>
            <td>${f.curso}</td>
            <td>${f.instituicao}</td>
            <td>${f.data_conclusao || '-'}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <!-- Idiomas -->
    ${(dados.idiomas && dados.idiomas.length > 0) ? `
    <div class="secao">
      <h2>Idiomas</h2>
      <table>
        <thead>
          <tr>
            <th>Idioma</th>
            <th>Nível</th>
          </tr>
        </thead>
        <tbody>
          ${dados.idiomas.map((i: any) => `
          <tr>
            <td>${i.idioma}</td>
            <td>${i.nivel}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <!-- Recomendação -->
    ${dados.recomendacao_final ? `
    <div class="secao">
      <div class="parecer" style="border-left: 3px solid #E20074;">
        ${dados.recomendacao_final}
      </div>
    </div>
    ` : ''}
  </div>
</body>
</html>`;

  return res.status(200).json({ html, html_capa: htmlCapa });
}

// ============================================
// GERAR PARECER VIA IA
// ============================================

async function gerarParecer(req: VercelRequest, res: VercelResponse) {
  const { dados, vaga_info } = req.body;

  const prompt = `Gere um parecer de seleção profissional para o candidato abaixo.

CANDIDATO:
Nome: ${dados.nome}
Título: ${dados.titulo_profissional}
Experiência total: ${dados.experiencias?.length || 0} empresas

VAGA:
${vaga_info?.titulo || 'Não especificada'}
${vaga_info?.requisitos || ''}

ESTRUTURA DO PARECER:
1. Primeiro parágrafo: anos de experiência e segmentos de atuação
2. Segundo parágrafo: principais competências técnicas
3. Terceiro parágrafo: impressões da entrevista (se aplicável)
4. Quarto parágrafo: dados pessoais (nacionalidade, estado civil, idade, cidade)
5. Último parágrafo: recomendação formal

Escreva de forma profissional e objetiva, em português do Brasil.`;

  try {
    const result = await getAI().models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    return res.status(200).json({ 
      parecer: result.text || '',
      sucesso: true
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
