/**
 * gemini-cv-generator-v2.ts - API de Geração de CV Padronizado
 * 
 * Templates implementados:
 * - Techfor Padrão (vermelho)
 * - T-Systems (magenta com capa)
 * 
 * Versão: 2.0
 * Data: 26/12/2024
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

// Lazy initialization para garantir que a variável de ambiente esteja disponível
let aiInstance: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY || '';
    
    if (!apiKey) {
      console.error('❌ API_KEY (Gemini) não encontrada!');
      throw new Error('API_KEY não configurada.');
    }
    
    console.log('✅ API_KEY carregada para CV Generator');
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

const GEMINI_MODEL = 'gemini-2.0-flash';

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
      case 'gerar_html_techfor':
        return await gerarHTMLTechfor(req, res);
      case 'gerar_html_tsystems':
        return await gerarHTMLTSystems(req, res);
      case 'gerar_parecer':
        return await gerarParecer(req, res);
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error('❌ Erro:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Extrai dados do CV usando Gemini - Versão 2.0 com campos Techfor
 */
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
      "em_andamento": false
    }
  ],
  
  "formacao_complementar": [
    {
      "nome": "Nome da certificação/curso",
      "instituicao": "Instituição",
      "ano_conclusao": "AAAA"
    }
  ],
  
  "hard_skills_tabela": [
    {
      "tecnologia": "Nome da tecnologia/competência",
      "tempo_experiencia": "+ X anos"
    }
  ],
  
  "habilidades": [
    {
      "nome": "Nome da skill",
      "nivel": "basico|intermediario|avancado|especialista",
      "categoria": "linguagem|framework|banco|cloud|ferramenta|metodologia",
      "anos_experiencia": 0
    }
  ],
  
  "idiomas": [
    {
      "idioma": "Nome do idioma",
      "nivel": "basico|intermediario|avancado|fluente|nativo",
      "certificacao": "Nome da certificação ou null"
    }
  ],
  
  "informacoes_adicionais": ["Info 1", "Info 2"]
}

REGRAS:
1. Extraia TODAS as tecnologias mencionadas para hard_skills_tabela
2. Experiências em ordem cronológica reversa
3. Inclua motivo_saida se mencionado
4. Detecte o nível hierárquico baseado nos cargos
5. O resumo deve ser impactante e profissional
6. Se não encontrar, use null ou []`;

  try {
    const result = await getAI().models.generateContent({ 
      model: GEMINI_MODEL, 
      contents: prompt 
    });
    let text = (result.text || '').replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

    let dados;
    try {
      dados = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) dados = JSON.parse(match[0]);
      else throw new Error('JSON inválido');
    }

    return res.status(200).json(dados);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Gera parecer de seleção usando IA
 */
async function gerarParecer(req: VercelRequest, res: VercelResponse) {
  const { dados, vaga_info } = req.body;

  const prompt = `Você é um recrutador sênior da Techfor escrevendo um parecer de seleção.

DADOS DO CANDIDATO:
Nome: ${dados.nome}
Título: ${dados.titulo_profissional}
Experiência total: ${dados.experiencias?.length || 0} empresas
Skills principais: ${dados.hard_skills_tabela?.slice(0, 10).map((s: any) => s.tecnologia).join(', ')}

${vaga_info ? `VAGA:
Título: ${vaga_info.titulo}
Cliente: ${vaga_info.cliente}
Requisitos: ${vaga_info.requisitos}
` : ''}

Escreva um parecer de seleção profissional com:
1. Resumo da experiência do profissional (tempo na área, segmentos)
2. Competências técnicas principais
3. Destaque de realizações nas últimas empresas
4. Avaliação comportamental (se possível inferir)
5. Dados pessoais resumidos (brasileiro, idade, estado civil, cidade)
6. Recomendação final

Use linguagem formal e profissional. O parecer deve ter 3-4 parágrafos.

