/**
 * lib/comparadores.ts — Helpers de comparação textual para Revalidação de Leads
 *
 * v1.0 (17/06/2026)
 *
 * Implementa a Seção 3.3.4 da especificação (Comparação de empresa: critério
 * de similaridade): normalização de nome com remoção de sufixos societários,
 * distância de Levenshtein e comparação combinada nome+domínio.
 *
 * Exports:
 *   - normalizarNomeEmpresa(nome) → string normalizada
 *   - distanciaLevenshtein(a, b) → número inteiro
 *   - similaridadeLevenshtein(a, b) → número [0..1]
 *   - compararEmpresas(empA, empB, threshold?) → { iguais, metodo, score? }
 *
 * Caminho: lib/comparadores.ts
 */

// ────────────────────────────────────────────────────────────────────────
// Sufixos societários comuns (PT-BR e EN), removidos da cauda do nome.
// Ex: "Banco do Brasil S.A." → "banco do brasil"
// ────────────────────────────────────────────────────────────────────────
const SUFIXOS_SOCIETARIOS = [
  's.a.', 's.a', 'sa', 's/a',
  'ltda.', 'ltda', 'ltda - me', 'ltda-me',
  'me', 'epp', 'eireli',
  'inc.', 'inc', 'corp.', 'corp', 'co.', 'co',
  'limited', 'limitada',
];

/**
 * Normaliza um nome de empresa para comparação:
 *   - lowercase
 *   - remove acentos
 *   - remove sufixos societários no FINAL da string
 *   - remove pontuação (mantém espaços e alfanumérico)
 *   - colapsa espaços múltiplos
 */
export function normalizarNomeEmpresa(nome: string | null | undefined): string {
  if (!nome) return '';
  let s = nome.toLowerCase().trim();

  // Remove acentos (NFD + remoção de marks combinantes)
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Remove sufixos societários no FINAL — itera em ordem decrescente de
  // tamanho para evitar match parcial (ex: 'ltda' antes de 'ltd').
  const sufixosOrdenados = [...SUFIXOS_SOCIETARIOS].sort((a, b) => b.length - a.length);
  for (const suf of sufixosOrdenados) {
    const escapado = suf.replace(/[.\/]/g, c => `\\${c}`);
    const re = new RegExp(`[\\s,]+${escapado}\\s*$`, 'i');
    if (re.test(s)) {
      s = s.replace(re, '');
      break; // remove apenas um sufixo (não cascateia)
    }
  }

  // Remove caracteres não-alfanuméricos (mantém espaço)
  s = s.replace(/[^a-z0-9\s]/g, ' ');

  // Colapsa espaços múltiplos
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

/**
 * Distância de Levenshtein clássica (inserção, remoção, substituição
 * cada com peso 1). Complexidade: O(m*n) em tempo e memória.
 */
export function distanciaLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const m = a.length;
  const n = b.length;

  // Matriz (n+1) × (m+1), inicializada com bordas 0..n / 0..m
  const matrix: number[][] = [];
  for (let i = 0; i <= n; i++) matrix[i] = [i];
  for (let j = 0; j <= m; j++) matrix[0][j] = j;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const custo = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,         // remoção
        matrix[i][j - 1] + 1,         // inserção
        matrix[i - 1][j - 1] + custo  // substituição (ou match)
      );
    }
  }
  return matrix[n][m];
}

/**
 * Similaridade [0..1] entre duas strings já normalizadas.
 *   1 = idênticas
 *   0 = totalmente diferentes
 * Fórmula: 1 - (distância / comprimento máximo).
 */
export function similaridadeLevenshtein(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const dist = distanciaLevenshtein(a, b);
  return 1 - dist / maxLen;
}

// ────────────────────────────────────────────────────────────────────────
// COMPARAÇÃO INTELIGENTE de duas empresas (CRM vs descoberta externa).
// Regra (Seção 3.3.4 da spec):
//   1. Tem domínio dos dois lados? Compara domínio (exato) — mais confiável.
//   2. Sem domínio → compara nomes normalizados por Levenshtein.
//   3. Threshold padrão: 0.80 (sugerido na spec).
// ────────────────────────────────────────────────────────────────────────

export interface EmpresaParaComparar {
  nome?:    string | null;
  dominio?: string | null;
}

export interface ResultadoComparacaoEmpresa {
  /** Verdadeiro se forem consideradas a "mesma empresa". */
  iguais: boolean;
  /** Como a decisão foi tomada. */
  metodo: 'dominio_exato' | 'similaridade_nome' | 'sem_dados';
  /** Score de similaridade [0..1] quando o método foi por nome. */
  score?: number;
}

export function compararEmpresas(
  empA: EmpresaParaComparar,
  empB: EmpresaParaComparar,
  thresholdSimilaridade: number = 0.80
): ResultadoComparacaoEmpresa {
  // 1) Comparação por domínio (quando ambos presentes)
  const dA = (empA.dominio || '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  const dB = (empB.dominio || '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (dA && dB) {
    return {
      iguais: dA === dB,
      metodo: 'dominio_exato',
    };
  }

  // 2) Comparação por nome (Levenshtein normalizado)
  const nA = normalizarNomeEmpresa(empA.nome);
  const nB = normalizarNomeEmpresa(empB.nome);
  if (!nA || !nB) {
    return { iguais: false, metodo: 'sem_dados' };
  }

  const score = similaridadeLevenshtein(nA, nB);
  return {
    iguais: score >= thresholdSimilaridade,
    metodo: 'similaridade_nome',
    score,
  };
}
