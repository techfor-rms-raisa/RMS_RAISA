/**
 * useLeadsImportados.ts — Hook orquestrador da aba "Leads Importados"
 *
 * Caminho: src/components/crm/shared/hooks/useLeadsImportados.ts
 * Versão: 1.5 (Cota parametrizada — 23/06/2026)
 *
 * 🆕 v1.5 (23/06/2026 — Cota parametrizada por usuário):
 *   Adiciona o estado `cotaTotal` (o limite diário do usuário, agora
 *   parametrizável via aba "Cotas") ao retorno do hook. O componente
 *   LeadsImportadosTab v1.5 consome via destructure para renderizar
 *   o badge "Cota Revalidação hoje: X / {cotaTotal}" em vez do
 *   hardcoded `/ 50`.
 *
 *   Decisão Messias 23/06/2026:
 *     - cota_diaria já vinha sendo retornada pelo backend (chave
 *       `cota_diaria` no JSON do GET /api/revalidacao-leads-importados
 *       e do POST /api/prospect-revalidate).
 *     - Antes da v1.5, o hook IGNORAVA essa chave e o frontend usava
 *       `50` hardcoded no JSX. Agora o hook captura e propaga.
 *
 *   Mudanças cirúrgicas:
 *     - Novo state `cotaTotal: number` (default null/0 antes da 1ª carga,
 *       depois reflete o valor do backend).
 *     - `carregar()` lê `data.cota_diaria` e seta `cotaTotal`.
 *     - `validarLead()` e `importarLote()` também atualizam cotaTotal
 *       quando o POST devolve essa chave (a partir da v1.8 do backend).
 *     - Retorno público ganha `cotaTotal`.
 *
 *   Backwards-compatible: se o backend não retornar `cota_diaria` (ex:
 *   rolling deploy), o estado fica em `null` e o componente usa
 *   fallback `cotaTotal ?? 50` no JSX (mesmo default histórico).
 *
 * v1.4 (Sub-fase 3.D refino — 18/06/2026 — Anti-duplicidade)
 *   • Novo método `verificarDuplicidade(emails)` que chama POST
 *     /api/revalidacao-leads-importados?action=verificar_duplicidade.
 *     Retorna o status de cada email contra `email_leads`, `email_optout`
 *     e `prospect_leads`. Frontend usa pra bloquear duplicatas na
 *     pré-visualização do modal de importação.
 *   • Novos tipos públicos: `StatusDuplicidade`,
 *     `ResultadoVerificacaoDuplicidade`.
 *   • `StatusAtualizacao` agora inclui `duplicado_em_email_leads`,
 *     `duplicado_em_opt_out`, `duplicado_em_revalidacao` (sincronizado
 *     com prospect-revalidate v1.4).
 *   • `ResultadoImportacao.resumo` ganha 3 contadores de duplicados
 *     (para o modal mostrar quantos foram rejeitados pelo backend, em
 *     casos de race condition).
 *
 * v1.3 (Sub-fase 3.D refino — 18/06/2026 — Promover Lead manual):
 *   Novo método `promoverManualmente(lead_id)` que chama POST
 *   /api/revalidacao-leads-importados?action=promover_manualmente.
 *   Quando o backend retorna `promovido=true` OU `motivo='lead_ja_existia'`,
 *   o lead é REMOVIDO do array local (porque o helper deletou o registro
 *   de prospect_leads). Para outros motivos (opt_out_lgpd, sem_email,
 *   erro_*), o lead PERMANECE no array.
 *
 *   Retorna o ResultadoPromocao completo para o caller decidir UX
 *   (modal de sucesso/aviso/erro).
 *
 * v1.2 (Sub-fase 3.D — 17/06/2026 — hotfix endpoint renomeado):
 *   • URLs alteradas de /api/prospect-leads-importados (nome antigo)
 *     para /api/revalidacao-leads-importados. O endpoint backend foi
 *     renomeado porque o nome anterior colidia com este próprio
 *     arquivo (useLeadsImportados.ts) durante o bundling do Vercel,
 *     fazendo o `ncc` resolver o nome do hook frontend para dentro
 *     do bundle do endpoint serverless — sintoma era TypeError
 *     "Cannot read properties of null (reading 'useState')" ao
 *     chamar GET no endpoint.
 *
 * v1.1 (Sub-fase 3.D — 17/06/2026):
 *   • Novo método `editar(lead_id, novos_dados)` que chama PATCH
 *     /api/revalidacao-leads-importados e atualiza o item no array
 *     local sem precisar de re-fetch.
 *
 * v1.0 (Sub-fase 3.C — 17/06/2026): primeira versão.
 *
 * Encapsula estado/fetch/filtros/paginação/cota da aba "Leads Importados"
 * e expõe as ações de:
 *   • carregar()                       — fetch da listagem com filtros atuais
 *   • validarLead(leadId)              — chama prospect-revalidate em modo
 *                                        individual para um lead específico
 *   • importarLote(leads, cb)          — importa lote do CSV/Excel chamando
 *                                        prospect-revalidate com a flag
 *                                        criar_se_nao_existir=true
 *   • editar(lead_id, novos_dados)     — 🆕 v1.1: PATCH em revalidacao-leads-importados,
 *                                        atualiza o item local
 *
 * Endpoints consumidos:
 *   GET   /api/revalidacao-leads-importados (lista)
 *   PATCH /api/revalidacao-leads-importados (🆕 v1.1: edita)
 *   POST  /api/prospect-revalidate       (valida individual / importa lote)
 *
 * Padrão de hook: alinhado com useVincularEmLote v1.0 (CHECKPOINT
 * 2026-06-17). Mesma convenção de nomes (`carregar`, `setX`, `loading`).
 */

