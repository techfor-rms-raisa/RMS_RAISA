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
  ImageRun, Header, AlignmentType, BorderStyle, WidthType, ShadingType
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

  // --- RECOMENDAÇÃO ---
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
// GERADOR DOCX T-SYSTEMS
// ============================================
async function gerarDocxTSystems(dados: any): Promise<Buffer> {
  const MAGENTA = 'E20074';
  const MAGENTA_LIGHT = 'FCE8F3'; // rosado claro para bloco parecer
  const children: any[] = [];

  // --- CABEÇALHO: Nome + Título + Cliente ---
  children.push(new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 0, after: 60 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: MAGENTA, space: 1 } },
    children: [
      new TextRun({ text: 'T Systems', bold: true, size: 28, font: FONT, color: MAGENTA })
    ]
  }));

  children.push(new Paragraph({ spacing: { before: 160, after: 40 }, children: [
    new TextRun({ text: (dados.nome || '').toUpperCase(), bold: true, size: 36, font: FONT })
  ]}));

  children.push(new Paragraph({ spacing: { before: 0, after: 40 }, children: [
    new TextRun({ text: dados.titulo_vaga || dados.titulo_profissional || '', size: 24, font: FONT })
  ]}));

  if (dados.codigo_vaga) {
    children.push(new Paragraph({ spacing: { before: 0, after: 40 }, children: [
      new TextRun({ text: `Protocolo: ${dados.codigo_vaga}`, size: 20, font: FONT })
    ]}));
  }

  children.push(new Paragraph({ spacing: { before: 0, after: 160 }, children: [
    new TextRun({ text: dados.cliente_destino || 'T-Systems do Brasil', size: 20, font: FONT })
  ]}));

  // --- PERFIL ---
  if (dados.resumo) {
    children.push(new Paragraph({
      spacing: { before: 200, after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: MAGENTA, space: 1 } },
      children: [new TextRun({ text: 'PERFIL:', bold: true, size: 22, font: FONT, color: MAGENTA })]
    }));
    const perfilParas = dados.resumo.split('\n').filter((p: string) => p.trim());
    perfilParas.forEach((p: string) => {
      children.push(new Paragraph({
        spacing: { after: 60 },
        alignment: AlignmentType.JUSTIFIED,
        children: [new TextRun({ text: p.trim(), size: 20, font: FONT })]
      }));
    });
  }

  // --- HARD SKILLS ---
  const hardSkills = dados.hard_skills_tabela || [];
  if (hardSkills.length > 0) {
    children.push(new Paragraph({
      spacing: { before: 200, after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: MAGENTA, space: 1 } },
      children: [new TextRun({ text: 'Hard Skills', bold: true, size: 22, font: FONT, color: MAGENTA })]
    }));

    const colHS = [6500, 2526];
    children.push(new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: colHS,
      rows: [
        new TableRow({ children: [
          new TableCell({
            borders, width: { size: colHS[0], type: WidthType.DXA }, margins: CELL_MARGINS,
            shading: { fill: MAGENTA, type: ShadingType.CLEAR },
            children: [new Paragraph({ children: [new TextRun({ text: 'Tecnologia', bold: true, size: 20, font: FONT, color: 'FFFFFF' })] })]
          }),
          new TableCell({
            borders, width: { size: colHS[1], type: WidthType.DXA }, margins: CELL_MARGINS,
            shading: { fill: MAGENTA, type: ShadingType.CLEAR },
            children: [new Paragraph({ children: [new TextRun({ text: 'Tempo de Experiência', bold: true, size: 20, font: FONT, color: 'FFFFFF' })] })]
          })
        ]}),
        ...hardSkills.map((s: any, idx: number) => new TableRow({ children: [
          new TableCell({
            borders, width: { size: colHS[0], type: WidthType.DXA }, margins: CELL_MARGINS,
            shading: { fill: idx % 2 === 0 ? 'FFFFFF' : 'FDEEF8', type: ShadingType.CLEAR },
            children: [new Paragraph({ children: [new TextRun({ text: s.tecnologia || '-', size: 20, font: FONT })] })]
          }),
          new TableCell({
            borders, width: { size: colHS[1], type: WidthType.DXA }, margins: CELL_MARGINS,
            shading: { fill: idx % 2 === 0 ? 'FFFFFF' : 'FDEEF8', type: ShadingType.CLEAR },
            children: [new Paragraph({ children: [new TextRun({ text: s.tempo_experiencia || '-', size: 20, font: FONT })] })]
          })
        ]}))
      ]
    }));
  }

  // --- PARECER DA ENTREVISTA TÉCNICA ---
  if (dados.parecer_entrevista_tecnica) {
    children.push(new Paragraph({
      spacing: { before: 200, after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: MAGENTA, space: 1 } },
      children: [new TextRun({ text: 'Parecer da Entrevista Técnica', bold: true, size: 22, font: FONT, color: MAGENTA })]
    }));
    const parecerParas = dados.parecer_entrevista_tecnica.split('\n').filter((p: string) => p.trim());
    parecerParas.forEach((p: string) => {
      children.push(new Paragraph({
        spacing: { after: 60 },
        alignment: AlignmentType.JUSTIFIED,
        shading: { fill: MAGENTA_LIGHT, type: ShadingType.CLEAR },
        indent: { left: 120, right: 120 },
        children: [new TextRun({ text: p.trim(), size: 20, font: FONT })]
      }));
    });
    children.push(new Paragraph({ spacing: { after: 40 } }));
  }

  // --- BLOCO RECOMENDAÇÃO ---
  children.push(new Paragraph({
    spacing: { before: 160, after: 40 },
    shading: { fill: MAGENTA_LIGHT, type: ShadingType.CLEAR },
    indent: { left: 120, right: 120 },
    children: [
      new TextRun({ text: `Recomendamos o(a) ${(dados.nome || '').split(' ')[0]}`, bold: true, size: 20, font: FONT }),
      new TextRun({ text: ', pois demonstrou ser um(a) profissional com experiência considerável nas principais tecnologias solicitadas para a posição supracitada.', size: 20, font: FONT })
    ]
  }));
  children.push(new Paragraph({
    spacing: { after: 40 },
    shading: { fill: MAGENTA_LIGHT, type: ShadingType.CLEAR },
    indent: { left: 120, right: 120 },
    children: [
      new TextRun({ text: 'Disponibilidade: ', bold: true, size: 20, font: FONT }),
      new TextRun({ text: dados.disponibilidade || 'Imediata', size: 20, font: FONT })
    ]
  }));
  children.push(new Paragraph({
    spacing: { after: 40 },
    shading: { fill: MAGENTA_LIGHT, type: ShadingType.CLEAR },
    indent: { left: 120, right: 120 },
    children: [new TextRun({ text: 'Está participando de processos seletivos no mercado:', italics: true, size: 20, font: FONT })]
  }));
  children.push(new Paragraph({
    spacing: { after: 160 },
    shading: { fill: MAGENTA_LIGHT, type: ShadingType.CLEAR },
    indent: { left: 120, right: 120 },
    children: [new TextRun({ text: `Não está participando de processo na empresa ${dados.cliente_destino || 'T-Systems'}, através de seu R&S ou de outra consultoria.`, italics: true, size: 20, font: FONT })]
  }));

  // --- EXPERIÊNCIA PROFISSIONAL ---
  const experiencias = dados.experiencias || [];
  if (experiencias.length > 0) {
    children.push(new Paragraph({
      spacing: { before: 200, after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: MAGENTA, space: 1 } },
      children: [new TextRun({ text: 'EXPERIÊNCIA PROFISSIONAL:', bold: true, size: 22, font: FONT, color: MAGENTA })]
    }));

    experiencias.forEach((exp: any) => {
      const empresaLabel = [exp.empresa, exp.cliente].filter(Boolean).map((s: string) => s.toUpperCase()).join(' / ');
      const periodo = `${exp.data_inicio || ''} - ${exp.atual ? 'atual' : exp.data_fim || ''}`;

      // CONSULTORIA/CLIENTE + período na mesma linha com tab
      children.push(new Paragraph({
        spacing: { before: 160, after: 20 },
        tabStops: [{ type: 'right' as any, position: CONTENT_WIDTH }],
        children: [
          new TextRun({ text: `CONSULTORIA/CLIENTE: ${empresaLabel}`, bold: true, size: 20, font: FONT, color: MAGENTA }),
          new TextRun({ text: '\t', size: 20, font: FONT }),
          new TextRun({ text: periodo, bold: true, size: 20, font: FONT })
        ]
      }));

      // Função
      if (exp.cargo && exp.cargo !== 'null') {
        children.push(new Paragraph({
          spacing: { after: 20 },
          children: [
            new TextRun({ text: 'Função: ', bold: true, size: 20, font: FONT, color: MAGENTA }),
            new TextRun({ text: exp.cargo, size: 20, font: FONT })
          ]
        }));
      }

      // Descrição das atividades
      children.push(new Paragraph({
        spacing: { before: 40, after: 20 },
        children: [new TextRun({ text: 'DESCRIÇÃO DAS ATIVIDADES:', bold: true, size: 20, font: FONT })]
      }));

      if (exp.descricao && exp.descricao.trim()) {
        const paragrafos = exp.descricao.split('\n').filter((p: string) => p.trim());
        paragrafos.forEach((paragrafo: string) => {
          children.push(new Paragraph({
            spacing: { after: 40 },
            alignment: AlignmentType.JUSTIFIED,
            children: [new TextRun({ text: paragrafo.trim(), size: 18, font: FONT })]
          }));
        });
      }

      // Tecnologias utilizadas
      if (exp.tecnologias && exp.tecnologias.length > 0) {
        children.push(new Paragraph({
          spacing: { before: 40, after: 40 },
          children: [
            new TextRun({ text: 'Tecnologias utilizadas: ', bold: true, size: 18, font: FONT }),
            new TextRun({ text: exp.tecnologias.join(', '), size: 18, font: FONT })
          ]
        }));
      }

      // Motivo da saída
      const motivo = (exp.motivo_saida || '').toString().trim();
      if (motivo) {
        children.push(new Paragraph({
          spacing: { before: 20, after: 40 },
          children: [
            new TextRun({ text: 'Motivo da Saída: ', bold: true, italics: true, size: 18, font: FONT }),
            new TextRun({ text: motivo, italics: true, size: 18, font: FONT })
          ]
        }));
      }
    });
  }

  // --- IDIOMAS ---
  const idiomas = dados.idiomas || [];
  if (idiomas.length > 0) {
    children.push(new Paragraph({
      spacing: { before: 200, after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: MAGENTA, space: 1 } },
      children: [new TextRun({ text: 'IDIOMAS:', bold: true, size: 22, font: FONT, color: MAGENTA })]
    }));
    const colIdioma = [2000, 2000, 2000, 3026];
    children.push(new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: colIdioma,
      rows: [
        new TableRow({ children: [
          new TableCell({ borders, width: { size: colIdioma[0], type: WidthType.DXA }, margins: CELL_MARGINS,
            shading: { fill: 'F0F0F0', type: ShadingType.CLEAR },
            children: [new Paragraph({ children: [new TextRun({ text: 'Descrição', bold: true, size: 18, font: FONT })] })] }),
          new TableCell({ borders, width: { size: colIdioma[1], type: WidthType.DXA }, margins: CELL_MARGINS,
            shading: { fill: 'F0F0F0', type: ShadingType.CLEAR },
            children: [new Paragraph({ children: [new TextRun({ text: 'Nível', bold: true, size: 18, font: FONT })] })] }),
          new TableCell({ borders, width: { size: colIdioma[2], type: WidthType.DXA }, margins: CELL_MARGINS,
            shading: { fill: 'F0F0F0', type: ShadingType.CLEAR },
            children: [new Paragraph({ children: [new TextRun({ text: 'Possui certificação? S/N', bold: true, size: 18, font: FONT })] })] }),
          new TableCell({ borders, width: { size: colIdioma[3], type: WidthType.DXA }, margins: CELL_MARGINS,
            shading: { fill: 'F0F0F0', type: ShadingType.CLEAR },
            children: [new Paragraph({ children: [new TextRun({ text: 'Instituição', bold: true, size: 18, font: FONT })] })] })
        ]}),
        ...idiomas.map((i: any) => new TableRow({ children: [
          new TableCell({ borders, width: { size: colIdioma[0], type: WidthType.DXA }, margins: CELL_MARGINS,
            children: [new Paragraph({ children: [new TextRun({ text: i.idioma || '-', size: 18, font: FONT })] })] }),
          new TableCell({ borders, width: { size: colIdioma[1], type: WidthType.DXA }, margins: CELL_MARGINS,
            children: [new Paragraph({ children: [new TextRun({ text: fmtIdioma(i.nivel), size: 18, font: FONT })] })] }),
          new TableCell({ borders, width: { size: colIdioma[2], type: WidthType.DXA }, margins: CELL_MARGINS,
            children: [new Paragraph({ children: [new TextRun({ text: i.certificacao ? 'S' : 'N', size: 18, font: FONT })] })] }),
          new TableCell({ borders, width: { size: colIdioma[3], type: WidthType.DXA }, margins: CELL_MARGINS,
            children: [new Paragraph({ children: [new TextRun({ text: i.instituicao || 'N', size: 18, font: FONT })] })] })
        ]}))
      ]
    }));
  }

  // --- FORMAÇÃO ---
  const formacoes = dados.formacao_academica || [];
  if (formacoes.length > 0) {
    children.push(new Paragraph({
      spacing: { before: 200, after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: MAGENTA, space: 1 } },
      children: [new TextRun({ text: 'FORMAÇÃO:', bold: true, size: 22, font: FONT, color: MAGENTA })]
    }));
    const colForm = [1400, 2600, 2400, 1200, 1426];
    children.push(new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: colForm,
      rows: [
        new TableRow({ children: [
          new TableCell({ borders, width: { size: colForm[0], type: WidthType.DXA }, margins: CELL_MARGINS,
            shading: { fill: 'F0F0F0', type: ShadingType.CLEAR },
            children: [new Paragraph({ children: [new TextRun({ text: 'Tipo', bold: true, size: 18, font: FONT })] })] }),
          new TableCell({ borders, width: { size: colForm[1], type: WidthType.DXA }, margins: CELL_MARGINS,
            shading: { fill: 'F0F0F0', type: ShadingType.CLEAR },
            children: [new Paragraph({ children: [new TextRun({ text: 'Curso', bold: true, size: 18, font: FONT })] })] }),
          new TableCell({ borders, width: { size: colForm[2], type: WidthType.DXA }, margins: CELL_MARGINS,
            shading: { fill: 'F0F0F0', type: ShadingType.CLEAR },
            children: [new Paragraph({ children: [new TextRun({ text: 'Instituição', bold: true, size: 18, font: FONT })] })] }),
          new TableCell({ borders, width: { size: colForm[3], type: WidthType.DXA }, margins: CELL_MARGINS,
            shading: { fill: 'F0F0F0', type: ShadingType.CLEAR },
            children: [new Paragraph({ children: [new TextRun({ text: 'Concluído? S/N', bold: true, size: 18, font: FONT })] })] }),
          new TableCell({ borders, width: { size: colForm[4], type: WidthType.DXA }, margins: CELL_MARGINS,
            shading: { fill: 'F0F0F0', type: ShadingType.CLEAR },
            children: [new Paragraph({ children: [new TextRun({ text: 'Ano', bold: true, size: 18, font: FONT })] })] })
        ]}),
        ...formacoes.map((f: any) => new TableRow({ children: [
          new TableCell({ borders, width: { size: colForm[0], type: WidthType.DXA }, margins: CELL_MARGINS,
            children: [new Paragraph({ children: [new TextRun({ text: fmtFormacao(f.tipo), size: 18, font: FONT })] })] }),
          new TableCell({ borders, width: { size: colForm[1], type: WidthType.DXA }, margins: CELL_MARGINS,
            children: [new Paragraph({ children: [new TextRun({ text: f.curso || '-', size: 18, font: FONT })] })] }),
          new TableCell({ borders, width: { size: colForm[2], type: WidthType.DXA }, margins: CELL_MARGINS,
            children: [new Paragraph({ children: [new TextRun({ text: f.instituicao || '-', size: 18, font: FONT })] })] }),
          new TableCell({ borders, width: { size: colForm[3], type: WidthType.DXA }, margins: CELL_MARGINS,
            children: [new Paragraph({ children: [new TextRun({ text: f.em_andamento ? 'N' : 'S', size: 18, font: FONT })] })] }),
          new TableCell({ borders, width: { size: colForm[4], type: WidthType.DXA }, margins: CELL_MARGINS,
            children: [new Paragraph({ children: [new TextRun({ text: f.data_conclusao || '-', size: 18, font: FONT })] })] })
        ]}))
      ]
    }));
  }

  // --- INFORMAÇÕES ADICIONAIS ---
  children.push(new Paragraph({
    spacing: { before: 200, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: MAGENTA, space: 1 } },
    children: [new TextRun({ text: 'INFORMAÇÕES ADICIONAIS:', bold: true, size: 22, font: FONT, color: MAGENTA })]
  }));
  children.push(new Paragraph({ spacing: { after: 40 }, children: [
    new TextRun({ text: 'DISPONIBILIDADE: ', bold: true, size: 20, font: FONT }),
    new TextRun({ text: (dados.disponibilidade || 'A combinar').toUpperCase(), size: 20, font: FONT })
  ]}));
  if (dados.modalidade_trabalho) {
    children.push(new Paragraph({ spacing: { after: 40 }, children: [
      new TextRun({ text: 'ATUAÇÃO: ', bold: true, size: 20, font: FONT }),
      new TextRun({ text: dados.modalidade_trabalho.toUpperCase().replace('HIBRIDO', 'REMOTO / HÍBRIDO'), size: 20, font: FONT })
    ]}));
  }
  if (dados.cidade || dados.estado) {
    children.push(new Paragraph({ spacing: { after: 40 }, children: [
      new TextRun({ text: 'CIDADE/ESTADO: ', bold: true, size: 20, font: FONT }),
      new TextRun({ text: [dados.cidade, dados.estado].filter(Boolean).join(' – ').toUpperCase(), size: 20, font: FONT })
    ]}));
  }
  if (dados.nivel_hierarquico) {
    children.push(new Paragraph({ spacing: { after: 40 }, children: [
      new TextRun({ text: 'NÍVEL HIERÁRQUICO: ', bold: true, size: 20, font: FONT }),
      new TextRun({ text: (dados.nivel_hierarquico || '').toUpperCase(), size: 20, font: FONT })
    ]}));
  }

  // Criar documento
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: FONT, size: 20, color: '333333' } }
      }
    },
    sections: [{
      properties: {
        page: {
          size: { width: A4_WIDTH, height: A4_HEIGHT },
          margin: { top: 1134, right: 850, bottom: 1134, left: 850 }
        }
      },
      children
    }]
  });

  const packerResult = await Packer.toBuffer(doc);
  return Buffer.isBuffer(packerResult) ? packerResult : Buffer.from(packerResult);
}
