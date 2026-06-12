/**
 * EMAIL PATTERNS GENERATOR — v1.0
 * Fase 1 (F2) — Email Recovery Pipeline (Fundação)
 * Data: 12/06/2026
 *
 * Reconciliação das fontes:
 *  - GERADOR_Endereços_e-mail.xlsx (Messias) → fonte de verdade operacional
 *  - Especificacao_Email_Recovery_Pipeline.md (13/05/2026)
 *
 * Total: 16 templates base × 2 extensões (.com / .com.br) = 32 endereços por lead.
 * Cobertura máxima alinhada com a decisão D5 ("todos os 30 padrões").
 *
 * USO:
 *   import { gerarVariacoes } from './_utils/email-patterns';
 *   const candidatos = gerarVariacoes({ nome: 'Luis', sobrenome: 'Cavanha', dominio: 'riachuelo.com' });
 *   // → [{ pattern_id: 'nome.sobrenome_com', email: 'luis.cavanha@riachuelo.com', template: 'nome.sobrenome', extensao: '.com' }, ...]
 *
 *   import { gerarPorPadrao } from './_utils/email-patterns';
 *   const um = gerarPorPadrao({ nome, sobrenome, dominio }, 'nome.sobrenome', '.com.br');
 *   // usado pelo auto-recovery quando o padrão da empresa já é "estável" (confianca >= 3)
 */

// ============================================================================
// TIPOS
// ============================================================================

export interface EmailPatternInput {
  nome: string;
  sobrenome: string;
  dominio: string; // ex: "riachuelo.com", "riachuelo.com.br" ou apenas "riachuelo"
}

export type Extensao = '.com' | '.com.br';

export interface EmailPatternResult {
  pattern_id: string; // identificador único (ex: 'nome.sobrenome_com.br')
  email: string;      // e-mail final gerado
  template: string;   // id do template base (ex: 'nome.sobrenome')
  extensao: Extensao;
}

// ============================================================================
// NORMALIZAÇÃO
// ============================================================================

/**
 * Normaliza nome ou sobrenome:
 *  - lowercase
 *  - remove acentos (NFD + faixa combining marks)
 *  - remove caracteres não-alfanuméricos (espaços, hífens, apóstrofos, etc.)
 *
 * Nota: para nomes compostos ("Maria Eduarda"), o espaço é removido
 * (vira "mariaeduarda"). Quem chama deve pré-processar se quiser comportamento
 * diferente.
 */
function normalizar(s: string): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Extrai a "base" do domínio, sem TLD reconhecido.
 *  'riachuelo.com.br' → 'riachuelo'
 *  'riachuelo.com'    → 'riachuelo'
 *  'riachuelo'        → 'riachuelo'
 *  '@riachuelo.com'   → 'riachuelo' (tolerante a "@" inicial)
 */
function extrairBaseDominio(d: string): string {
  if (!d) return '';
  const limpo = d.toLowerCase().trim().replace(/^@/, '');
  return limpo.replace(/\.(com\.br|com|net|org|io|app|tech)$/i, '');
}

// ============================================================================
// TEMPLATES (16 base × 2 extensões = 32)
// ============================================================================

interface BaseTemplate {
  id: string;
  build: (nome: string, sobrenome: string) => string;
}

const BASE_TEMPLATES: BaseTemplate[] = [
  // ── Grupo 1: nome + sobrenome (presentes em ambas as fontes) ─────────────
  { id: 'nome.sobrenome',   build: (n, s) => `${n}.${s}` },
  { id: 'nomesobrenome',    build: (n, s) => `${n}${s}` },
  { id: 'sobrenome.nome',   build: (n, s) => `${s}.${n}` },
  { id: 'sobrenomenome',    build: (n, s) => `${s}${n}` },

  // ── Grupo 2: inicial + sobrenome / sobrenome + inicial ───────────────────
  { id: 'n.sobrenome',      build: (n, s) => `${n[0]}.${s}` },
  { id: 'nsobrenome',       build: (n, s) => `${n[0]}${s}` },
  { id: 's.nome',           build: (n, s) => `${s[0]}.${n}` },
  { id: 'snome',            build: (n, s) => `${s[0]}${n}` },

  // ── Grupo 3: nome + inicial sobrenome ────────────────────────────────────
  { id: 'nome.s',           build: (n, s) => `${n}.${s[0]}` },
  { id: 'nomes',            build: (n, s) => `${n}${s[0]}` },
  { id: 'nome-s',           build: (n, s) => `${n}-${s[0]}` },

  // ── Grupo 4: variantes com underscore (planilha do Messias) ──────────────
  { id: 'nome_sobrenome',   build: (n, s) => `${n}_${s}` },
  { id: 'sobrenome_nome',   build: (n, s) => `${s}_${n}` },

  // ── Grupo 5: iniciais (exclusivos da spec original) ──────────────────────
  { id: 'iniciais',         build: (n, s) => `${n[0]}${s[0]}` },
  { id: 'iniciais_inv',     build: (n, s) => `${s[0]}${n[0]}` },

  // ── Grupo 6: nome-sobrenome (hífen, exclusivo da spec original) ──────────
  { id: 'nome-sobrenome',   build: (n, s) => `${n}-${s}` },
];

