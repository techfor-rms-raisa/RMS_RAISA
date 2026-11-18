/**
 * fichaInclusaoParser.ts - Parser POSICIONAL da Ficha de Inclusão (FORM0005.18_01_11_2021)
 *
 * VERSÃO: v1.0 - 18/11/2026
 *
 * CAUSA RAIZ (diagnosticada com pdf.js 3.11.174 sobre fichas reais):
 *  - page.getTextContent() devolve os itens na ORDEM DO CONTENT STREAM gerado pelo Excel,
 *    e não na ordem visual da ficha. Ex.: "DADOS DO PROFISSIONAL" chega DEPOIS dos e-mails
 *    do cabeçalho, e o "NOME:" do contato de emergência chega DEPOIS do NOME do consultor.
 *  - O parser antigo (linha a linha + flags de seção + "próxima linha") herdava essa ordem
 *    embaralhada → e-mail do APROVADOR gravado como e-mail do consultor, nome do contato de
 *    EMERGÊNCIA gravado como nome do consultor, DATA EMISSÃO no lugar da DATA DE INÍCIO, etc.
 *
 * SOLUÇÃO:
 *  1. Reconstruir a ordem visual pelas coordenadas (x, y) de cada item → linhas da ficha.
 *  2. Delimitar as seções do modelo: cabeçalho | DADOS DO PROFISSIONAL | EMERGÊNCIA |
 *     DADOS PAGAMENTO/FATURAMENTO | OBSERVAÇÕES | rodapé de assinaturas.
 *  3. Ler cada campo SOMENTE no seu rótulo e na sua seção (campos sublinhados do modelo).
 *     E-mails e telefones do SOLICITANTE e do APROVADOR (cabeçalho) nunca são considerados.
 *
 * Módulo puro (sem React/Supabase) → testável isoladamente.
 */

// ============================================
// TIPOS
// ============================================

export interface FichaTextItem {
    str: string;
    page: number;
    /** posição X relativa à largura da página (0–1) */
    x: number;
    /** fim do item em X relativo (0–1) */
    xEnd: number;
    /** linha de base em pontos PDF (origem embaixo) */
    y: number;
}

export interface FichaCell {
    str: string;
    /** texto sem acento e em maiúsculas, com o MESMO comprimento de `str` */
    base: string;
    x: number;
    xEnd: number;
}

export interface FichaRow {
    page: number;
    y: number;
    cells: FichaCell[];
}

export interface FichaInclusaoDados {
    // Cabeçalho
    cliente: string;
    nomeSolicitante: string;
    responsavelAprovador: string;
    nomeSubstituido: string;
    substituicao: boolean;
    faturavel: boolean;
    // DADOS DO PROFISSIONAL
    nomeConsultor: string;
    dtNascimento: string;   // dd/mm/aaaa
    empresa: string;
    cnpj: string;           // 00.000.000/0000-00
    cpf: string;            // 000.000.000-00
    rg: string;
    email: string;
    celular: string;        // DDD-99999-9999
    funcao: string;
    tecnologia: string;
    // DADOS PAGAMENTO / FATURAMENTO (coluna NOVO)
    formaContratacao: string;
    dataInicio: string;     // dd/mm/aaaa
    valorPagamento: string; // número em formato BR, sem "R$" (ex.: "2.384,00", "80")
    faturamentoMensal: string;
    // OBSERVAÇÕES
    observacoes: string;
    // Rodapé
    dataEmissao: string;
    recursosHumanos: string;
    gestaoDePessoas: string;
    // Diagnóstico
    avisos: string[];
}

/** Subconjunto estrutural do PDFDocumentProxy do pdf.js usado aqui */
interface PdfPageLike {
    getTextContent(): Promise<{ items: unknown[] }>;
    getViewport(params: { scale: number }): { width: number };
}
export interface PdfDocumentLike {
    numPages: number;
    getPage(pageNumber: number): Promise<PdfPageLike>;
}

// ============================================
// HELPERS DE TEXTO
// ============================================

/** Remove acento e põe em maiúsculas preservando o comprimento (índices batem com o original) */
const semAcento = (s: string): string =>
    s.split('').map(ch => ch.normalize('NFD').charAt(0).toUpperCase().charAt(0)).join('');

const limpar = (s: string): string =>
    s.replace(/^\s*:\s*/, '').replace(/\s+/g, ' ').trim();

/** Placeholders do modelo: XXX, XXXXX, X----X, X, -, ___ */
const ehPlaceholder = (v: string): boolean => {
    const t = v.replace(/\s+/g, '');
    return !t || /^[X\-_.*]+$/i.test(t);
};

