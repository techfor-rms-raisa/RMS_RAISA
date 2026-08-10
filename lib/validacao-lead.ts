/**
 * lib/validacao-lead.ts — Portão de validação de e-mail de LEAD
 *
 * v1.1 (10/08/2026)
 *
 * Caminho: lib/validacao-lead.ts
 *
 * ──────────────────────────────────────────────────────────────────────
 * v1.1 (10/08/2026) — O REPROVADO PASSA A TER ENDEREÇO
 * ──────────────────────────────────────────────────────────────────────
 *
 * DEFEITO CORRIGIDO: o lead reprovado (`invalid`) ficava em LIMBO.
 *
 *   · A aba "E-mails para revisar" lista por
 *     (bounced OR motivo_invalidacao IS NOT NULL) — nenhum dos dois
 *     era marcado pelo portão.
 *   · A aba "Vincular em Lote" não conhecia email_validacao_* e continuava
 *     listando o lead como disponível.
 *
 *   Resultado medido em Produção (10/08/2026): 55 leads reprovados
 *   ocupando a lista de disponíveis, invisíveis para correção, e
 *   recusados só na confirmação do lote.
 *
 * CORREÇÃO: o veredito passa a ser gravado também em `motivo_invalidacao`,
 * usando o código 'f7_pre_campanha' — já existente na whitelist da CHECK
 * `email_leads_motivo_invalidacao_valido` e já traduzido na UI como
 * "Invalidado antes da campanha". Nenhuma coluna nova, nenhuma migração
 * de schema.
 *
 *   score       motivo_invalidacao
 *   ----------  ---------------------------------------------------------
 *   invalid     ← 'f7_pre_campanha'  (entra na aba de revisão)
 *   demais      ← NULL, mas SOMENTE se o valor atual for 'f7_pre_campanha'
 *
 * 🛡️  A limpeza é CONDICIONADA ao valor anterior. Um lead com
 *     motivo_invalidacao='bounce' que revalide como 'verified' NÃO tem o
 *     bounce apagado: bounce é evidência de campo, mais forte que a
 *     verificação prévia. Só desfazemos o que este módulo escreveu.
 *
 * 🛡️  PONTO ÚNICO DE ESCRITA PRESERVADO. A regra continua valendo, agora
 *     estendida a `motivo_invalidacao` no que diz respeito ao código
 *     'f7_pre_campanha'. Os demais códigos ('bounce', 'mx', 'edicao_manual'
 *     …) continuam sendo escritos por seus donos originais.
 *
 * ──────────────────────────────────────────────────────────────────────
 * MOTIVAÇÃO
 * ──────────────────────────────────────────────────────────────────────
 *
 * Medição em Produção (06/08/2026): 13,5% de bounce histórico (395 em
 * 2.932 envios) — quase 3× o teto de 5% tolerado pelos provedores.
 * Concentração total nas origens de IMPORTAÇÃO:
 *
 *   importacao_manual .............. 13,3%
 *   revalidacao_importacao_lista ... 14,3%
 *   prospect_engine ................  0,0%   ← passa pela cascade
 *
 * O `prospect_engine` valida via lib/validate-emails.ts e não bounceia.
 * As importações entram sem NENHUMA verificação de entregabilidade.
 *
 * O portão `apto_campanha` valida INTENÇÃO COMERCIAL (curadoria da SDR),
 * não ENTREGABILIDADE. Dimensões ortogonais — faltava a segunda.
 *
 * ──────────────────────────────────────────────────────────────────────
 * DECISÃO DE PRODUTO (Messias — 06/08/2026)
 * ──────────────────────────────────────────────────────────────────────
 *
 *   "Liberar com aviso, e ficar registrado o Risco — pois exigir score
 *    100% vai parar o processo de prospecção."
 *
 *   score       portão      risco   racional
 *   ----------  ----------  ------  ---------------------------------
 *   verified    ✅ libera    false   Hunter confirmou entregável
 *   probable    ⚠️ libera    TRUE    catch-all — INVERIFICÁVEL
 *   risky       ⚠️ libera    TRUE    cascade esgotada, inconclusivo
 *   invalid     🔴 BLOQUEIA  true    Hunter confirmou não-entregável
 *
 * ⚠️  SÓ `invalid` BLOQUEIA. Domínios catch-all são maioria no B2B
 *     brasileiro e nenhuma API consegue verificá-los — bloquear
 *     `probable` pararia a prospecção sem ganho de entregabilidade.
 *
 * ──────────────────────────────────────────────────────────────────────
 * RESPONSABILIDADE — PONTO ÚNICO DE ESCRITA
 * ──────────────────────────────────────────────────────────────────────
 *
 * Este módulo é o ÚNICO lugar que grava as colunas email_validacao_*.
 * Nenhum outro código deve escrevê-las diretamente. Isso garante que
 * `email_validacao_risco` nunca divirja de `email_validacao_score`
 * (redundância deliberada, ver sql/2026-08-06_validacao_email_portao.sql).
 *
 * 🛡️  É uma LIB, não endpoint. Chamada in-process, sem fetch HTTP —
 *     evita o HTTP 401 do Vercel Deployment Protection em Preview
 *     (mesma lição de lib/validate-emails.ts v1.1).
 *
 * 🛡️  NÃO LANÇA exceções. Sempre retorna ResultadoPortao. Falha de
 *     infraestrutura degrada para `risky` — que LIBERA com risco, nunca
 *     bloqueia. Rationale: indisponibilidade do Hunter/Snov.io não pode
 *     paralisar a operação comercial. O risco fica registrado.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { validarEmailCascade, type ValidateScore, type ValidateFonte } from './validate-emails.js';

// ──────────────────────────────────────────────────────────────────────
// CONFIGURAÇÃO
// ──────────────────────────────────────────────────────────────────────

/**
 * TTL da validação, em dias. Vencida = tratada como ausente → nova cascade.
 *
 * Pessoas trocam de emprego; domínios são desativados. 90 dias equilibra
 * frescor do dado e consumo de créditos (Hunter/Snov.io).
 *
 * ⚠️  Alterar aqui muda o comportamento de TODOS os fluxos. É o ponto
 *     único de configuração do TTL.
 */
