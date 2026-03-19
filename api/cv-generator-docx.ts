/**
 * cv-generator-docx.ts - Geração de CV em formato DOCX (Word)
 * 
 * Gera documentos Word fidedignos ao modelo real da Techfor com:
 * - Imagem de fundo (papel timbrado) em TODAS as páginas
 * - Logo TechFor, faixa vermelha lateral, rodapé institucional
 * - Tabelas de dados pessoais, requisitos, formação
 * - Atividades em bullets, motivo de saída em itálico
 * - Requisitos Mandatórios (3 colunas) e Diferenciais (2 colunas)
 * 
 * Dependência: npm install docx (já instalado via package.json)
 * 
 * Versão: 3.0
 * Data: 22/02/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, Header, Footer, AlignmentType, BorderStyle, WidthType, ShadingType, PageBreak,
  HeightRule, TableLayoutType
} from 'docx';
import { TECHFOR_BG_BASE64 } from './cv-generator-docx-bg.js';

// ============================================
// CONSTANTES
// ============================================
const FONT = 'Arial';
const A4_WIDTH = 11906; // DXA
const A4_HEIGHT = 16838;
const CONTENT_WIDTH = 9026; // A4 - margins

const border = { style: BorderStyle.SINGLE, size: 1, color: '999999' };
const borders = { top: border, bottom: border, left: border, right: border };

const CELL_MARGINS = { top: 40, bottom: 40, left: 80, right: 80 };

// ============================================
// HANDLER
// ============================================
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { dados, template } = req.body;

    if (!dados) {
      return res.status(400).json({ error: 'dados is required' });
    }

    const templateType = template || 'techfor';

    if (templateType === 'techfor') {
      const result = await gerarDocxTechfor(dados);
      
      // Garantir que é um Buffer real (Vercel pode retornar Uint8Array)
      const realBuffer = Buffer.isBuffer(result) ? result : Buffer.from(result);
      
      // Retornar como base64 para o frontend baixar
      const base64 = realBuffer.toString('base64');
      const filename = `CV_${(dados.nome || 'Candidato').replace(/[^a-zA-Z0-9_\-\s]/g, '').replace(/\s+/g, '_')}_Techfor.docx`;
      
      return res.status(200).json({ 
        docx_base64: base64,
        filename,
        size: realBuffer.length
      });
    }

    if (templateType === 'tsystems') {
      const result = await gerarDocxTSystems(dados);
      const realBuffer = Buffer.isBuffer(result) ? result : Buffer.from(result);
      const base64 = realBuffer.toString('base64');
      const filename = `CV_${(dados.nome || 'Candidato').replace(/[^a-zA-Z0-9_\-\s]/g, '').replace(/\s+/g, '_')}_TSystems.docx`;
      return res.status(200).json({ docx_base64: base64, filename, size: realBuffer.length });
    }

    return res.status(400).json({ error: `Template '${templateType}' não suportado para DOCX ainda` });

  } catch (error: any) {
    console.error('❌ Erro cv-generator-docx:', error?.message || error);
    console.error('❌ Stack:', error?.stack);
    return res.status(500).json({ 
      error: error?.message || 'Erro interno ao gerar DOCX',
      details: process.env.NODE_ENV === 'development' ? error?.stack : undefined
    });
  }
}

// ============================================
// HELPERS
// ============================================
function fmt(map: Record<string, string>, value: string): string {
  return map[value] || value || '-';
}

const fmtEstadoCivil = (v: string) => fmt({
  solteiro: 'Solteiro(a)', casado: 'Casado(a)', divorciado: 'Divorciado',
  viuvo: 'Viúvo(a)', uniao_estavel: 'União Estável'
}, v);

const fmtFormacao = (v: string) => fmt({
  tecnico: 'Técnico', graduacao: 'Superior', pos_graduacao: 'Pós Graduação',
  mba: 'MBA', mestrado: 'Mestrado', doutorado: 'Doutorado', curso_livre: 'Curso Livre'
}, v);

const fmtIdioma = (v: string) => fmt({
  basico: 'Básico', intermediario: 'Intermediário', avancado: 'Avançado',
  fluente: 'Fluente', nativo: 'Nativo'
}, v);

function makeCell(label: string, value: string, width: number, isBold = false): TableCell {
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA }, margins: CELL_MARGINS,
    children: [new Paragraph({ children: [
      new TextRun({ text: `${label}: `, bold: true, size: 20, font: FONT }),
      new TextRun({ text: value || '-', size: 20, font: FONT, bold: isBold })
    ]})]
  });
}

function makeHeaderCell(text: string, width: number): TableCell {
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA }, margins: CELL_MARGINS,
    shading: { fill: 'F0F0F0', type: ShadingType.CLEAR },
    children: [new Paragraph({ children: [
      new TextRun({ text, bold: true, size: 16, font: FONT })
    ]})]
  });
}

function makeDataCell(text: string, width: number, fontSize = 16): TableCell {
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA }, margins: CELL_MARGINS,
    children: [new Paragraph({ children: [
      new TextRun({ text: text || '-', size: fontSize, font: FONT })
    ]})]
  });
}

function sectionTitle(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 200, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '808080', space: 1 } },
    children: [
      new TextRun({ text, bold: true, size: 22, font: FONT, underline: { type: 'single' } })
    ]
  });
}

function sectionBoldTitle(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, bold: true, size: 22, font: FONT })]
  });
}

// ============================================
// GERADOR DOCX TECHFOR
// ============================================
async function gerarDocxTechfor(dados: any): Promise<Buffer> {
  // Tentar montar header com background, se falhar, gerar sem
  let headerWithBg: Header | undefined;
  
  try {
    const bgBuffer = Buffer.from(TECHFOR_BG_BASE64, 'base64');
    console.log('📐 Background buffer size:', bgBuffer.length);
    
    // Dimensões para a lib docx-js (transformation usa PIXELS, conversão interna: EMU = px * 9525)
    // Modelo original: cx=7560056, cy=10692003 EMU → 793.7px × 1122.5px = A4 completa
    const BG_WIDTH_PX = 793.7;
    const BG_HEIGHT_PX = 1122.5;

    headerWithBg = new Header({
      children: [
        new Paragraph({
          children: [
            new ImageRun({
              data: bgBuffer,
              transformation: { width: BG_WIDTH_PX, height: BG_HEIGHT_PX },
              type: 'jpg',
              floating: {
                horizontalPosition: { relative: 'page', offset: 0 },
                verticalPosition: { relative: 'page', offset: 0 },
                wrap: { type: 'none' },
                behindDocument: true,
                lockAnchor: true,
                allowOverlap: true
              }
            })
          ]
        })
      ]
    });
    console.log('✅ Header com background criado');
  } catch (bgError: any) {
    console.warn('⚠️ Não foi possível criar background, gerando sem papel timbrado:', bgError.message);
    headerWithBg = undefined;
  }

  // Construir conteúdo
  const children: any[] = [];

  // --- TÍTULO DA VAGA ---
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 100, after: 200 },
    children: [
      new TextRun({
        text: (dados.titulo_vaga || dados.titulo_profissional || 'PROFISSIONAL DE TI').toUpperCase(),
        bold: true, size: 32, color: '000000', font: FONT
      })
    ]
  }));

  // --- DADOS PESSOAIS ---
  children.push(new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [4513, 4513],
    rows: [
      new TableRow({ children: [
        makeCell('Nome', dados.nome, 4513),
        makeCell('Idade', dados.idade ? `${dados.idade} anos` : '-', 4513)
      ]}),
      new TableRow({ children: [
        makeCell('Estado Civil', fmtEstadoCivil(dados.estado_civil), 4513),
        makeCell('Disponibilidade', dados.disponibilidade, 4513)
      ]})
    ]
  }));

  children.push(new Paragraph({ spacing: { before: 80 } }));

  children.push(new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [4513, 4513],
    rows: [
      new TableRow({ children: [
        makeCell('Cidade', [dados.cidade, dados.estado].filter(Boolean).join(' / '), 4513),
        makeCell('Gestor/Cliente', [dados.gestor_destino, dados.cliente_destino].filter(Boolean).join(' / '), 4513)
      ]})
    ]
  }));

  // --- PARECER DE SELEÇÃO ---
  if (dados.parecer_selecao) {
    children.push(sectionTitle('Parecer Seleção'));
    const paragraphs = dados.parecer_selecao.split('\n').filter((p: string) => p.trim());
    paragraphs.forEach((p: string) => {
      children.push(new Paragraph({
        spacing: { after: 80 },
        alignment: AlignmentType.JUSTIFIED,
        children: [new TextRun({ text: p.trim(), size: 20, font: FONT })]
      }));
    });
  }

  // --- RECOMENDAÇÃO (logo após Parecer, antes dos Requisitos) ---
  if (dados.recomendacao_final) {
    children.push(new Paragraph({ spacing: { before: 200 } }));
    children.push(new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({ text: 'Disponibilidade: ', bold: true, size: 20, font: FONT, color: 'E31837' }),
        new TextRun({ text: dados.disponibilidade || 'A combinar', bold: true, size: 20, font: FONT, color: 'E31837' })
      ]
    }));
    children.push(new Paragraph({ spacing: { before: 100 } }));
    children.push(new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: dados.recomendacao_final, bold: true, size: 20, font: FONT })]
    }));
  }

  // --- REQUISITOS MANDATÓRIOS ---
  const reqsMandatorios = (dados.requisitos_match || []).filter((r: any) => r.tipo === 'mandatorio' || !r.tipo);
  if (reqsMandatorios.length > 0) {
    children.push(sectionBoldTitle('Requisitos Mandatórios'));
    
    const colWidths = [3500, 1526, 4000];
    children.push(new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: colWidths,
      rows: [
        new TableRow({ children: [
          makeHeaderCell('Tecnologia', colWidths[0]),
          makeHeaderCell('Tempo de Experiência', colWidths[1]),
          makeHeaderCell('Observação', colWidths[2])
        ]}),
        ...reqsMandatorios.map((r: any) => new TableRow({ children: [
          makeDataCell(r.tecnologia, colWidths[0], 18),
          makeDataCell(r.tempo_experiencia, colWidths[1], 18),
          makeDataCell(r.observacao, colWidths[2], 18)
        ]}))
      ]
    }));
  }

  // --- REQUISITOS DIFERENCIAIS ---
  const reqsDiferenciais = (dados.requisitos_match || []).filter((r: any) => r.tipo === 'diferencial' || r.tipo === 'desejavel');
  if (reqsDiferenciais.length > 0) {
    children.push(sectionBoldTitle('Requisitos Diferenciais'));
    
    const colWidths = [6500, 2526];
    children.push(new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: colWidths,
      rows: [
        new TableRow({ children: [
          makeHeaderCell('Tecnologia', colWidths[0]),
          makeHeaderCell('Tempo de Experiência', colWidths[1])
        ]}),
        ...reqsDiferenciais.map((r: any) => new TableRow({ children: [
          makeDataCell(r.tecnologia, colWidths[0], 18),
          makeDataCell(r.tempo_experiencia, colWidths[1], 18)
        ]}))
      ]
    }));
  }

  // --- HARD SKILLS (sempre exibida se houver dados) ---
  const hardSkills = dados.hard_skills_tabela || [];
  if (hardSkills.length > 0) {
    children.push(sectionTitle('Hard Skills'));
    
    const colWidths = [6500, 2526];
    children.push(new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: colWidths,
      rows: [
        new TableRow({ children: [
          makeHeaderCell('Tecnologia', colWidths[0]),
          makeHeaderCell('Tempo de Experiência', colWidths[1])
        ]}),
        ...hardSkills.map((s: any) => new TableRow({ children: [
          makeDataCell(s.tecnologia, colWidths[0], 18),
          makeDataCell(s.tempo_experiencia, colWidths[1], 18)
        ]}))
      ]
    }));
  }

  // --- FORMAÇÃO ACADÊMICA ---
  const formacoes = dados.formacao_academica || [];
  if (formacoes.length > 0) {
    children.push(sectionTitle('Formação Acadêmica'));
    
    const colWidths = [1200, 2800, 2400, 1200, 1426];
    children.push(new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: colWidths,
      rows: [
        new TableRow({ children: [
          makeHeaderCell('Tipo', colWidths[0]),
          makeHeaderCell('Curso', colWidths[1]),
          makeHeaderCell('Instituição', colWidths[2]),
          makeHeaderCell('Concluido? S/N', colWidths[3]),
          makeHeaderCell('Ano de conclusão', colWidths[4])
        ]}),
        ...formacoes.map((f: any) => new TableRow({ children: [
          makeDataCell(fmtFormacao(f.tipo), colWidths[0]),
          makeDataCell(f.curso, colWidths[1]),
          makeDataCell(f.instituicao, colWidths[2]),
          makeDataCell(f.em_andamento ? 'N' : 'S', colWidths[3]),
          makeDataCell(f.data_conclusao, colWidths[4])
        ]}))
      ]
    }));
  }

  // --- FORMAÇÃO COMPLEMENTAR ---
  const complementar = dados.formacao_complementar || [];
  if (complementar.length > 0) {
    children.push(sectionTitle('Formação Complementar (Cursos livres)'));
    
    const colWidths = [3500, 2800, 1200, 1526];
    children.push(new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: colWidths,
      rows: [
        new TableRow({ children: [
          makeHeaderCell('Curso', colWidths[0]),
          makeHeaderCell('Instituição', colWidths[1]),
          makeHeaderCell('Concluído?', colWidths[2]),
          makeHeaderCell('Ano', colWidths[3])
        ]}),
        ...complementar.map((f: any) => new TableRow({ children: [
          makeDataCell(f.nome, colWidths[0]),
          makeDataCell(f.instituicao, colWidths[1]),
          makeDataCell('Sim', colWidths[2]),
          makeDataCell(f.ano_conclusao, colWidths[3])
        ]}))
      ]
    }));
  }

  // --- IDIOMAS ---
  const idiomas = dados.idiomas || [];
  if (idiomas.length > 0) {
    children.push(sectionTitle('Idiomas'));
    idiomas.forEach((i: any) => {
      children.push(new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: `${i.idioma} ${fmtIdioma(i.nivel)}`, size: 20, font: FONT })]
      }));
    });
  }

  // --- HISTÓRICO PROFISSIONAL ---
  const experiencias = dados.experiencias || [];
  if (experiencias.length > 0) {
    children.push(sectionTitle('Histórico Profissional'));

    experiencias.forEach((exp: any) => {
      // Empresa + Período
      children.push(new Paragraph({
        spacing: { before: 160, after: 40 },
        children: [
          new TextRun({ text: `${(exp.empresa || '').toUpperCase()}.`, bold: true, size: 20, font: FONT }),
          new TextRun({ text: `  ${exp.data_inicio || ''} – ${exp.atual ? 'Atual' : exp.data_fim || ''}`, size: 20, font: FONT })
        ]
      }));

      // Cargo
      children.push(new Paragraph({
        spacing: { after: 20 },
        children: [new TextRun({ text: exp.cargo || '', size: 20, font: FONT })]
      }));

      // Cliente (se houver)
      if (exp.cliente) {
        children.push(new Paragraph({
          spacing: { after: 20 },
          children: [new TextRun({ text: exp.cliente, size: 20, font: FONT })]
        }));
      }

      // "Principais Atividades:" label
      children.push(new Paragraph({
        spacing: { after: 20 },
        children: [new TextRun({ text: 'Principais atividades:', size: 20, font: FONT })]
      }));

      // Descrição completa como texto corrido (prioridade) ou fallback para bullets
      if (exp.descricao && exp.descricao.trim()) {
        // Texto descritivo completo (mesmo comportamento do preview HTML)
        const paragrafos = exp.descricao.split('\n').filter((p: string) => p.trim());
        paragrafos.forEach((paragrafo: string) => {
          children.push(new Paragraph({
            spacing: { after: 40 },
            alignment: AlignmentType.JUSTIFIED,
            children: [
              new TextRun({ text: paragrafo.trim(), size: 18, font: FONT })
            ]
          }));
        });
      } else if (exp.principais_atividades && exp.principais_atividades.length > 0) {
        // Fallback: atividades como bullets (quando não há descricao)
        exp.principais_atividades.forEach((a: string) => {
          children.push(new Paragraph({
            spacing: { after: 20 },
            indent: { left: 360 },
            children: [
              new TextRun({ text: '• ', size: 20, font: FONT }),
              new TextRun({ text: a.trim().replace(/^[-•]\s*/, ''), size: 18, font: FONT })
            ]
          }));
        });
      }

      // Tecnologias utilizadas (se houver)
      const techs = exp.tecnologias || [];
      if (techs.length > 0) {
        children.push(new Paragraph({
          spacing: { before: 40, after: 40 },
          children: [
            new TextRun({ text: 'Tecnologias utilizadas: ', bold: true, size: 18, font: FONT }),
            new TextRun({ text: techs.join(', '), size: 18, font: FONT })
          ]
        }));
      }

      // Motivo de saída
      const motivoSaida = (exp.motivo_saida || exp.motivoSaida || exp.motivo || '').toString().trim();
      if (motivoSaida) {
        children.push(new Paragraph({
          spacing: { before: 40, after: 40 },
          children: [
            new TextRun({ text: 'Motivo de saída: ', bold: true, italics: true, size: 18, font: FONT, color: '555555' }),
            new TextRun({ text: motivoSaida, italics: true, size: 18, font: FONT, color: '555555' })
          ]
        }));
      }
    });
  }

  // --- INFORMAÇÕES ADICIONAIS ---
  const infoAdicionais = dados.informacoes_adicionais || [];
  if (infoAdicionais.length > 0) {
    children.push(sectionTitle('Informações Adicionais'));
    infoAdicionais.forEach((info: string) => {
      children.push(new Paragraph({
        spacing: { after: 40 },
        indent: { left: 360 },
        children: [
          new TextRun({ text: '• ', size: 20, font: FONT }),
          new TextRun({ text: info, size: 18, font: FONT })
        ]
      }));
    });
  }

  // Criar documento
  const sectionProps: any = {
    properties: {
      page: {
        size: { width: A4_WIDTH, height: A4_HEIGHT },
        margin: { top: 1640, right: 566, bottom: 1418, left: 1560 }
      }
    },
    children
  };
  
  // Adicionar header com background apenas se criou com sucesso
  if (headerWithBg) {
    sectionProps.headers = { default: headerWithBg };
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 20, color: '333333' }
        }
      }
    },
    sections: [sectionProps]
  });

  // Gerar buffer - garantir compatibilidade com diferentes ambientes
  const packerResult = await Packer.toBuffer(doc);
  return Buffer.isBuffer(packerResult) ? packerResult : Buffer.from(packerResult);
}