const semPlaceholder = (v: string): string => (ehPlaceholder(v) ? '' : v);

/**
 * Célula que é um rótulo do modelo: "TEXTO EM MAIÚSCULAS:" no início, OU rótulo sublinhado
 * separado dos dois-pontos ("E-MAIL" seguido do item ": valor").
 */
const ehRotulo = (cel: FichaCell, proxima?: FichaCell): boolean => {
    const m = cel.str.match(/^([^:]{2,45}):/);
    const parte = m ? m[1].trim() : (proxima && /^\s*:/.test(proxima.str) ? cel.str.trim() : '');
    return !!parte && parte.length <= 45 && parte === parte.toUpperCase() && /[A-ZÀ-Ý]{2}/.test(parte);
};

/** Marcadores de senioridade da FUNÇÃO: "SR ( X )", "PL ( )", "JR ( )" */
const ehMarcadorSenioridade = (cel: FichaCell): boolean => /^(SR|PL|JR)\s*\(/.test(cel.base);

const centro = (c: FichaCell): number => (c.x + c.xEnd) / 2;

/**
 * Rótulo do modelo (texto sem acento, maiúsculo). Os rótulos SUBLINHADOS do modelo saem do Excel
 * como um item de texto separado ("EMPRESA" | ": TOLEDO..."), por isso os dois-pontos podem estar
 * no próprio item OU no item seguinte: aceita "ROTULO:", "ROTULO :" e "ROTULO" isolado.
 */
const rotulo = (padrao: string): RegExp => new RegExp(`^(?:${padrao})\\s*(?::|$)`);

// ============================================
// NORMALIZADORES DE CAMPO
// ============================================

const extrairData = (v: string): string => {
    const m = v.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!m) return '';
    const dia = Number(m[1]);
    const mes = Number(m[2]);
    if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return '';
    return `${m[1]}/${m[2]}/${m[3]}`;
};

const extrairCpf = (v: string): string => {
    const d = v.replace(/\D/g, '');
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return '';
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};

const extrairCnpj = (v: string): string => {
    const d = v.replace(/\D/g, '');
    if (d.length !== 14 || /^0{8}/.test(d)) return '';
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
};

const extrairEmail = (v: string): string => {
    const m = v.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    if (!m) return '';
    const email = m[0].toLowerCase();
    return /^x+@x+\.x+$/.test(email) ? '' : email;
};

/** Celular no formato do sistema: DDD-99999-9999 (ou DDD-9999-9999) */
const extrairCelular = (v: string): string => {
    let d = v.replace(/\D/g, '');
    if (d.length === 13 && d.startsWith('55')) d = d.slice(2);
    if (d.length === 12 && d.startsWith('0')) d = d.slice(1);
    if (!d || /^9+$/.test(d)) return '';
    if (d.length === 11) return `${d.slice(0, 2)}-${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`;
    return d.length >= 8 ? v.trim() : '';
};

/** Valor monetário em formato BR sem "R$" ("R$ 2.384,00" → "2.384,00"; "R$ 80/hr" → "80") */
const extrairValor = (v: string): string => {
    const m = v.match(/\d[\d.,]*/);
    if (!m) return '';
    let num = m[0].replace(/[.,]$/, '');
    // Decimal digitado com ponto (ex.: 80.50) → padrão BR (80,50)
    if (!num.includes(',') && /\.\d{1,2}$/.test(num)) num = num.replace(/\.(\d{1,2})$/, ',$1');
    const n = parseFloat(num.replace(/\./g, '').replace(',', '.'));
    return !isNaN(n) && n > 0 ? num : '';
};

const extrairFormaContratacao = (v: string): string => {
    const b = semAcento(v);
    if (/\bCLT\b/.test(b)) return 'CLT';
    if (/\bPJ\b/.test(b)) return 'PJ';
    if (/TEMPORARIO/.test(b)) return 'Temporário';
    return semPlaceholder(limpar(v));
};

/** FUNÇÃO sem os marcadores "SR ( ) PL ( ) JR ( )" e sem placeholder do modelo */
const limparFuncao = (v: string): string =>
    semPlaceholder(limpar(v.replace(/\s*\b(SR|PL|JR)\s*\([^)]*\).*$/i, '')));

// ============================================
// 1) EXTRAÇÃO DOS ITENS COM COORDENADAS
// ============================================