const EXTENSOES: Extensao[] = ['.com', '.com.br'];

/**
 * Constrói pattern_id determinístico a partir do template + extensão.
 *  ('nome.sobrenome', '.com.br') → 'nome.sobrenome_com.br'
 */
function buildPatternId(template: string, extensao: Extensao): string {
  return `${template}_${extensao.replace(/^\./, '')}`;
}

// ============================================================================
// FUNÇÃO PRINCIPAL — modo manual (testa todos os 32)
// ============================================================================

/**
 * Gera as 32 variações de e-mail (16 templates × 2 extensões) para um lead.
 * Retorna lista DEDUPLICADA — alguns templates podem colapsar em e-mails iguais
 * quando, por exemplo, nome ou sobrenome têm uma única letra.
 *
 * Retorna [] se nome, sobrenome ou dominio forem inválidos após normalização.
 */
export function gerarVariacoes(input: EmailPatternInput): EmailPatternResult[] {
  const nome = normalizar(input.nome);
  const sobrenome = normalizar(input.sobrenome);
  const baseDominio = extrairBaseDominio(input.dominio);

  if (!nome || !sobrenome || !baseDominio) return [];
  if (nome.length < 2 || sobrenome.length < 2) return [];

  const resultados: EmailPatternResult[] = [];
  const seen = new Set<string>();

  for (const tpl of BASE_TEMPLATES) {
    const local = tpl.build(nome, sobrenome);
    for (const ext of EXTENSOES) {
      const email = `${local}@${baseDominio}${ext}`;
      if (!seen.has(email)) {
        seen.add(email);
        resultados.push({
          pattern_id: buildPatternId(tpl.id, ext),
          email,
          template: tpl.id,
          extensao: ext,
        });
      }
    }
  }

  return resultados;
}

// ============================================================================
// MODO AUTO — gera apenas o padrão conhecido (1 chamada Snov.io)
// ============================================================================

/**
 * Gera apenas o e-mail do padrão+extensão especificado.
 * Usado pelo auto-recovery quando o padrão da empresa está "estável"
 * em `email_padroes_empresa` (confianca >= 3).
 *
 * Retorna null se o templateId não existir ou os inputs forem inválidos.
 */
export function gerarPorPadrao(
  input: EmailPatternInput,
  templateId: string,
  extensao: Extensao
): EmailPatternResult | null {
  const tpl = BASE_TEMPLATES.find(t => t.id === templateId);
  if (!tpl) return null;

  const nome = normalizar(input.nome);
  const sobrenome = normalizar(input.sobrenome);
  const baseDominio = extrairBaseDominio(input.dominio);

  if (!nome || !sobrenome || !baseDominio) return null;
  if (nome.length < 2 || sobrenome.length < 2) return null;

  const local = tpl.build(nome, sobrenome);
  return {
    pattern_id: buildPatternId(tpl.id, extensao),
    email: `${local}@${baseDominio}${extensao}`,
    template: tpl.id,
    extensao,
  };
}

// ============================================================================
// HELPERS DE INSPEÇÃO
// ============================================================================

/**
 * Lista os IDs de templates disponíveis. Útil para UI/debug.
 */
export function listarTemplates(): string[] {
  return BASE_TEMPLATES.map(t => t.id);
}

/**
 * Detecta o template a partir de um e-mail validado conhecido.
 * Retorna o {template, extensao} se o e-mail bater com algum padrão gerado,
 * ou null se não houver correspondência (caso típico de "padrão exótico" que
 * só foi descoberto por edição manual D10).
 *
 * Usado pelo Recovery após validação Snov.io positiva para alimentar a tabela
 * email_padroes_empresa (auto-aprendizado).
 */
export function detectarTemplate(
  emailValidado: string,
  nome: string,
  sobrenome: string
): { template: string; extensao: Extensao } | null {
  const at = emailValidado.indexOf('@');
  if (at < 0) return null;

  const local = emailValidado.slice(0, at).toLowerCase();
  const dominioCompleto = emailValidado.slice(at + 1).toLowerCase();

  let extensao: Extensao | null = null;
  if (dominioCompleto.endsWith('.com.br')) extensao = '.com.br';
  else if (dominioCompleto.endsWith('.com')) extensao = '.com';
  else return null;

  const n = normalizar(nome);
  const s = normalizar(sobrenome);
  if (!n || !s) return null;

  for (const tpl of BASE_TEMPLATES) {
    if (tpl.build(n, s) === local) {
      return { template: tpl.id, extensao };
    }
  }

  return null;
}

// ============================================================================
// EXPORTS DE CONSTANTES
// ============================================================================

export const TOTAL_PADROES = BASE_TEMPLATES.length * EXTENSOES.length; // 32
export const TEMPLATES_DISPONIVEIS = BASE_TEMPLATES.map(t => t.id);