// ============================================
// LOGO T-SYSTEMS (PNG extraído do template oficial — 5.5cm x 1.2cm)
// ============================================
const TSYSTEMS_LOGO_BASE64 = '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';

// ============================================
// GERADOR DOCX T-SYSTEMS v2.1 — Com Capa
// Fonte oficial: Verdana (corpo) | TeleGrotesk Headline Ultra (nome capa) | Tele-GroteskNor (subtítulo capa)
// Cor principal: #E20074 | Corpo: #595959
// Estrutura: Seção 1 (Capa) + Seção 2 (Conteúdo)
// ============================================
async function gerarDocxTSystems(dados: any): Promise<Buffer> {
  const FONT_TS       = 'Verdana';               // corpo inteiro
  const FONT_NOME     = 'TeleGrotesk Headline Ultra'; // nome na capa (sz 60 = 30pt)
  const FONT_MODULO   = 'TeleGrotesk Headline';  // módulo/objetivo na capa (sz 50 = 25pt)
  const FONT_CLIENTE  = 'Tele-GroteskNor';       // cliente na capa (sz 40 = 20pt)
  const MAGENTA       = 'E20074';
  const CINZA         = '595959';
  const BRANCO        = 'FFFFFF';
  const CINZA_CLARO   = 'B9BEC7';
  const MAGENTA_CLARO = 'FCE8F3';

  // ─── HELPERS ───
  function tsTitle(text: string): Paragraph {
    return new Paragraph({
      spacing: { before: 240, after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: MAGENTA, space: 1 } },
      children: [new TextRun({ text, bold: true, size: 20, font: FONT_TS, color: MAGENTA })]
    });
  }

  function tsBody(text: string, opts?: { bold?: boolean; italic?: boolean; size?: number; color?: string; before?: number; after?: number; justified?: boolean; shading?: string; indentLeft?: number; indentRight?: number }): Paragraph {
    const o = opts || {};
    const p: any = {
      spacing: { before: o.before ?? 0, after: o.after ?? 60 },
      alignment: o.justified ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
      children: [new TextRun({
        text, size: o.size ?? 18, font: FONT_TS,
        color: o.color ?? CINZA,
        bold: o.bold, italics: o.italic
      })]
    };
    if (o.shading) p.shading = { fill: o.shading, type: ShadingType.CLEAR };
    if (o.indentLeft || o.indentRight) p.indent = { left: o.indentLeft ?? 0, right: o.indentRight ?? 0 };
    return new Paragraph(p);
  }

  function tsCell(text: string, width: number, opts?: { header?: boolean; bg?: string; bold?: boolean; color?: string }): TableCell {
    const o = opts || {};
    const bg = o.header ? MAGENTA : (o.bg || 'FFFFFF');
    const textColor = o.header ? BRANCO : (o.color || CINZA);
    return new TableCell({
      borders,
      width: { size: width, type: WidthType.DXA },
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      shading: { fill: bg, type: ShadingType.CLEAR },
      children: [new Paragraph({
        children: [new TextRun({ text: text || '-', size: 18, font: FONT_TS, color: textColor, bold: o.bold || o.header })]
      })]
    });
  }

  // ─── LOGO (usado em ambas as seções) ───
  let logoBuffer: Buffer;
  try {
    logoBuffer = Buffer.from(TSYSTEMS_LOGO_BASE64, 'base64');
  } catch {
    logoBuffer = Buffer.alloc(0);
  }
  const hasLogo = logoBuffer.length > 0;

  function makeLogo(alignRight = true): Paragraph {
    if (!hasLogo) {
      return new Paragraph({
        alignment: alignRight ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [new TextRun({ text: 'T Systems', bold: true, size: 28, font: FONT_TS, color: MAGENTA })]
      });
    }
    return new Paragraph({
      alignment: alignRight ? AlignmentType.RIGHT : AlignmentType.LEFT,
      children: [new ImageRun({
        data: logoBuffer,
        transformation: { width: 208, height: 46 },
        type: 'png'
      })]
    });
  }

  // ============================================================
  // SEÇÃO 1: CAPA
  // Layout: faixa magenta no topo + nome/título/cliente no meio
  // + faixa cinza no fundo como separador visual
  // ============================================================
  const nomeCandidato  = (dados.nome || '').toUpperCase();
  const tituloCandidato = dados.titulo_vaga || dados.titulo_profissional || '';
  const clienteDestino = dados.cliente_destino || 'T-Systems do Brasil';
  const codigoVaga     = dados.codigo_vaga || '';
  // Monta texto de objetivo: "7606 - SV-505 Consultor IS Oil (Inbound) - Especialista"
  const objetivoTexto  = [codigoVaga, tituloCandidato].filter(Boolean).join(' - ');

  const capaChildren: any[] = [
    // ── ESPAÇO BRANCO (topo) — logo T-Systems fica no header, espaço empurra bloco magenta para baixo ──
    // 10 linhas × 600 DXA = 6000 DXA ≈ 106mm — cabe na área útil de 239mm com a tabela magenta
    ...Array(10).fill(null).map(() => new Paragraph({
      spacing: { line: 600, lineRule: 'exact' as any },
      children: [new TextRun({ text: '', size: 40, font: FONT_TS })]
    })),

    // ── BLOCO MAGENTA — célula de tabela com shading sólido ──
    new Table({
      width: { size: 10800, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      borders: {
        top:     { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        bottom:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        left:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        right:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        insideH: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        insideV: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      },
      rows: [new TableRow({
        height: { value: 4000, rule: HeightRule.AT_LEAST },
        children: [new TableCell({
          width: { size: 10800, type: WidthType.DXA },
          shading: { fill: MAGENTA, type: ShadingType.CLEAR },
          margins: { top: 360, bottom: 360, left: 720, right: 360 },
          borders: {
            top:    { style: BorderStyle.NONE, size: 0, color: MAGENTA },
            bottom: { style: BorderStyle.NONE, size: 0, color: MAGENTA },
            left:   { style: BorderStyle.NONE, size: 0, color: MAGENTA },
            right:  { style: BorderStyle.NONE, size: 0, color: MAGENTA },
          },
          children: [
            // NOME — TeleGrotesk Headline Ultra, sz 60 (30pt), branco
            new Paragraph({
              spacing: { before: 200, after: 120, line: 480, lineRule: 'exact' as any },
              children: [new TextRun({ text: nomeCandidato, size: 60, font: FONT_NOME, color: BRANCO })]
            }),
            // OBJETIVO (codigo_vaga + titulo) — TeleGrotesk Headline, sz 50 (25pt), branco
            ...(objetivoTexto ? [new Paragraph({
              spacing: { before: 0, after: 80, line: 480, lineRule: 'exact' as any },
              children: [new TextRun({ text: objetivoTexto, size: 50, font: FONT_MODULO, color: BRANCO })]
            })] : []),
            // CLIENTE — Tele-GroteskNor, sz 40 (20pt), branco
            new Paragraph({
              spacing: { before: 160, after: 200 },
              children: [new TextRun({ text: clienteDestino, size: 40, font: FONT_CLIENTE, color: BRANCO })]
            }),
          ],
        })]
      })]
    }),
  ];

  // Header da capa: logo à direita
  const headerCapa = new Header({ children: [makeLogo(true)] });

  // ============================================================
  // SEÇÃO 2: CONTEÚDO DO CV
  // ============================================================
  const contentChildren: any[] = [];

  // ─── NOME + OBJETIVO (padrão T-Systems — cabeçalho da segunda página) ───
  // Nome: Verdana, sz 40 (20pt), magenta  — igual ao template oficial
  contentChildren.push(new Paragraph({
    spacing: { before: 0, after: 60 },
    children: [new TextRun({ text: dados.nome || '', size: 40, font: FONT_TS, color: MAGENTA })]
  }));
  // Objetivo: "OBJETIVO: 7606 - SV-505 Consultor IS Oil..." — Verdana, bold, sz 18 (9pt), magenta
  if (objetivoTexto) {
    contentChildren.push(new Paragraph({
      spacing: { before: 0, after: 240 },
      children: [
        new TextRun({ text: 'objetivo: ', bold: true, size: 18, font: FONT_TS, color: MAGENTA }),
        new TextRun({ text: objetivoTexto, size: 18, font: FONT_TS, color: CINZA })
      ]
    }));
  }

  // ─── PERFIL ───
  if (dados.resumo) {
    contentChildren.push(tsTitle('PERFIL:'));
    dados.resumo.split('\n').filter((p: string) => p.trim()).forEach((p: string) => {
      contentChildren.push(tsBody(p.trim(), { justified: true, after: 60 }));
    });
  }

  // ─── HARD SKILLS ───
  const hardSkills = dados.hard_skills_tabela || [];
  if (hardSkills.length > 0) {
    contentChildren.push(tsTitle('Hard Skills'));
    const colHS = [6900, 2126];
    contentChildren.push(new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: colHS,
      rows: [
        new TableRow({ children: [
          tsCell('Tecnologia', colHS[0], { header: true }),
          tsCell('Tempo de Experiência', colHS[1], { header: true })
        ]}),
        ...hardSkills.map((s: any, idx: number) => new TableRow({ children: [
          tsCell(s.tecnologia || '-', colHS[0], { bg: idx % 2 === 0 ? 'FFFFFF' : 'FDEEF8' }),
          tsCell(s.tempo_experiencia || '-', colHS[1], { bg: idx % 2 === 0 ? 'FFFFFF' : 'FDEEF8' })
        ]}))
      ]
    }));
    contentChildren.push(new Paragraph({ spacing: { after: 80 } }));
  }

  // ─── PARECER DA ENTREVISTA TÉCNICA ───
  if (dados.parecer_entrevista_tecnica) {
    contentChildren.push(tsTitle('Parecer da Entrevista Técnica'));
    dados.parecer_entrevista_tecnica.split('\n').filter((p: string) => p.trim()).forEach((p: string) => {
      contentChildren.push(tsBody(p.trim(), { justified: true, after: 60, shading: MAGENTA_CLARO, indentLeft: 100, indentRight: 100 }));
    });
    contentChildren.push(new Paragraph({ spacing: { after: 80 } }));
  }

  // ─── RECOMENDAÇÃO ───
  contentChildren.push(tsTitle('RECOMENDAÇÃO:'));
  contentChildren.push(new Paragraph({
    spacing: { after: 60 },
    shading: { fill: MAGENTA_CLARO, type: ShadingType.CLEAR },
    indent: { left: 100, right: 100 },
    children: [
      new TextRun({ text: `Recomendamos o(a) ${(dados.nome || '').split(' ')[0]}`, bold: true, size: 18, font: FONT_TS, color: CINZA }),
      new TextRun({ text: ', pois demonstrou ser um(a) profissional com experiência considerável nas principais tecnologias solicitadas para a posição supracitada.', size: 18, font: FONT_TS, color: CINZA })
    ]
  }));
  contentChildren.push(new Paragraph({
    spacing: { after: 40 },
    shading: { fill: MAGENTA_CLARO, type: ShadingType.CLEAR },
    indent: { left: 100, right: 100 },
    children: [
      new TextRun({ text: 'Disponibilidade: ', bold: true, size: 18, font: FONT_TS, color: CINZA }),
      new TextRun({ text: dados.disponibilidade || 'Imediata', size: 18, font: FONT_TS, color: CINZA })
    ]
  }));
  contentChildren.push(new Paragraph({
    spacing: { after: 40 },
    shading: { fill: MAGENTA_CLARO, type: ShadingType.CLEAR },
    indent: { left: 100, right: 100 },
    children: [new TextRun({ text: 'Está participando de processos seletivos no mercado:', italics: true, size: 18, font: FONT_TS, color: CINZA })]
  }));
  contentChildren.push(new Paragraph({
    spacing: { after: 160 },
    shading: { fill: MAGENTA_CLARO, type: ShadingType.CLEAR },
    indent: { left: 100, right: 100 },
    children: [new TextRun({ text: `Não está participando de processo na empresa ${dados.cliente_destino || 'T-Systems'}, através de seu R&S ou de outra consultoria.`, italics: true, size: 18, font: FONT_TS, color: CINZA })]
  }));

  // ─── EXPERIÊNCIA PROFISSIONAL ───
  const experiencias = dados.experiencias || [];
  if (experiencias.length > 0) {
    contentChildren.push(tsTitle('EXPERIÊNCIA PROFISSIONAL:'));
    experiencias.forEach((exp: any) => {
      const partes = [exp.empresa, exp.cliente].filter(Boolean).map((s: string) => (s || '').toUpperCase());
      const empresaLabel = partes.join(' / ');
      const periodo = `${exp.data_inicio || ''} - ${exp.atual ? 'atual' : exp.data_fim || ''}`;

      contentChildren.push(new Paragraph({
        spacing: { before: 200, after: 20 },
        tabStops: [{ type: 'right' as any, position: CONTENT_WIDTH }],
        children: [
          new TextRun({ text: `CONSULTORIA/CLIENTE: ${empresaLabel}`, bold: true, size: 18, font: FONT_TS, color: MAGENTA }),
          new TextRun({ text: '\t', size: 18, font: FONT_TS }),
          new TextRun({ text: periodo, bold: true, size: 18, font: FONT_TS, color: CINZA })
        ]
      }));

      if (exp.cargo && exp.cargo !== 'null' && exp.cargo !== 'Função') {
        contentChildren.push(new Paragraph({
          spacing: { after: 20 },
          children: [
            new TextRun({ text: 'Função: ', bold: true, size: 18, font: FONT_TS, color: MAGENTA }),
            new TextRun({ text: exp.cargo, size: 18, font: FONT_TS, color: CINZA })
          ]
        }));
      }

      contentChildren.push(new Paragraph({
        spacing: { before: 60, after: 20 },
        children: [new TextRun({ text: 'DESCRIÇÃO DAS ATIVIDADES:', bold: true, size: 18, font: FONT_TS, color: CINZA })]
      }));

      if (exp.descricao && exp.descricao.trim()) {
        exp.descricao.split('\n').filter((p: string) => p.trim()).forEach((paragrafo: string) => {
          contentChildren.push(new Paragraph({
            spacing: { after: 40 },
            alignment: AlignmentType.JUSTIFIED,
            children: [new TextRun({ text: paragrafo.trim(), size: 18, font: FONT_TS, color: CINZA })]
          }));
        });
      }

      if (exp.tecnologias && exp.tecnologias.length > 0) {
        contentChildren.push(new Paragraph({
          spacing: { before: 40, after: 40 },
          children: [
            new TextRun({ text: 'Tecnologias utilizadas: ', bold: true, size: 18, font: FONT_TS, color: CINZA }),
            new TextRun({ text: exp.tecnologias.join(', '), size: 18, font: FONT_TS, color: CINZA })
          ]
        }));
      }

      const motivo = (exp.motivo_saida || '').toString().trim();
      if (motivo) {
        contentChildren.push(new Paragraph({
          spacing: { before: 20, after: 60 },
          children: [
            new TextRun({ text: 'Motivo da Saída: ', bold: true, italics: true, size: 18, font: FONT_TS, color: CINZA }),
            new TextRun({ text: motivo, italics: true, size: 18, font: FONT_TS, color: CINZA })
          ]
        }));
      }
    });
  }

  // ─── IDIOMAS ───
  const idiomas = dados.idiomas || [];
  if (idiomas.length > 0) {
    contentChildren.push(tsTitle('Idiomas:'));
    idiomas.forEach((i: any) => {
      contentChildren.push(tsBody(`${i.idioma || ''} – ${fmtIdioma(i.nivel || '')}`, { color: CINZA }));
    });
  }

  // ─── FORMAÇÃO ───
  const formacoes = dados.formacao_academica || [];
  if (formacoes.length > 0) {
    contentChildren.push(tsTitle('FORMAÇÃO:'));
    formacoes.forEach((f: any) => {
      contentChildren.push(tsBody(
        `${fmtFormacao(f.tipo || '')} – ${f.curso || ''} – ${f.instituicao || ''}${f.data_conclusao ? ' – ' + f.data_conclusao : ''}`,
        { color: CINZA }
      ));
    });
  }

  // ─── CERTIFICAÇÕES/CURSOS ───
  const complementar = dados.formacao_complementar || [];
  if (complementar.length > 0) {
    contentChildren.push(tsTitle('Certificações/Cursos:'));
    complementar.forEach((c: any) => {
      contentChildren.push(tsBody(
        `${c.nome || ''}${c.instituicao ? ' – ' + c.instituicao : ''}${c.ano_conclusao ? ' – ' + c.ano_conclusao : ''}`,
        { color: CINZA }
      ));
    });
  }

  // ─── INFORMAÇÕES ADICIONAIS ───
  contentChildren.push(tsTitle('INFORMAÇÕES ADICIONAIS:'));
  if (dados.disponibilidade) contentChildren.push(tsBody(`Disponibilidade: ${dados.disponibilidade}`, { color: CINZA }));
  const modalMap: Record<string, string> = { presencial: 'Presencial', remoto: 'Remoto', hibrido: 'Remoto / Híbrido' };
  if (dados.modalidade_trabalho) contentChildren.push(tsBody(`Atuação: ${modalMap[dados.modalidade_trabalho] || dados.modalidade_trabalho}`, { color: CINZA }));
  if (dados.cidade || dados.estado) contentChildren.push(tsBody(`Cidade/Estado: ${[dados.cidade, dados.estado].filter(Boolean).join(' – ')}`, { color: CINZA }));
  const nivelMap: Record<string, string> = { junior: 'Júnior', pleno: 'Pleno', senior: 'Sênior', especialista: 'Especialista', coordenador: 'Coordenador', gerente: 'Gerente' };
  if (dados.nivel_hierarquico) contentChildren.push(tsBody(`Nível Hierárquico: ${nivelMap[dados.nivel_hierarquico] || dados.nivel_hierarquico}`, { color: CINZA }));

  // Header do conteúdo: logo à direita
  const headerConteudo = new Header({ children: [makeLogo(true)] });

  // ─── MONTAR DOCUMENTO com 2 seções ───
  const pageProps = {
    size: { width: 11907, height: 16839 },
    margin: { top: 1134, right: 1134, bottom: 1418, left: 1134, header: 709 }
  };

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: FONT_TS, size: 18, color: CINZA } }
      }
    },
    sections: [
      // Seção 1: Capa
      {
        properties: { page: pageProps },
        headers: { default: headerCapa },
        children: capaChildren
      },
      // Seção 2: Conteúdo
      {
        properties: { page: pageProps },
        headers: { default: headerConteudo },
        children: contentChildren
      }
    ]
  });

  const packerResult = await Packer.toBuffer(doc);
  return Buffer.isBuffer(packerResult) ? packerResult : Buffer.from(packerResult);
}