export const TTL_DIAS = 90;

/**
 * Scores que BLOQUEIAM o vínculo a campanha.
 *
 * Lista deliberadamente MÍNIMA — decisão de produto 06/08/2026.
 * Ampliar esta lista para incluir 'probable' ou 'risky' pararia a
 * prospecção; qualquer mudança aqui exige decisão de produto explícita.
 */
const SCORES_BLOQUEANTES: ValidateScore[] = ['invalid'];

/** Scores que LIBERAM porém marcam risco. */
const SCORES_DE_RISCO: ValidateScore[] = ['probable', 'risky'];

/**
 * 🆕 v1.1 — Código gravado em `email_leads.motivo_invalidacao` quando o
 * portão reprova.
 *
 * Valor DELIBERADAMENTE reaproveitado: já consta da whitelist da CHECK
 * `email_leads_motivo_invalidacao_valido` e já tem tradução na UI
 * ("Invalidado antes da campanha"). Criar um código novo exigiria alterar
 * a constraint e mapear a tradução, sem ganhar nada semanticamente.
 *
 * ⚠️  Mudar este valor exige, no mesmo commit: (a) ampliar a CHECK,
 *     (b) traduzir na UI, (c) atualizar o backfill da migração
 *     sql/2026-08-10_vinculo_em_lote_entregabilidade.sql.
 */
const MOTIVO_REPROVADO_NO_PORTAO = 'f7_pre_campanha';

// ──────────────────────────────────────────────────────────────────────
// TIPOS PÚBLICOS
// ──────────────────────────────────────────────────────────────────────

export interface LeadParaValidar {
  id: number;
  email: string;
  nome?: string | null;
}

export interface ResultadoPortao {
  lead_id: number;
  email: string;
  score: ValidateScore;
  fonte: ValidateFonte;
  /** true quando score ∈ (probable, risky) — liberado COM risco registrado. */
  risco: boolean;
  /** true quando score ∈ SCORES_BLOQUEANTES. O caller DEVE recusar. */
  bloqueado: boolean;
  /** true quando o resultado veio do banco (sem consumir crédito). */
  do_cache: boolean;
  /** Mensagem acionável para a UI quando bloqueado. */
  motivo?: string;
  validado_em: string;
}

// ──────────────────────────────────────────────────────────────────────
// HELPERS PRIVADOS
// ──────────────────────────────────────────────────────────────────────

function classificar(score: ValidateScore) {
  return {
    risco:     SCORES_DE_RISCO.includes(score),
    bloqueado: SCORES_BLOQUEANTES.includes(score),
  };
}

function motivoBloqueio(score: ValidateScore, email: string): string | undefined {
  if (score !== 'invalid') return undefined;
  return (
    `O e-mail "${email}" foi verificado e NÃO é entregável (hard bounce garantido). ` +
    `Corrija o endereço e valide novamente antes de vincular a uma campanha.`
  );
}

/** Validação vigente? Considera TTL_DIAS a partir de email_validado_em. */
function validacaoVigente(validadoEm: string | null | undefined): boolean {
  if (!validadoEm) return false;
  const ts = new Date(validadoEm).getTime();
  if (Number.isNaN(ts)) return false;
  return (Date.now() - ts) < TTL_DIAS * 24 * 60 * 60 * 1000;
}