export async function extrairItensFicha(pdf: PdfDocumentLike): Promise<FichaTextItem[]> {
    const itens: FichaTextItem[] = [];
    for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const largura = page.getViewport({ scale: 1 }).width || 1;
        const conteudo = await page.getTextContent();
        for (const raw of conteudo.items) {
            const it = raw as { str?: unknown; transform?: unknown; width?: unknown };
            if (typeof it.str !== 'string' || !Array.isArray(it.transform)) continue;
            const str = it.str.normalize('NFC').replace(/\s+/g, ' ').trim();
            if (!str) continue;
            const x = Number(it.transform[4]) || 0;
            const y = Number(it.transform[5]) || 0;
            const w = typeof it.width === 'number' ? it.width : 0;
            itens.push({ str, page: p, x: x / largura, xEnd: (x + w) / largura, y });
        }
    }
    return itens;
}

// ============================================
// 2) RECONSTRUÇÃO DAS LINHAS VISUAIS
// ============================================

/** Agrupa itens com a mesma linha de base (± tolerância em pontos), de cima para baixo, esquerda→direita */
export function montarLinhasVisuais(itens: FichaTextItem[], tolerancia = 2.5): FichaRow[] {
    const ordenados = [...itens].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
    const linhas: FichaRow[] = [];
    let atual: FichaRow | null = null;
    for (const it of ordenados) {
        if (!atual || it.page !== atual.page || atual.y - it.y > tolerancia) {
            atual = { page: it.page, y: it.y, cells: [] };
            linhas.push(atual);
        }
        atual.cells.push({ str: it.str, base: semAcento(it.str), x: it.x, xEnd: it.xEnd });
    }
    linhas.forEach(l => l.cells.sort((a, b) => a.x - b.x));
    return linhas;
}

// ============================================
// 3) PARSER POR RÓTULO + SEÇÃO
// ============================================

interface RotuloEncontrado {
    linha: number;
    celula: number;
    /** texto da própria célula após o rótulo */
    resto: string;
}