import { useCallback, useState } from 'react';

// ════════════════════════════════════════════════════════════
// TIPOS PÚBLICOS
// ════════════════════════════════════════════════════════════

export type OrdenacaoImportados = 'recente' | 'antigo' | 'proxima_validacao';

export type PerPageImportados = 30 | 50 | 100;

export type StatusAtualizacao =
  | 'atualizado'
  | 'promovido'
  | 'trocou_empresa'
  | 'nao_localizado'
  | 'dominio_invalido'
  | 'opt_out'
  | 'ttl_nao_atingido'
  | 'pendente'
  // 🆕 v1.4 (18/06/2026 — Anti-duplicidade no INSERT preventivo)
  | 'duplicado_em_email_leads'
  | 'duplicado_em_opt_out'
  | 'duplicado_em_revalidacao';

// 🆕 v1.4 (18/06/2026 — Anti-duplicidade): status retornado por verificarDuplicidade()
export type StatusDuplicidade =
  | 'novo'
  | 'em_email_leads'
  | 'em_opt_out'
  | 'em_revalidacao';

export interface ItemVerificacaoDuplicidade {
  email:  string;            // email original (como veio do input)
  status: StatusDuplicidade;
}

/**
 * Forma retornada pelo endpoint /api/revalidacao-leads-importados.
 * Espelha colunas selecionadas de `prospect_leads`.
 */
export interface LeadImportado {
  id: number;
  buscado_por: number;
  motor: string;
  nome_completo: string;
  primeiro_nome: string | null;
  ultimo_nome: string | null;
  cargo: string | null;
  email: string | null;
  email_status: string | null;
  linkedin_url: string | null;
  empresa_nome: string | null;
  empresa_dominio: string | null;
  empresa_setor: string | null;
  cidade: string | null;
  estado: string | null;
  status: string;
  reservado_por: number | null;
  vertical: string | null;
  validado_em: string | null;
  proxima_validacao: string | null;
  status_atualizacao: StatusAtualizacao | null;
  review_manual: boolean;
  tier_pipeline: string | null;
  criado_em: string;
  atualizado_em: string | null;
}

/**
 * Forma de UM lead a ser importado pelo modal (já validado client-side
 * com responsavel_id resolvido via useResponsaveis).
 */
export interface LeadParaImportar {
  reservado_por:   number;     // resolvido client-side pelo Responsável da planilha
  nome_completo:   string;
  email:           string;
  empresa_nome:    string;
  empresa_dominio: string;
  vertical:        string;
  // Opcionais
  primeiro_nome?:  string;
  ultimo_nome?:    string;
  cargo?:          string;
  linkedin_url?:   string;
  cnpj?:           string;
  cidade?:         string;
  estado?:         string;
}

