/**
 * entrevista-docx.ts - Geração de Roteiro de Entrevista em DOCX (Word)
 * 
 * Gera documento Word com papel timbrado TechFor contendo:
 * - Background (papel timbrado) em todas as páginas
 * - Cabeçalho com título "Roteiro de Entrevista Técnica"
 * - Dados do candidato e vaga
 * - Perguntas organizadas por categoria
 * - Linhas pontilhadas para anotações
 * - Rodapé com paginação e data
 * 
 * Reutiliza o mesmo background do cv-generator-docx.ts
 * 
 * Versão: 1.0
 * Data: 27/02/2026
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, Header, Footer, AlignmentType, BorderStyle, WidthType, 
  ShadingType, PageNumber, NumberFormat
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
const noBorders = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
};

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
    const { candidato, vaga, perguntas, data } = req.body;

    if (!perguntas || !Array.isArray(perguntas) || perguntas.length === 0) {
      return res.status(400).json({ error: 'perguntas é obrigatório e deve ser um array' });
    }

    const result = await gerarDocxEntrevista({
      candidatoNome: candidato?.nome || 'Candidato',
      vagaTitulo: vaga?.titulo || 'Vaga não informada',
      vagaCodigo: vaga?.codigo || '',
      dataEntrevista: data || new Date().toLocaleDateString('pt-BR'),
      perguntas
    });

    const realBuffer = Buffer.isBuffer(result) ? result : Buffer.from(result);
    const base64 = realBuffer.toString('base64');
    const filename = `Entrevista_${(candidato?.nome || 'Candidato').replace(/[^a-zA-Z0-9_\-\s]/g, '').replace(/\s+/g, '_')}_${(data || new Date().toLocaleDateString('pt-BR')).replace(/\//g, '-')}.docx`;

    return res.status(200).json({
      docx_base64: base64,
      filename,
      size: realBuffer.length
    });

  } catch (error: any) {
    console.error('❌ Erro entrevista-docx:', error?.message || error);
    console.error('❌ Stack:', error?.stack);
    return res.status(500).json({
      error: error?.message || 'Erro interno ao gerar DOCX de entrevista',
      details: process.env.NODE_ENV === 'development' ? error?.stack : undefined
    });
  }
}

// ============================================
// GERADOR DOCX ENTREVISTA
// ============================================
interface EntrevistaDocxData {
  candidatoNome: string;
  vagaTitulo: string;
  vagaCodigo: string;
  dataEntrevista: string;
  perguntas: Array<{
    categoria: string;
    icone?: string;
    perguntas: Array<{
      pergunta: string;
      objetivo?: string;
      o_que_avaliar?: string[];
      red_flags?: string[];
    }>;
  }>;
}

async function gerarDocxEntrevista(dados: EntrevistaDocxData): Promise<Buffer> {
  // Tentar montar header com background TechFor
  let headerWithBg: Header | undefined;

  try {
    const bgBuffer = Buffer.from(TECHFOR_BG_BASE64, 'base64');
    console.log('📐 Background buffer size:', bgBuffer.length);

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
    console.log('✅ Header com background criado para entrevista');
  } catch (bgError: any) {
    console.warn('⚠️ Não foi possível criar background, gerando sem papel timbrado:', bgError.message);
    headerWithBg = undefined;
  }

  // Construir conteúdo
  const children: any[] = [];

  // --- TÍTULO ---
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 100, after: 100 },
    children: [
      new TextRun({
        text: 'ROTEIRO DE ENTREVISTA TÉCNICA',
        bold: true,
        size: 32,
        color: '000000',
        font: FONT
      })
    ]
  }));

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [
      new TextRun({
        text: 'Sistema RMS RAISA Techfor',
        size: 18,
        color: '666666',
        font: FONT,
        italics: true
      })
    ]
  }));

  // --- DADOS DO CANDIDATO (Tabela) ---
  const halfWidth = Math.floor(CONTENT_WIDTH / 2);

  children.push(new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [halfWidth, halfWidth],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders,
            width: { size: halfWidth, type: WidthType.DXA },
            margins: CELL_MARGINS,
            shading: { fill: 'F5F5F5', type: ShadingType.CLEAR },
            children: [new Paragraph({
              children: [
                new TextRun({ text: 'Candidato: ', bold: true, size: 20, font: FONT }),
                new TextRun({ text: dados.candidatoNome, size: 20, font: FONT })
              ]
            })]
          }),
          new TableCell({
            borders,
            width: { size: halfWidth, type: WidthType.DXA },
            margins: CELL_MARGINS,
            shading: { fill: 'F5F5F5', type: ShadingType.CLEAR },
            children: [new Paragraph({
              children: [
                new TextRun({ text: 'Data: ', bold: true, size: 20, font: FONT }),
                new TextRun({ text: dados.dataEntrevista, size: 20, font: FONT })
              ]
            })]
          })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({
            borders,
            width: { size: CONTENT_WIDTH, type: WidthType.DXA },
            margins: CELL_MARGINS,
            shading: { fill: 'F5F5F5', type: ShadingType.CLEAR },
            columnSpan: 2,
            children: [new Paragraph({
              children: [
                new TextRun({ text: 'Vaga: ', bold: true, size: 20, font: FONT }),
                new TextRun({ 
                  text: `${dados.vagaTitulo}${dados.vagaCodigo ? ' - ' + dados.vagaCodigo : ''}`, 
                  size: 20, font: FONT 
                })
              ]
            })]
          })
        ]
      })
    ]
  }));

  children.push(new Paragraph({ spacing: { before: 200, after: 100 }, children: [] }));

  // --- PERGUNTAS POR CATEGORIA ---
  let perguntaNum = 1;

  dados.perguntas.forEach((categoria) => {
    // Perguntas da categoria (sem título/tópico de categoria)
    categoria.perguntas.forEach((p) => {
      // Número + Pergunta
      children.push(new Paragraph({
        spacing: { before: 80, after: 40 },
        children: [
          new TextRun({
            text: `${perguntaNum}. `,
            bold: true,
            size: 20,
            font: FONT,
            color: '333333'
          }),
          new TextRun({
            text: p.pergunta,
            bold: true,
            size: 20,
            font: FONT,
            color: '333333'
          })
        ]
      }));

      // Linhas pontilhadas para anotações (2 linhas - espaço reduzido)
      children.push(new Paragraph({ spacing: { before: 40, after: 0 }, children: [] }));
      
      for (let i = 0; i < 2; i++) {
        children.push(new Paragraph({
          spacing: { before: 60, after: 60 },
          indent: { left: 360 },
          border: {
            bottom: {
              style: BorderStyle.DOTTED,
              size: 1,
              color: 'CCCCCC',
              space: 1
            }
          },
          children: [
            new TextRun({
              text: ' ',
              size: 20,
              font: FONT
            })
          ]
        }));
      }

      children.push(new Paragraph({ spacing: { before: 40, after: 40 }, children: [] }));

      perguntaNum++;
    });

    // Espaço entre categorias
    children.push(new Paragraph({ spacing: { before: 100, after: 100 }, children: [] }));
  });

  // --- RODAPÉ com paginação ---
  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: `Gerado em ${dados.dataEntrevista} | Sistema RMS RAISA Techfor | Página `,
            size: 14,
            font: FONT,
            color: '999999'
          }),
          new TextRun({
            children: [PageNumber.CURRENT],
            size: 14,
            font: FONT,
            color: '999999'
          }),
          new TextRun({
            text: ' de ',
            size: 14,
            font: FONT,
            color: '999999'
          }),
          new TextRun({
            children: [PageNumber.TOTAL_PAGES],
            size: 14,
            font: FONT,
            color: '999999'
          })
        ]
      })
    ]
  });

  // Criar documento
  const sectionProps: any = {
    properties: {
      page: {
        size: { width: A4_WIDTH, height: A4_HEIGHT },
        margin: { top: 1640, right: 566, bottom: 2200, left: 1560 },
        pageNumbers: { start: 1 }
      }
    },
    children
  };

  // Adicionar header com background e footer
  if (headerWithBg) {
    sectionProps.headers = { default: headerWithBg };
  }
  sectionProps.footers = { default: footer };

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

  const packerResult = await Packer.toBuffer(doc);
  return Buffer.isBuffer(packerResult) ? packerResult : Buffer.from(packerResult);
}