export function parseFichaInclusao(rows: FichaRow[]): FichaInclusaoDados {
    const avisos: string[] = [];

    const indiceLinha = (padrao: RegExp, desde = 0): number => {
        for (let i = Math.max(0, desde); i < rows.length; i++) {
            if (rows[i].cells.some(c => padrao.test(c.base))) return i;
        }
        return -1;
    };

    const acharRotulo = (ini: number, fim: number, padrao: RegExp): RotuloEncontrado | null => {
        for (let i = Math.max(0, ini); i < Math.min(fim, rows.length); i++) {
            const cells = rows[i].cells;
            for (let c = 0; c < cells.length; c++) {
                const m = cells[c].base.match(padrao);
                if (m && m.index === 0) return { linha: i, celula: c, resto: cells[c].str.slice(m[0].length) };
            }
        }
        return null;
    };

    /** Valor inline do rótulo + células seguintes da mesma linha até o próximo rótulo */
    const valorAposRotulo = (r: RotuloEncontrado | null): string => {
        if (!r) return '';
        const cells = rows[r.linha].cells;
        const partes = [r.resto];
        for (let c = r.celula + 1; c < cells.length; c++) {
            if (ehRotulo(cells[c], cells[c + 1]) || ehMarcadorSenioridade(cells[c])) break;
            partes.push(cells[c].str);
        }
        return limpar(partes.join(' '));
    };

    // ---------- Seções do modelo ----------
    const iProf = indiceLinha(/^DADOS DO PROFISSIONAL\b/);
    if (iProf < 0) {
        throw new Error('Ficha fora do padrão FORM0005: seção "DADOS DO PROFISSIONAL" não encontrada no PDF.');
    }
    let iEmerg = indiceLinha(/^INFORMACOES DE EMERGENCIA\b/, iProf + 1);
    const iFinIni = indiceLinha(/^(DADOS PAGAMENTO|FORMA DE CONTRATACAO)\b/, iProf + 1);
    if (iEmerg < 0) iEmerg = iFinIni >= 0 ? iFinIni : rows.length;
    const iObs = indiceLinha(/^OBSERVACOES\b/, iEmerg);
    const iDeslig = indiceLinha(/^FORMA DE DESLIGAMENTO\b/, iEmerg);
    const iFinFim = iDeslig >= 0 ? iDeslig : (iObs >= 0 ? iObs : rows.length);

    // ---------- CABEÇALHO [0, iProf) — somente rótulos do cabeçalho ----------
    const cliente = semPlaceholder(valorAposRotulo(acharRotulo(0, iProf, rotulo('CLIENTE'))));
    const nomeSolicitante = semPlaceholder(valorAposRotulo(acharRotulo(0, iProf, rotulo('NOME SOLICITANTE'))));
    const responsavelAprovador = semPlaceholder(
        valorAposRotulo(acharRotulo(0, iProf, rotulo('RESPONSAVEL APROVADOR DE HORAS')))
    );

    const substRaw = valorAposRotulo(acharRotulo(0, iProf, rotulo('NOME DO PROFISSIONAL SUBSTITUIDO')));
    const substConfidencial = /CONFIDENCIAL/.test(semAcento(substRaw));
    const nomeSubstituido = semPlaceholder(limpar(substRaw.replace(/\(?\s*confidencial\s*\)?/gi, '')));
    // As caixas INCLUSÃO / REF.SUBSTITUIÇÃO são imagens (não existem no texto do PDF):
    // substituição = nome do substituído preenchido (ou marcado como confidencial).
    const substituicao = !!nomeSubstituido || substConfidencial;

    // FATURÁVEL / NÃO FATURÁVEL também são imagens → mantém o padrão do sistema (faturável).
    const faturavel = true;
    avisos.push('FATURÁVEL/NÃO FATURÁVEL são caixas gráficas no PDF (sem texto): assumido FATURÁVEL.');

    // ---------- DADOS DO PROFISSIONAL [iProf, iEmerg) — campos sublinhados ----------
    const nomeConsultor = semPlaceholder(valorAposRotulo(acharRotulo(iProf, iEmerg, rotulo('NOME'))));
    const dtNascimento = extrairData(valorAposRotulo(acharRotulo(iProf, iEmerg, rotulo('(?:DT|DATA DE) NASCIMENTO'))));
    const empresa = semPlaceholder(valorAposRotulo(acharRotulo(iProf, iEmerg, rotulo('EMPRESA'))));
    const cnpj = extrairCnpj(valorAposRotulo(acharRotulo(iProf, iEmerg, rotulo('CNPJ'))));
    const cpf = extrairCpf(valorAposRotulo(acharRotulo(iProf, iEmerg, rotulo('CPF'))));
    const rg = semPlaceholder(valorAposRotulo(acharRotulo(iProf, iEmerg, rotulo('RG'))));
    const celular = extrairCelular(valorAposRotulo(acharRotulo(iProf, iEmerg, rotulo('TELEFONE CELULAR'))));
    const funcao = limparFuncao(valorAposRotulo(acharRotulo(iProf, iEmerg, rotulo('FUNCAO'))));

    // E-MAIL do PROFISSIONAL: SOMENTE o rótulo dentro de DADOS DO PROFISSIONAL.
    // Os 2 e-mails do cabeçalho (solicitante e aprovador) ficam fora desta faixa → ignorados.
    let email = extrairEmail(valorAposRotulo(acharRotulo(iProf, iEmerg, rotulo('E\\s*-?\\s*MAIL'))));
    if (!email) {
        // Rótulo e valor em itens separados de linhas diferentes: aceita apenas um e-mail
        // ÚNICO dentro da própria seção DADOS DO PROFISSIONAL (nunca do cabeçalho).
        const naSecao = new Set<string>();
        for (let i = iProf; i < iEmerg; i++) {
            rows[i].cells.forEach(c => {
                const e = extrairEmail(c.str);
                if (e) naSecao.add(e);
            });
        }
        if (naSecao.size === 1) email = [...naSecao][0];
        else avisos.push('E-MAIL do profissional não encontrado na seção DADOS DO PROFISSIONAL.');
    }

    // TECNOLOGIA: valor inline + linhas de continuação alinhadas na mesma coluna (texto quebrado)
    let tecnologia = '';
    const rTec = acharRotulo(iProf, iEmerg, rotulo('TECNOLOGIA'));
    if (rTec) {
        const partes = [valorAposRotulo(rTec)];
        const xTec = rows[rTec.linha].cells[rTec.celula].x;
        let yAnterior = rows[rTec.linha].y;
        for (let i = rTec.linha + 1; i < Math.min(iEmerg, rTec.linha + 6); i++) {
            const iCont = rows[i].cells.findIndex(c => Math.abs(c.x - xTec) < 0.015);
            if (iCont < 0) continue; // linha de outra célula mesclada (ex.: FUNÇÃO centralizada verticalmente)
            const cont = rows[i].cells[iCont];
            if (ehRotulo(cont, rows[i].cells[iCont + 1]) || yAnterior - rows[i].y > 14) break; // próximo rótulo (CURSO:) ou fim do bloco
            partes.push(cont.str);
            yAnterior = rows[i].y;
        }
        tecnologia = semPlaceholder(limpar(partes.join(' ')));
    }

    // ---------- DADOS PAGAMENTO / FATURAMENTO — coluna NOVO ----------
    let colunas: { centros: number[]; novoEsq: number; novoDir: number } | null = null;
    for (let i = Math.max(iEmerg, 0); i < iFinFim; i++) {
        const novos = rows[i].cells.filter(c => c.base === 'NOVO');
        if (novos.length >= 2) {
            colunas = {
                centros: rows[i].cells.filter(c => /^(ITEM|NOVO|ANTERIOR)$/.test(c.base)).map(centro),
                novoEsq: centro(novos[0]),
                novoDir: centro(novos[novos.length - 1]),
            };
            break;
        }
    }
    if (!colunas) avisos.push('Cabeçalho ITEM/NOVO/ANTERIOR não encontrado: usando valor à direita do rótulo.');

    const valorTabela = (padrao: RegExp, lado: 'esq' | 'dir'): string => {
        const r = acharRotulo(iEmerg, iFinFim, padrao);
        if (!r) return '';
        const cells = rows[r.linha].cells;
        if (colunas) {
            const { centros } = colunas;
            const alvo = lado === 'esq' ? colunas.novoEsq : colunas.novoDir;
            const maisProximo = (cx: number): number =>
                centros.reduce((best, c) => (Math.abs(c - cx) < Math.abs(best - cx) ? c : best), centros[0]);
            return limpar(cells.filter((c, ci) => ci !== r.celula && maisProximo(centro(c)) === alvo)
                .map(c => c.str).join(' '));
        }
        const prox = cells[r.celula + 1];
        return prox && !ehRotulo(prox, cells[r.celula + 2]) ? limpar(prox.str) : '';
    };

    const formaContratacao = extrairFormaContratacao(valorTabela(/^FORMA DE CONTRATACAO\b/, 'esq'));
    const dataInicio = extrairData(valorTabela(/^DATA DE INICIO\b/, 'esq'));
    const valorPagamento = extrairValor(valorTabela(/^VALOR\s*:?$/, 'esq'));
    const faturamentoMensal = extrairValor(valorTabela(/^FATURAMENTO MENSAL\b/, 'dir'));
    if (!dataInicio) avisos.push('DATA DE INÍCIO não encontrada na coluna NOVO.');

    // ---------- OBSERVAÇÕES: da linha do rótulo até EQUIPAMENTOS ----------
    let observacoes = '';
    if (iObs >= 0) {
        const iEquip = indiceLinha(/^EQUIPAMENTOS\b/, iObs + 1);
        const fimObs = iEquip > iObs ? iEquip : Math.min(rows.length, iObs + 15);
        const partes: string[] = [];
        for (let i = iObs; i < fimObs; i++) {
            for (const cel of rows[i].cells) {
                const m = i === iObs ? cel.base.match(/^OBSERVACOES\s*:?/) : null;
                partes.push(m ? cel.str.slice(m[0].length) : cel.str);
            }
        }
        observacoes = limpar(partes.join(' '));
    }

    // ---------- RODAPÉ: cabeçalhos e valores por proximidade de coluna ----------
    const rodape: Record<string, string> = {};
    const iRod = rows.findIndex(r =>
        r.cells.some(c => /^RECURSOS HUMANOS$/.test(c.base)) && r.cells.some(c => /^DATA EMISSAO$/.test(c.base))
    );
    if (iRod >= 0 && iRod + 1 < rows.length) {
        const cab = rows[iRod];
        const val = rows[iRod + 1];
        const ehRodapeEmpresa = val.cells.some(c => /TECH FOR|FORM0005|AVENIDA PAULISTA/.test(c.base));
        if (val.page === cab.page && cab.y - val.y < 40 && !ehRodapeEmpresa) {
            for (const v of val.cells) {
                const h = cab.cells.reduce((best, c) =>
                    Math.abs(centro(c) - centro(v)) < Math.abs(centro(best) - centro(v)) ? c : best, cab.cells[0]);
                rodape[h.base] = limpar(`${rodape[h.base] || ''} ${v.str}`);
            }
        }
    } else {
        avisos.push('Rodapé (DATA EMISSÃO / RECURSOS HUMANOS) não encontrado.');
    }
    const dataEmissao = extrairData(rodape['DATA EMISSAO'] || '');
    const recursosHumanos = semPlaceholder(rodape['RECURSOS HUMANOS'] || '');
    const gestaoDePessoas = semPlaceholder(rodape['GESTAO DE PESSOAS'] || '');

    return {
        cliente, nomeSolicitante, responsavelAprovador, nomeSubstituido, substituicao, faturavel,
        nomeConsultor, dtNascimento, empresa, cnpj, cpf, rg, email, celular, funcao, tecnologia,
        formaContratacao, dataInicio, valorPagamento, faturamentoMensal,
        observacoes, dataEmissao, recursosHumanos, gestaoDePessoas,
        avisos,
    };
}
