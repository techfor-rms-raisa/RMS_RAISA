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
import { TECHFOR_BG_BASE64 } from './cv-generator-docx-bg';

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
      const buffer = await gerarDocxTechfor(dados);
      
      // Retornar como base64 para o frontend baixar
      const base64 = buffer.toString('base64');
      return res.status(200).json({ 
        docx_base64: base64,
        filename: `CV_${(dados.nome || 'Candidato').replace(/\s+/g, '_')}_Techfor.docx`,
        size: buffer.length
      });
    }

    return res.status(400).json({ error: `Template '${templateType}' não suportado para DOCX ainda` });

  } catch (error: any) {
    console.error('❌ Erro cv-generator-docx:', error);
    return res.status(500).json({ error: error.message });
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
  // Decodificar imagem de background
  const bgBuffer = Buffer.from(TECHFOR_BG_BASE64, 'base64');

  // Build header com background que repete em todas as páginas
  const headerWithBg = new Header({
    children: [
      new Paragraph({
        children: [
          new ImageRun({
            data: bgBuffer,
            transformation: { width: 595, height: 842 },
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
  const hardSkills = dados.hard_skills_tabela || [];
  const diffItems = reqsDiferenciais.length > 0
    ? reqsDiferenciais.map((r: any) => ({ tec: r.tecnologia, tempo: r.tempo_experiencia }))
    : hardSkills.map((s: any) => ({ tec: s.tecnologia, tempo: s.tempo_experiencia }));

  if (diffItems.length > 0) {
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
        ...diffItems.map((i: any) => new TableRow({ children: [
          makeDataCell(i.tec, colWidths[0], 18),
          makeDataCell(i.tempo, colWidths[1], 18)
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

      // "Principais Atividades:"
      children.push(new Paragraph({
        spacing: { after: 20 },
        children: [new TextRun({ text: 'Principais Atividades:', size: 20, font: FONT })]
      }));

      // Atividades como bullets (usar texto com "• " para evitar problemas de numbering)
      const atividades = exp.principais_atividades 
        || (exp.descricao ? exp.descricao.split('\n').filter((a: string) => a.trim()) : []);
      atividades.forEach((a: string) => {
        children.push(new Paragraph({
          spacing: { after: 20 },
          indent: { left: 360 },
          children: [
            new TextRun({ text: '• ', size: 20, font: FONT }),
            new TextRun({ text: a.trim().replace(/^[-•]\s*/, ''), size: 18, font: FONT })
          ]
        }));
      });

      // Motivo de saída
      if (exp.motivo_saida) {
        children.push(new Paragraph({
          spacing: { before: 40, after: 40 },
          children: [
            new TextRun({ text: 'Motivo de saída: ', bold: true, italics: true, size: 18, font: FONT, color: '555555' }),
            new TextRun({ text: exp.motivo_saida, italics: true, size: 18, font: FONT, color: '555555' })
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
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 20, color: '333333' }
        }
      }
    },
    sections: [{
      properties: {
        page: {
          size: { width: A4_WIDTH, height: A4_HEIGHT },
          margin: { top: 720, right: 1134, bottom: 720, left: 1560 }
        }
      },
      headers: { default: headerWithBg },
      children
    }]
  });

  return await Packer.toBuffer(doc) as unknown as Buffer;
}