// ──────────────────────────────────────────────────────────────────────
// FUNÇÃO PÚBLICA — garantirValidacaoLead
// ──────────────────────────────────────────────────────────────────────

/**
 * Garante que o lead tenha validação VIGENTE e devolve o veredito do portão.
 *
 * Ordem de resolução:
 *   1. Lê email_validacao_* do banco. Se vigente E o e-mail não mudou,
 *      devolve do cache (custo 0, `do_cache: true`).
 *   2. Caso contrário, roda validarEmailCascade (local → Hunter → Snov.io),
 *      PERSISTE o resultado e devolve.
 *
 * @param opts.forcar  ignora o cache e revalida (usado pelo botão "Validar"
 *                     da aba Inválidos — o analista acabou de corrigir o
 *                     e-mail e quer o veredito do endereço NOVO).
 *
 * NUNCA lança. Falha de infraestrutura → score 'risky' (libera com risco).
 */
export async function garantirValidacaoLead(
  supabase: SupabaseClient,
  lead: LeadParaValidar,
  opts?: { forcar?: boolean },
): Promise<ResultadoPortao> {
  const emailNorm = String(lead.email || '').toLowerCase().trim();

  // Guarda: lead sem e-mail. Bloqueia — não há o que validar nem enviar.
  if (!emailNorm) {
    return {
      lead_id: lead.id,
      email: '',
      score: 'invalid',
      fonte: 'none',
      risco: true,
      bloqueado: true,
      do_cache: false,
      motivo: 'Lead sem endereço de e-mail — impossível vincular a campanha.',
      validado_em: new Date().toISOString(),
    };
  }

  // ── 1) Cache ────────────────────────────────────────────────────────
  if (!opts?.forcar) {
    try {
      const { data: atual } = await supabase
        .from('email_leads')
        .select('email, email_validacao_score, email_validacao_fonte, email_validado_em')
        .eq('id', lead.id)
        .maybeSingle();

      // 🛡️  O e-mail precisa ser O MESMO. Se o analista corrigiu o endereço,
      //     a validação anterior é de OUTRO e-mail e não vale nada — este
      //     era exatamente o buraco do botão "Promover" (destravava por
      //     bounced=false após simples edição do endereço).
      const mesmoEmail =
        String(atual?.email || '').toLowerCase().trim() === emailNorm;

      if (
        atual?.email_validacao_score &&
        mesmoEmail &&
        validacaoVigente(atual.email_validado_em)
      ) {
        const score = atual.email_validacao_score as ValidateScore;
        const { risco, bloqueado } = classificar(score);

        // 🆕 v1.1 — AUTOCURA no caminho de cache. Um lead reprovado cuja
        //   validação ainda está vigente mas que perdeu o motivo_invalidacao
        //   (escrita manual, restauração de backup, backfill não aplicado)
        //   voltaria a aparecer na listagem de vínculo.
        //
        //   O `.is(..., null)` faz este UPDATE ser no-op no caso normal —
        //   e o bloco inteiro só roda para score bloqueante, que a RPC v1.29
        //   já removeu da listagem. Custo real no fluxo quente: zero.
        if (bloqueado) {
          await supabase
            .from('email_leads')
            .update({ motivo_invalidacao: MOTIVO_REPROVADO_NO_PORTAO })
            .eq('id', lead.id)
            .is('motivo_invalidacao', null);
        }

        return {
          lead_id: lead.id,
          email: emailNorm,
          score,
          fonte: (atual.email_validacao_fonte || 'local') as ValidateFonte,
          risco,
          bloqueado,
          do_cache: true,
          motivo: motivoBloqueio(score, emailNorm),
          validado_em: atual.email_validado_em!,
        };
      }
    } catch (err: any) {
      console.warn(`⚠️ [validacao-lead] leitura de cache falhou (lead ${lead.id}): ${err?.message}`);
      // Segue para a cascade — cache é otimização, não requisito.
    }
  }

  // ── 2) Cascade ──────────────────────────────────────────────────────
  let score: ValidateScore = 'risky';
  let fonte: ValidateFonte = 'none';

  try {
    const r = await validarEmailCascade({
      email: emailNorm,
      nome: lead.nome ?? null,
      dominio: emailNorm.split('@')[1] ?? null,
    });
    score = r.score;
    fonte = r.fonte;
  } catch (err: any) {
    // validarEmailCascade não lança por contrato, mas defesa em profundidade.
    // Degrada para risky: LIBERA com risco. Indisponibilidade de fornecedor
    // não pode paralisar a operação comercial.
    console.warn(`⚠️ [validacao-lead] cascade falhou (lead ${lead.id}): ${err?.message}`);
  }

  const { risco, bloqueado } = classificar(score);
  const agora = new Date().toISOString();

  // ── 3) Persistir ────────────────────────────────────────────────────
  try {
    // 🆕 v1.1 — `motivo_invalidacao` entra no MESMO update quando o portão
    //   reprova. Um update só: score e motivo nunca divergem, nem sob falha
    //   parcial de rede.
    const camposValidacao: Record<string, unknown> = {
      email_validacao_score: score,
      email_validacao_fonte: fonte,
      email_validado_em: agora,
      email_validacao_risco: risco,
    };
    if (bloqueado) {
      camposValidacao.motivo_invalidacao = MOTIVO_REPROVADO_NO_PORTAO;
    }

    await supabase
      .from('email_leads')
      .update(camposValidacao)
      .eq('id', lead.id);

    // 🆕 v1.1 — LIMPEZA CONDICIONADA. O lead que voltou a passar só perde o
    //   motivo se o motivo tiver sido escrito por ESTE módulo. O filtro
    //   `.eq('motivo_invalidacao', ...)` faz o Postgres decidir — sem SELECT
    //   prévio e sem janela de corrida entre leitura e escrita.
    //
    //   Sem isto, o lead reprovado que tivesse o e-mail corrigido e
    //   revalidado continuaria eternamente na aba de revisão: o motivo
    //   nunca sairia, e a listagem de vínculo (RPC v1.29) o barraria para
    //   sempre. O caminho de recuperação ficaria fechado.
    if (!bloqueado) {
      await supabase
        .from('email_leads')
        .update({ motivo_invalidacao: null })
        .eq('id', lead.id)
        .eq('motivo_invalidacao', MOTIVO_REPROVADO_NO_PORTAO);
    }
  } catch (err: any) {
    // Falha de persistência NÃO invalida o veredito — apenas perde o cache.
    console.warn(`⚠️ [validacao-lead] persistência falhou (lead ${lead.id}): ${err?.message}`);
  }

  console.log(
    `🚪 [validacao-lead] lead ${lead.id} (${emailNorm}) → ${score}/${fonte}` +
    `${bloqueado ? ' 🔴 BLOQUEADO' : risco ? ' ⚠️ risco' : ' ✅'}`,
  );

  return {
    lead_id: lead.id,
    email: emailNorm,
    score,
    fonte,
    risco,
    bloqueado,
    do_cache: false,
    motivo: motivoBloqueio(score, emailNorm),
    validado_em: agora,
  };
}