Retorne APENAS o texto do parecer, sem formatação JSON.`;

  try {
    const result = await getAI().models.generateContent({ 
      model: GEMINI_MODEL, 
      contents: prompt 
    });
    const parecer = result.text || '';

    return res.status(200).json({ parecer });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Gera HTML no template Techfor
 */
async function gerarHTMLTechfor(req: VercelRequest, res: VercelResponse) {
  const { dados, config } = req.body;

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CV - ${dados.nome}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.4;
      color: #333;
      background: #fff;
    }
    
    .page {
      max-width: 210mm;
      margin: 0 auto;
      padding: 15mm 20mm;
    }
    
    /* Header com Logo */
    .header-logo {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 10px;
    }
    
    .header-logo img {
      height: 40px;
    }
    
    /* Título da Vaga */
    .titulo-vaga {
      text-align: center;
      font-size: 16pt;
      font-weight: bold;
      color: #E31837;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 2px solid #E31837;
    }
    
    /* Dados Pessoais - Tabela */
    .dados-pessoais {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 5px 20px;
      margin-bottom: 20px;
      font-size: 10pt;
    }
    
    .dados-pessoais .item {
      display: flex;
    }
    
    .dados-pessoais .label {
      font-weight: bold;
      min-width: 120px;
    }
    
    /* Seções */
    .secao {
      margin-bottom: 15px;
    }
    
    .secao-titulo {
      font-size: 11pt;
      font-weight: bold;
      color: #E31837;
      border-bottom: 1px solid #E31837;
      padding-bottom: 3px;
      margin-bottom: 10px;
    }
    
    /* Parecer de Seleção */
    .parecer {
      text-align: justify;
      margin-bottom: 15px;
    }
    
    .parecer p {
      margin-bottom: 8px;
    }
    
    /* Tabela de Requisitos */
    .tabela-requisitos {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
      font-size: 9pt;
    }
    
    .tabela-requisitos th {
      background: #FFF3CD;
      border: 1px solid #ddd;
      padding: 6px 8px;
      text-align: left;
      font-weight: bold;
    }
    
    .tabela-requisitos td {
      border: 1px solid #ddd;
      padding: 6px 8px;
      vertical-align: top;
    }
    
    .tabela-requisitos tr:nth-child(even) td {
      background: #f9f9f9;
    }
    
    /* Tabela de Hard Skills */
    .tabela-skills {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
      font-size: 9pt;
    }
    
    .tabela-skills th {
      background: #E31837;
      color: white;
      border: 1px solid #c41230;
      padding: 6px 8px;
      text-align: left;
    }
    
    .tabela-skills td {
      border: 1px solid #ddd;
      padding: 5px 8px;
    }
    
    .tabela-skills tr:nth-child(even) td {
      background: #f9f9f9;
    }
    
    /* Formação */
    .tabela-formacao {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10px;
      font-size: 9pt;
    }
    
    .tabela-formacao th {
      background: #f0f0f0;
      border: 1px solid #ddd;
      padding: 5px 8px;
      text-align: left;
    }
    
    .tabela-formacao td {
      border: 1px solid #ddd;
      padding: 5px 8px;
    }
    
    /* Experiência */
    .experiencia-item {
      margin-bottom: 12px;
      padding-bottom: 10px;
      border-bottom: 1px dotted #ccc;
    }
    
    .experiencia-item:last-child {
      border-bottom: none;
    }
    
    .exp-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 3px;
    }
    
    .exp-empresa {
      font-weight: bold;
      color: #E31837;
    }
    
    .exp-periodo {
      font-size: 9pt;
      color: #666;
    }
    
    .exp-cargo {
      font-weight: bold;
      font-size: 10pt;
    }
    
    .exp-atividades {
      font-size: 9pt;
      margin-top: 5px;
    }
    
    .exp-motivo {
      font-size: 9pt;
      font-style: italic;
      color: #666;
      margin-top: 5px;
    }
    
    /* Recomendação */
    .recomendacao {
      background: #f9f9f9;
      border-left: 4px solid #E31837;
      padding: 10px 15px;
      margin: 15px 0;
      font-style: italic;
    }
    
    /* Rodapé */
    .rodape {
      margin-top: 20px;
      padding-top: 10px;
      border-top: 1px solid #E31837;
      text-align: center;
      font-size: 8pt;
      color: #666;
    }
    
    /* Print */
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { padding: 10mm 15mm; }
    }
  </style>
</head>
<body>
  <div class="page">
    <!-- Logo Techfor -->
    <div class="header-logo">
      <img src="https://www.techforti.com.br/wp-content/uploads/2023/03/logo-techfor.png" alt="TechFor" onerror="this.style.display='none'">
    </div>
    
    <!-- Título da Vaga -->
    <div class="titulo-vaga">
      ${dados.titulo_vaga || dados.titulo_profissional || 'Profissional de TI'}${dados.codigo_vaga ? ` - ${dados.codigo_vaga}` : ''}
    </div>
    
    <!-- Dados Pessoais -->
    <div class="dados-pessoais">
      <div class="item"><span class="label">Nome:</span> ${dados.nome}</div>
      <div class="item"><span class="label">Idade:</span> ${dados.idade ? dados.idade + ' anos' : '-'}</div>
      <div class="item"><span class="label">Estado Civil:</span> ${formatarEstadoCivil(dados.estado_civil)}</div>
      <div class="item"><span class="label">Disponibilidade:</span> ${dados.disponibilidade || 'A combinar'}</div>
      <div class="item"><span class="label">Cidade:</span> ${[dados.cidade, dados.estado].filter(Boolean).join(' / ') || '-'}</div>
      <div class="item"><span class="label">Gestor/Cliente:</span> ${[dados.gestor_destino, dados.cliente_destino].filter(Boolean).join(' / ') || '-'}</div>
    </div>
    
    <!-- Parecer de Seleção -->
    ${dados.parecer_selecao ? `
    <div class="secao">
      <div class="secao-titulo">Parecer Seleção</div>
      <div class="parecer">
        ${dados.parecer_selecao.split('\n').map((p: string) => `<p>${p}</p>`).join('')}
      </div>
    </div>
    ` : ''}
    
    <!-- Requisitos Match -->
    ${dados.requisitos_match && dados.requisitos_match.length > 0 ? `
    <div class="secao">
      <div class="secao-titulo">REQUISITOS:</div>
      <table class="tabela-requisitos">
        <thead>
          <tr>
            <th style="width: 40%">Tecnologia</th>
            <th style="width: 15%">Tempo de Experiência/Anos</th>
            <th style="width: 45%">Observação</th>
          </tr>
        </thead>
        <tbody>
          ${dados.requisitos_match.map((r: any) => `
          <tr>
            <td>${r.tecnologia}</td>
            <td>${r.tempo_experiencia}</td>
            <td>${r.observacao}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}
    
    <!-- Hard Skills Tabela -->
    ${dados.hard_skills_tabela && dados.hard_skills_tabela.length > 0 ? `
    <div class="secao">
      <div class="secao-titulo">Hard Skills</div>
      <table class="tabela-skills">
        <thead>
          <tr>
            <th>Tecnologia</th>
            <th>Tempo de Experiência</th>
          </tr>
        </thead>
        <tbody>
          ${dados.hard_skills_tabela.map((s: any) => `
          <tr>
            <td>${s.tecnologia}</td>
            <td>${s.tempo_experiencia}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}
    
    <!-- Recomendação -->
    ${dados.recomendacao_final ? `
    <div class="recomendacao">
      ${dados.recomendacao_final}
    </div>
    ` : `
    <div class="recomendacao">
      Recomendamos o(a) <strong>${dados.nome.split(' ')[0]}</strong>, pois demonstrou ser um(a) profissional com experiência considerável nas principais tecnologias solicitadas para a posição supracitada.
    </div>
    `}
    
    <p style="font-size: 9pt; margin-bottom: 5px;"><strong>Disponibilidade:</strong> ${dados.disponibilidade || 'A combinar'}</p>
    <p style="font-size: 9pt; margin-bottom: 15px;">Não está participando de processo na empresa ${dados.cliente_destino || 'cliente'} e/ou através de seu R&S ou de outra consultoria.</p>
    
    <!-- Formação Acadêmica -->
    ${dados.formacao_academica && dados.formacao_academica.length > 0 ? `
    <div class="secao">
      <div class="secao-titulo">Formação Acadêmica</div>
      <table class="tabela-formacao">
        <tbody>
          ${dados.formacao_academica.map((f: any) => `
          <tr>
            <td><strong>${f.instituicao}</strong> – ${f.data_inicio || ''} a ${f.data_conclusao || (f.em_andamento ? 'Em andamento' : '')}</td>
          </tr>
          <tr>
            <td>${f.curso}${f.tipo ? ` (${formatarTipoFormacao(f.tipo)})` : ''}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}
    
    <!-- Formação Complementar -->
    ${dados.formacao_complementar && dados.formacao_complementar.length > 0 ? `
    <div class="secao">
      <div class="secao-titulo">Formação Complementar (Cursos livres)</div>
      <table class="tabela-formacao">
        <thead>
          <tr>
            <th>Curso</th>
            <th>Instituição</th>
            <th>Concluído?</th>
            <th>Ano</th>
          </tr>
        </thead>
        <tbody>
          ${dados.formacao_complementar.map((f: any) => `
          <tr>
            <td>${f.nome}</td>
            <td>${f.instituicao}</td>
            <td>Sim</td>
            <td>${f.ano_conclusao || '-'}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}
    
    <!-- Idiomas -->
    ${dados.idiomas && dados.idiomas.length > 0 ? `
    <div class="secao">
      <div class="secao-titulo">Idiomas</div>
      <table class="tabela-formacao">
        <thead>
          <tr>
            <th>Descrição</th>
            <th>Nível</th>
            <th>Certificação?</th>
            <th>Instituição</th>
          </tr>
        </thead>
        <tbody>
          ${dados.idiomas.map((i: any) => `
          <tr>
            <td>${i.idioma}</td>
            <td>${formatarNivelIdioma(i.nivel)}</td>
            <td>${i.certificacao ? 'S' : 'N'}</td>
            <td>${i.instituicao || 'N'}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}
    
    <!-- Histórico Profissional -->
    ${dados.experiencias && dados.experiencias.length > 0 ? `
    <div class="secao">
      <div class="secao-titulo">Histórico Profissional</div>
      ${dados.experiencias.map((exp: any) => `
      <div class="experiencia-item">
        <div class="exp-header">
          <span class="exp-empresa">${exp.empresa}${exp.cliente ? ` (${exp.cliente})` : ''}</span>
          <span class="exp-periodo">${exp.data_inicio} a ${exp.atual ? 'Atual' : exp.data_fim || ''}</span>
        </div>
        <div class="exp-cargo">${exp.cargo}</div>
        ${exp.descricao ? `<div class="exp-atividades"><strong>Principais atividades:</strong> ${exp.descricao}</div>` : ''}
        ${exp.tecnologias && exp.tecnologias.length > 0 ? `<div class="exp-atividades"><strong>Tecnologias utilizadas:</strong> ${exp.tecnologias.join(', ')}</div>` : ''}
        ${exp.motivo_saida ? `<div class="exp-motivo"><strong>Motivo de saída:</strong> ${exp.motivo_saida}</div>` : ''}
      </div>
      `).join('')}
    </div>
    ` : ''}
    
    <!-- Rodapé -->
    <div class="rodape">
      Avenida Paulista, 1.765 - 7º andar - Conjunto 72 - Bela Vista - São Paulo - SP - Cep 01311-930<br>
      (11) 3138-5800 - www.techforti.com.br
    </div>
  </div>
</body>
</html>`;

  return res.status(200).json({ html });
}

/**
 * Gera HTML no template T-Systems (com capa)
 */
async function gerarHTMLTSystems(req: VercelRequest, res: VercelResponse) {
  const { dados, config } = req.body;

  // Página de Capa
  const htmlCapa = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Capa - ${dados.nome}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; }
    .capa {
      height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 40px;
    }
    .logo-tsystems {
      text-align: right;
    }
    .logo-tsystems img {
      height: 50px;
    }
    .logo-text {
      color: #E20074;
      font-size: 28pt;
      font-weight: bold;
    }
    .info-candidato {
      background: #E20074;
      color: white;
      padding: 40px;
      margin: 0 -40px;
    }
    .nome-candidato {
      font-size: 24pt;
      font-weight: bold;
      margin-bottom: 10px;
    }
    .titulo-candidato {
      font-size: 16pt;
      margin-bottom: 5px;
    }
    .protocolo {
      font-size: 14pt;
      margin-bottom: 20px;
    }
    .cliente {
      font-size: 12pt;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="capa">
    <div class="logo-tsystems">
      <span class="logo-text">T Systems</span>
    </div>
    <div style="flex: 1;"></div>
    <div class="info-candidato">
      <div class="nome-candidato">${dados.nome.toUpperCase()}</div>
      <div class="titulo-candidato">${dados.titulo_profissional || dados.titulo_vaga || ''}</div>
      ${dados.codigo_vaga ? `<div class="protocolo">Protocolo: ${dados.codigo_vaga}</div>` : ''}
      <div class="cliente">${dados.cliente_destino || 'T-Systems do Brasil'}</div>
    </div>
  </div>
</body>
</html>`;

  // Conteúdo Principal
  const htmlConteudo = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>CV - ${dados.nome}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Arial, sans-serif;
      font-size: 10pt;
      line-height: 1.4;
      color: #333;
    }
    .page {
      max-width: 210mm;
      margin: 0 auto;
      padding: 15mm 20mm;
    }
    .header-logo {
      text-align: right;
      margin-bottom: 20px;
      color: #E20074;
      font-size: 20pt;
      font-weight: bold;
    }
    .secao-titulo {
      color: #E20074;
      font-size: 12pt;
      font-weight: bold;
      margin: 20px 0 10px 0;
      padding-bottom: 5px;
      border-bottom: 2px solid #E20074;
    }
    .perfil {
      text-align: justify;
      margin-bottom: 15px;
    }
    .tabela-skills {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
      font-size: 9pt;
    }
    .tabela-skills th {
      background: #E20074;
      color: white;
      padding: 8px;
      text-align: left;
      border: 1px solid #E20074;
    }
    .tabela-skills td {
      padding: 6px 8px;
      border: 1px solid #ddd;
    }
    .tabela-skills tr:nth-child(even) td {
      background: #FDF2F8;
    }
    .recomendacao {
      margin: 20px 0;
      padding: 15px;
      background: #FDF2F8;
      border-left: 4px solid #E20074;
    }
    .exp-empresa {
      color: #E20074;
      font-weight: bold;
    }
    .exp-periodo {
      float: right;
      font-weight: bold;
    }
    .exp-cargo {
      color: #E20074;
    }
    .exp-item {
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 1px dotted #ccc;
    }
    .tabela-info {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
    }
    .tabela-info th, .tabela-info td {
      border: 1px solid #ddd;
      padding: 5px 8px;
    }
    .tabela-info th {
      background: #f0f0f0;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header-logo">T Systems</div>
    
    <div class="secao-titulo">PERFIL:</div>
    <div class="perfil">
      ${dados.resumo || `Profissional com experiência na área de Tecnologia da Informação.`}
    </div>
    
    <!-- Hard Skills -->
    ${dados.hard_skills_tabela && dados.hard_skills_tabela.length > 0 ? `
    <div class="secao-titulo">Hard Skills</div>
    <table class="tabela-skills">
      <thead>
        <tr>
          <th>Tecnologia</th>
          <th>Tempo de Experiência</th>
        </tr>
      </thead>
      <tbody>
        ${dados.hard_skills_tabela.map((s: any) => `
        <tr>
          <td>${s.tecnologia}</td>
          <td>${s.tempo_experiencia}</td>
        </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}
    
    <!-- Recomendação -->
    <div class="recomendacao">
      <strong>Recomendamos o(a) ${dados.nome.split(' ')[0]}</strong>, pois demonstrou ser um(a) profissional com experiência considerável nas principais tecnologias solicitadas para a posição supracitada.
      <br><br>
      <strong>Disponibilidade:</strong> ${dados.disponibilidade || 'Imediata'}<br>
      <em>Está participando de processos seletivos no mercado:</em><br>
      <em>Não está participando de processo na empresa ${dados.cliente_destino || 'T-Systems'}, através de seu R&S ou de outra consultoria.</em>
    </div>
    
    <!-- Experiência Profissional -->
    <div class="secao-titulo">EXPERIÊNCIA PROFISSIONAL:</div>
    ${dados.experiencias && dados.experiencias.length > 0 ? dados.experiencias.map((exp: any) => `
    <div class="exp-item">
      <div>
        <span class="exp-empresa">CONSULTORIA/CLIENTE: ${exp.empresa.toUpperCase()}${exp.cliente ? ` / ${exp.cliente.toUpperCase()}` : ''}</span>
        <span class="exp-periodo">${exp.data_inicio} - ${exp.atual ? 'atual' : exp.data_fim || ''}</span>
      </div>
      <div><span class="exp-cargo">Função:</span> ${exp.cargo}</div>
      <div style="margin-top: 5px;"><strong>DESCRIÇÃO DAS ATIVIDADES:</strong></div>
      <div>${exp.descricao || ''}</div>
      ${exp.tecnologias && exp.tecnologias.length > 0 ? `<div><strong>Tecnologias utilizadas:</strong> ${exp.tecnologias.join(', ')}</div>` : ''}
      ${exp.motivo_saida ? `<div><em>Motivo da Saída: ${exp.motivo_saida}</em></div>` : ''}
    </div>
    `).join('') : ''}
    
    <!-- Idiomas -->
    ${dados.idiomas && dados.idiomas.length > 0 ? `
    <div class="secao-titulo">IDIOMAS:</div>
    <table class="tabela-info">
      <thead>
        <tr>
          <th>Descrição</th>
          <th>Nível</th>
          <th>Possui certificação? S/N</th>
          <th>Instituição</th>
        </tr>
      </thead>
      <tbody>
        ${dados.idiomas.map((i: any) => `
        <tr>
          <td>${i.idioma}</td>
          <td>${formatarNivelIdioma(i.nivel)}</td>
          <td>${i.certificacao ? 'S' : 'N'}</td>
          <td>${i.instituicao || 'N'}</td>
        </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}
    
    <!-- Formação -->
    ${dados.formacao_academica && dados.formacao_academica.length > 0 ? `
    <div class="secao-titulo">FORMAÇÃO:</div>
    <table class="tabela-info">
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
          <td>${formatarTipoFormacao(f.tipo)}</td>
          <td>${f.curso}</td>
          <td>${f.instituicao}</td>
          <td>${f.em_andamento ? 'N' : 'S'}</td>
          <td>${f.data_conclusao || '-'}</td>
        </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}
    
    <!-- Informações Adicionais -->
    <div class="secao-titulo">INFORMAÇÕES ADICIONAIS:</div>
    <ul style="margin-left: 20px; font-size: 9pt;">
      <li><strong>DISPONIBILIDADE:</strong> ${dados.disponibilidade || 'INÍCIO IMEDIATO'}</li>
      <li><strong>ATUAÇÃO:</strong> ${formatarModalidade(dados.modalidade_trabalho)}</li>
      <li><strong>CIDADE/ESTADO:</strong> ${[dados.cidade, dados.estado].filter(Boolean).join(' – ').toUpperCase() || '-'}</li>
      <li><strong>NÍVEL HIERÁRQUICO:</strong> ${(dados.nivel_hierarquico || 'senior').toUpperCase()}</li>
    </ul>
  </div>
</body>
</html>`;

  return res.status(200).json({ 
    html: htmlConteudo,
    html_capa: htmlCapa,
    template: 'tsystems'
  });
}

// Funções auxiliares
function formatarEstadoCivil(estado: string | undefined): string {
  const map: Record<string, string> = {
    'solteiro': 'Solteiro(a)',
    'casado': 'Casado(a)',
    'divorciado': 'Divorciado(a)',
    'viuvo': 'Viúvo(a)',
    'uniao_estavel': 'União Estável'
  };
  return map[estado || ''] || estado || '-';
}

function formatarNivelIdioma(nivel: string | undefined): string {
  const map: Record<string, string> = {
    'basico': 'Básico',
    'intermediario': 'Intermediário',
    'avancado': 'Avançado',
    'fluente': 'Fluente',
    'nativo': 'Nativo'
  };
  return map[nivel || ''] || nivel || '-';
}

function formatarTipoFormacao(tipo: string | undefined): string {
  const map: Record<string, string> = {
    'tecnico': 'Técnico',
    'graduacao': 'Superior',
    'pos_graduacao': 'Pós-Graduação',
    'mba': 'MBA',
    'mestrado': 'Mestrado',
    'doutorado': 'Doutorado',
    'curso_livre': 'Curso Livre'
  };
  return map[tipo || ''] || tipo || '-';
}

function formatarModalidade(modalidade: string | undefined): string {
  const map: Record<string, string> = {
    'presencial': 'PRESENCIAL',
    'remoto': 'REMOTO',
    'hibrido': 'REMOTO / HÍBRIDO'
  };
  return map[modalidade || ''] || 'REMOTO / HÍBRIDO';
}