export interface ProgressoImportacao {
  atual:       number;
  total:       number;
  sucessos:    number;
  falhas:      number;
  resumo: {
    atualizado:       number;
    promovido:        number;
    trocou_empresa:   number;
    nao_localizado:   number;
    dominio_invalido: number;
    // 🆕 v1.4 — Anti-duplicidade (defesa em profundidade do backend)
    duplicado_em_email_leads: number;
    duplicado_em_opt_out:     number;
    duplicado_em_revalidacao: number;
  };
}

export interface ResultadoImportacao {
  total_processados: number;
  sucessos:          number;
  falhas:            number;
  ids_criados:       number[];
  erros:             Array<{ linha: number; nome: string; mensagem: string }>;
  resumo: {
    atualizado:       number;
    promovido:        number;
    trocou_empresa:   number;
    nao_localizado:   number;
    dominio_invalido: number;
    // 🆕 v1.4 — Anti-duplicidade (defesa em profundidade do backend)
    duplicado_em_email_leads: number;
    duplicado_em_opt_out:     number;
    duplicado_em_revalidacao: number;
  };
}

// 🆕 v1.3 (18/06/2026 — Sub-fase 3.D refino: Promover Lead manual)
/**
 * Motivos retornados pelo backend ao tentar promover manualmente.
 * Espelha `MotivoPromocao` de lib/promover-email-lead.ts.
 */
export type MotivoPromocaoManual =
  | 'ok'
  | 'sem_email'
  | 'opt_out_lgpd'
  | 'lead_ja_existia'
  | 'erro_insert_lead'
  | 'erro_delete_prospect';

/** Resultado da chamada `promoverManualmente`. */
export interface ResultadoPromocaoManual {
  success:        boolean;
  promovido:      boolean;
  motivo:         MotivoPromocaoManual | string;
  email_lead_id?: number;
  empresa_id?:    number;
  /** Quando success=false (erro HTTP/payload), traz a mensagem. */
  error?:         string;
}

// ════════════════════════════════════════════════════════════
// HOOK
// ════════════════════════════════════════════════════════════

export interface UseLeadsImportadosOptions {
  /** ID do usuário logado (filtra `reservado_por` quando apenasMeus=true). */
  userId: number;
}