// ──────────────────────────────────────────────────────────────────────
// FUNÇÃO PÚBLICA — validarLeadsEmLote
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida vários leads com CONCORRÊNCIA LIMITADA.
 *
 * ⚠️  POR QUE ISTO EXISTE (e por que a concorrência é limitada):
 *
 *     A cascade leva ~1–2s por e-mail não cacheado. Um vínculo em lote de
 *     100 leads em série levaria ~150s e estouraria o maxDuration da função
 *     serverless — a falha apareceria como timeout genérico, sem pista da
 *     causa. Em paralelo TOTAL, estouraria o rate limit do Hunter/Snov.io.
 *
 *     A janela de 5 é o meio-termo: ~20s para 100 leads, dentro do limite
 *     de ambos os fornecedores.
 *
 *     Usado como PRÉ-PASSE do vínculo em lote: popula o cache ANTES do
 *     loop, de forma que o portão dentro de vincularLeadACampanha resolva
 *     por cache (custo 0, latência desprezível).
 *
 * Ordem de retorno segue a ordem de entrada. Nunca lança.
 */
export async function validarLeadsEmLote(
  supabase: SupabaseClient,
  leads: LeadParaValidar[],
  opts?: { forcar?: boolean; concorrencia?: number },
): Promise<ResultadoPortao[]> {
  const janela = Math.max(1, Math.min(10, opts?.concorrencia ?? 5));
  const saida: ResultadoPortao[] = [];

  for (let i = 0; i < leads.length; i += janela) {
    const bloco = leads.slice(i, i + janela);
    const res = await Promise.all(
      bloco.map((l) => garantirValidacaoLead(supabase, l, { forcar: opts?.forcar })),
    );
    saida.push(...res);
  }

  return saida;
}

/** Agregado para resposta de API e log. */
export function resumirValidacoes(rs: ResultadoPortao[]) {
  return {
    total:      rs.length,
    verified:   rs.filter((r) => r.score === 'verified').length,
    probable:   rs.filter((r) => r.score === 'probable').length,
    risky:      rs.filter((r) => r.score === 'risky').length,
    invalid:    rs.filter((r) => r.score === 'invalid').length,
    bloqueados: rs.filter((r) => r.bloqueado).length,
    em_risco:   rs.filter((r) => r.risco && !r.bloqueado).length,
    do_cache:   rs.filter((r) => r.do_cache).length,
  };
}