export function useLeadsImportados(options: UseLeadsImportadosOptions) {
  const { userId } = options;

  // ── Estado de listagem ──────────────────────────────────
  const [leads, setLeads]                       = useState<LeadImportado[]>([]);
  const [total, setTotal]                       = useState(0);
  const [page, setPage]                         = useState(1);
  const [perPage, setPerPage]                   = useState<PerPageImportados>(30);
  const [apenasMeus, setApenasMeus]             = useState(true);
  const [filtroStatus, setFiltroStatus]         = useState<StatusAtualizacao | ''>('');
  const [ordenacao, setOrdenacao]               = useState<OrdenacaoImportados>('recente');
  const [busca, setBusca]                       = useState('');
  const [loading, setLoading]                   = useState(false);
  const [cotaConsumidaHoje, setCotaConsumidaHoje] = useState(0);
  const [cotaResidual, setCotaResidual]         = useState(50);
  // 🆕 v1.5 (23/06/2026) — Cota total parametrizada vinda do backend.
  //   `null` antes da 1ª carga (componente usa fallback 50). Após
  //   carregar(), reflete app_users.cota_revalidacao_diaria do usuário.
  const [cotaTotal, setCotaTotal]               = useState<number | null>(null);

  // ── Estado de ações por linha (spinners) ────────────────
  const [validandoLeadIds, setValidandoLeadIds] = useState<Set<number>>(new Set());

  // ── carregar() — GET /api/revalidacao-leads-importados ─────
  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('user_id', String(userId));
      params.set('apenas_meus', apenasMeus ? 'true' : 'false');
      params.set('ordenacao', ordenacao);
      params.set('page', String(page));
      params.set('per_page', String(perPage));
      if (filtroStatus) params.set('status', filtroStatus);
      if (busca.trim()) params.set('busca', busca.trim());

      const res = await fetch(`/api/revalidacao-leads-importados?${params.toString()}`);
      const data = await res.json();
      if (data?.success) {
        setLeads(data.leads || []);
        setTotal(data.total || 0);
        setCotaConsumidaHoje(data.cota_consumida_hoje ?? 0);
        setCotaResidual(data.cota_residual ?? 50);
        // 🆕 v1.5 — captura a cota PARAMETRIZADA do usuário (substitui hardcode /50 do JSX)
        if (typeof data.cota_diaria === 'number') {
          setCotaTotal(data.cota_diaria);
        }
      } else {
        console.error('[useLeadsImportados] Erro:', data?.error);
        setLeads([]);
        setTotal(0);
      }
    } catch (err) {
      console.error('[useLeadsImportados] Exceção em carregar():', err);
      setLeads([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [userId, apenasMeus, ordenacao, page, perPage, filtroStatus, busca]);

  // ── validarLead() — POST /api/prospect-revalidate ───────
  const validarLead = useCallback(async (lead: LeadImportado): Promise<{
    ok: boolean;
    status?: StatusAtualizacao;
    mensagem?: string;
  }> => {
    if (validandoLeadIds.has(lead.id)) return { ok: false, mensagem: 'Já em validação' };

    setValidandoLeadIds(prev => new Set(prev).add(lead.id));

    try {
      const res = await fetch('/api/prospect-revalidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          modo:    'individual',
          lead: {
            lead_id:         lead.id,
            nome_completo:   lead.nome_completo,
            primeiro_nome:   lead.primeiro_nome ?? undefined,
            ultimo_nome:     lead.ultimo_nome ?? undefined,
            email:           lead.email ?? undefined,
            empresa_nome:    lead.empresa_nome ?? undefined,
            empresa_dominio: lead.empresa_dominio ?? undefined,
            cargo:           lead.cargo ?? undefined,
            linkedin_url:    lead.linkedin_url ?? undefined,
            tier_pipeline:   (lead.tier_pipeline as any) ?? 'cold',
            vertical:        lead.vertical ?? undefined,
          },
        }),
      });
      const data = await res.json();
      if (!data?.success) {
        return { ok: false, mensagem: data?.error || 'Erro desconhecido' };
      }
      const detalhe = data.detalhes?.[0];
      const status: StatusAtualizacao = detalhe?.status_atualizacao;
      // Atualiza cota local
      setCotaConsumidaHoje(data.cota_consumida_hoje ?? cotaConsumidaHoje);
      setCotaResidual(data.cota_residual ?? cotaResidual);
      // 🆕 v1.5 — captura cota total parametrizada quando backend retorna (v1.8+)
      if (typeof data.cota_diaria === 'number') {
        setCotaTotal(data.cota_diaria);
      }
      return { ok: true, status };
    } catch (err: any) {
      return { ok: false, mensagem: err?.message || 'Falha de rede' };
    } finally {
      setValidandoLeadIds(prev => {
        const novo = new Set(prev);
        novo.delete(lead.id);
        return novo;
      });
    }
  }, [userId, validandoLeadIds, cotaConsumidaHoje, cotaResidual]);

  // ── importarLote() — sequencial, com callback de progresso ─
  const importarLote = useCallback(async (
    leadsParaImportar: LeadParaImportar[],
    onProgresso?: (p: ProgressoImportacao) => void
  ): Promise<ResultadoImportacao> => {
    const total = leadsParaImportar.length;
    const idsCriados: number[] = [];
    const erros: ResultadoImportacao['erros'] = [];
    const resumo = {
      atualizado: 0, promovido: 0, trocou_empresa: 0,
      nao_localizado: 0, dominio_invalido: 0,
      // 🆕 v1.4 — Anti-duplicidade (backend defesa em profundidade)
      duplicado_em_email_leads: 0,
      duplicado_em_opt_out:     0,
      duplicado_em_revalidacao: 0,
    };
    let sucessos = 0;
    let falhas = 0;

    for (let i = 0; i < total; i++) {
      const linha = i + 1;
      const lead = leadsParaImportar[i];
      try {
        const res = await fetch('/api/prospect-revalidate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            modo:    'individual',
            lead: {
              criar_se_nao_existir: true,
              reservado_por:        lead.reservado_por,
              nome_completo:        lead.nome_completo,
              primeiro_nome:        lead.primeiro_nome ?? undefined,
              ultimo_nome:          lead.ultimo_nome ?? undefined,
              email:                lead.email,
              cargo:                lead.cargo ?? undefined,
              linkedin_url:         lead.linkedin_url ?? undefined,
              empresa_nome:         lead.empresa_nome,
              empresa_dominio:      lead.empresa_dominio,
              vertical:             lead.vertical,
              tier_pipeline:        'cold',
            },
          }),
        });
        const data = await res.json();
        // 🆕 v1.4 — Anti-duplicidade: backend retorna decisão 'duplicado_*'
        // SEM ids_processados. Trata como categoria própria (não como falha
        // nem como sucesso). Continua somando ao detalhes.
        const decisao: StatusAtualizacao | undefined = data?.detalhes?.[0]?.status_atualizacao;
        const isDuplicado =
          decisao === 'duplicado_em_email_leads' ||
          decisao === 'duplicado_em_opt_out'     ||
          decisao === 'duplicado_em_revalidacao';

        if (data?.success && isDuplicado) {
          // Duplicado detectado pelo backend (race condition ou bypass do
          // frontend). Conta no resumo, NÃO conta como falha nem sucesso.
          if (decisao === 'duplicado_em_email_leads') resumo.duplicado_em_email_leads++;
          else if (decisao === 'duplicado_em_opt_out')     resumo.duplicado_em_opt_out++;
          else if (decisao === 'duplicado_em_revalidacao') resumo.duplicado_em_revalidacao++;
        } else if (data?.success && data.ids_processados?.length > 0) {
          sucessos++;
          idsCriados.push(...data.ids_processados);
          if (decisao === 'atualizado')       resumo.atualizado++;
          else if (decisao === 'promovido')   resumo.promovido++;
          else if (decisao === 'trocou_empresa')   resumo.trocou_empresa++;
          else if (decisao === 'nao_localizado')   resumo.nao_localizado++;
          else if (decisao === 'dominio_invalido') resumo.dominio_invalido++;
        } else {
          falhas++;
          erros.push({
            linha,
            nome: lead.nome_completo,
            mensagem: data?.error || 'Falha sem detalhe',
          });
        }
        // Atualiza cota a cada chamada (resposta traz cota viva)
        if (typeof data?.cota_consumida_hoje === 'number') {
          setCotaConsumidaHoje(data.cota_consumida_hoje);
        }
        if (typeof data?.cota_residual === 'number') {
          setCotaResidual(data.cota_residual);
        }
        // 🆕 v1.5 — captura cota total parametrizada quando backend retorna (v1.8+)
        if (typeof data?.cota_diaria === 'number') {
          setCotaTotal(data.cota_diaria);
        }
      } catch (err: any) {
        falhas++;
        erros.push({
          linha,
          nome: lead.nome_completo,
          mensagem: err?.message || 'Falha de rede',
        });
      }

      // Progresso ao vivo
      if (onProgresso) {
        onProgresso({
          atual: i + 1, total, sucessos, falhas, resumo: { ...resumo },
        });
      }
    }

    return {
      total_processados: total,
      sucessos,
      falhas,
      ids_criados:       idsCriados,
      erros,
      resumo,
    };
  }, [userId]);

  // ── 🆕 v1.1 editar() — PATCH /api/revalidacao-leads-importados ────
  /**
   * Edita um lead importado (PATCH parcial). Substitui o item
   * correspondente no array local sem precisar de re-fetch.
   * @returns o lead atualizado retornado pelo backend
   * @throws  Error com mensagem amigável quando o backend recusa
   */
  const editar = useCallback(async (
    lead_id: number,
    novos_dados: Partial<LeadImportado>
  ): Promise<LeadImportado> => {
    const res = await fetch('/api/revalidacao-leads-importados', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_id,
        user_id: userId,
        novos_dados,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      const msg = data?.error || `HTTP ${res.status} ao salvar`;
      throw new Error(msg);
    }

    // Substitui o item no array local
    const atualizado = data.lead as LeadImportado;
    setLeads(prev => prev.map(l => (l.id === atualizado.id ? atualizado : l)));
    return atualizado;
  }, [userId]);

  // ── 🆕 v1.3 promoverManualmente() — POST com action=promover_manualmente ──
  /**
   * Promove manualmente um lead importado para `email_leads`. Caso de uso:
   * lead caiu em `nao_localizado` no cascade automático mas o usuário
   * decide promovê-lo mesmo assim (assumindo o risco de bounce).
   *
   * Comportamento sobre o array local de `leads`:
   *  - Se `promovido=true` ou `motivo='lead_ja_existia'` → REMOVE do array
   *    (o helper backend deletou o registro de prospect_leads).
   *  - Caso contrário (opt_out_lgpd, sem_email, erro_*) → MANTÉM no array
   *    (lead continua em prospect_leads para revisão manual via Editar).
   *
   * O caller (componente que renderiza o modal) decide a UX:
   *  - 'ok'              → toast verde de sucesso
   *  - 'lead_ja_existia' → toast azul "lead já estava no CRM"
   *  - 'opt_out_lgpd'    → alerta amarelo + mantém modal aberto
   *  - 'sem_email'       → alerta amarelo sugerindo Editar antes
   *  - 'erro_*'          → alerta vermelho
   *
   * @param lead_id ID do prospect_lead a promover
   * @returns ResultadoPromocaoManual (nunca lança — sempre devolve resultado)
   */
  const promoverManualmente = useCallback(async (
    lead_id: number
  ): Promise<ResultadoPromocaoManual> => {
    try {
      const res = await fetch(
        '/api/revalidacao-leads-importados?action=promover_manualmente',
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lead_id, user_id: userId }),
        }
      );
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.success) {
        return {
          success:   false,
          promovido: false,
          motivo:    data?.error || `HTTP ${res.status}`,
          error:     data?.error || `Erro HTTP ${res.status}`,
        };
      }

      // Backend retornou success=true. Avalia se devemos remover do array.
      const promovido = data.promovido === true;
      const motivo    = (data.motivo ?? 'ok') as MotivoPromocaoManual;
      const removerDoArray = promovido || motivo === 'lead_ja_existia';

      if (removerDoArray) {
        setLeads(prev => prev.filter(l => l.id !== lead_id));
        setTotal(prev => Math.max(0, prev - 1));
      }

      return {
        success:       true,
        promovido,
        motivo,
        email_lead_id: data.email_lead_id,
        empresa_id:    data.empresa_id,
      };
    } catch (err: any) {
      return {
        success:   false,
        promovido: false,
        motivo:    err?.message || 'erro_rede',
        error:     err?.message || 'Falha de rede',
      };
    }
  }, [userId]);

  // ── 🆕 v1.4 verificarDuplicidade() — POST com action=verificar_duplicidade ──
  /**
   * Verifica em 1 round-trip se cada email da lista já existe em alguma
   * das 3 fontes que bloqueiam importação:
   *
   *   - `email_optout`    → status 'em_opt_out'      (LGPD)
   *   - `email_leads`     → status 'em_email_leads'  (lead ativo no CRM)
   *   - `prospect_leads`  → status 'em_revalidacao'  (em revalidação/prospecção)
   *
   * Quando o mesmo email aparece em mais de uma fonte, prevalece a
   * classificação mais restritiva (opt_out > email_leads > prospect_leads).
   *
   * Limite: 100 emails por chamada (alinhado com backend).
   *
   * Usado pelo ImportarListaLeadsModal v1.1 para classificar leads na
   * pré-visualização e bloquear submit de duplicatas.
   *
   * @param emails Array de emails a verificar (até 100)
   * @returns Lista de { email, status } na mesma ordem do input.
   *          Em caso de erro, lança Error com mensagem amigável.
   */
  const verificarDuplicidade = useCallback(async (
    emails: string[]
  ): Promise<ItemVerificacaoDuplicidade[]> => {
    if (!Array.isArray(emails) || emails.length === 0) return [];

    const res = await fetch(
      '/api/revalidacao-leads-importados?action=verificar_duplicidade',
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails }),
      }
    );

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      const msg = data?.error || `HTTP ${res.status} ao verificar duplicidade`;
      throw new Error(msg);
    }

    return (data.resultados ?? []) as ItemVerificacaoDuplicidade[];
  }, []);

  return {
    // estado de listagem
    leads, total,
    page, setPage,
    perPage, setPerPage,
    apenasMeus, setApenasMeus,
    filtroStatus, setFiltroStatus,
    ordenacao, setOrdenacao,
    busca, setBusca,
    loading,
    cotaConsumidaHoje, cotaResidual,
    // 🆕 v1.5 (23/06/2026) — cota total parametrizada por usuário (substitui /50 hardcoded)
    cotaTotal,

    // estado por linha
    validandoLeadIds,

    // ações
    carregar,
    validarLead,
    importarLote,
    editar,                  // 🆕 v1.1
    promoverManualmente,     // 🆕 v1.3
    verificarDuplicidade,    // 🆕 v1.4
  };
}

export default useLeadsImportados;
