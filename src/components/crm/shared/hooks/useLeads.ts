/**
 * useLeads.ts — Hook de gestão de Leads
 *
 * Caminho: src/components/crm/shared/hooks/useLeads.ts
 * Versão: 1.4 (Filtros "CRECI" e "Analista" na aba "Meus Leads" — 30/06/2026)
 *
 * v1.4 (30/06/2026 — Filtros "CRECI" e "Analista" na aba "Meus Leads"):
 *   Adicionados 2 novos estados controláveis, alinhados ao backend
 *   crm-leads v1.23:
 *     • `incluirCreci` (boolean) — quando false, propaga
 *       `incluir_creci=0` para o backend (que aplica `vertical != 'CRECI'`
 *       à query). Default informado pelo caller (BaseLeadsPage v1.16)
 *       por perfil: Admin/GC default true (Admin esconde via toggle do
 *       LeadsTab; GC nunca vê CRECI por RBAC), SDR também default true.
 *       Mantemos o default `true` no hook (comportamento legado para
 *       callers que não passem); o caller decide a UX por perfil.
 *     • `filtroAnalista` (string) — propaga `analista_filter` para o
 *       backend. Aceita 'mine' | 'unassigned' | 'mine_or_unassigned' |
 *       'all' | <id_num>. Default informado pelo caller:
 *       'mine_or_unassigned' para Admin/SDR (permite ver leads órfãos
 *       e alocar), 'mine' para GC (RBAC já força mas mantém idempotente).
 *
 *   Mudança aditiva — callers existentes que não passem os novos
 *   `defaultIncluirCreci` / `defaultFiltroAnalista` continuam funcionando
 *   com o comportamento v1.3 (incluirCreci=true, sem filtroAnalista).
 *
 *   Dep array `carregar` atualizada para incluir os novos states.
 *
 * v1.3 (22/06/2026 — RBAC na aba "Meus Leads"):
 *   Adicionado `currentUser` em UseLeadsOptions para propagação ao backend
 *   v1.20 nas actions `listar_leads` e `stats`. Sem isso, o backend retorna
 *   400 (validação defensiva no listar_leads) ou KPI zerado (stats).
 *
 *   Regra de visibilidade implementada no backend (Messias, 22/06/2026):
 *     - Admin             → vê tudo
 *     - SDR               → vê todos CRECI + apenas seus em outras verticais
 *     - Gestão Comercial  → NUNCA vê CRECI + apenas onde é reservado_por
 *
 *   Mudança aditiva e retrocompatível em nível de TIPOS — `currentUser` é
 *   opcional na assinatura (caller pode omitir), mas se omitido as queries
 *   ao backend NÃO trafegarão os params e o backend reage com 400. Logo,
 *   o caller (BaseLeadsPage v1.10) PRECISA passar currentUser para o
 *   funcionamento normal. A omissão proposital (testes, hooks futuros)
 *   resulta em hook não-funcional mas seguro.
 *
 *   Dep arrays atualizadas: `currentUser?.id` e `currentUser?.tipo_usuario`
 *   incluídos em `carregar` e `carregarStats` para recarregar
 *   automaticamente se o usuário trocar (login/logout/impersonate).
 *
 * v1.2 (13/06/2026 — Reorganização Prospect/Lead):
 *   Adicionado estado `ordenarPor` para alimentar o novo dropdown
 *   "Ordenar por" da LeadsTab v1.1. Aceita valores 'recentes' (default),
 *   'empresa', 'nome', 'cargo' — propagados ao backend como query
 *   param `ordenar_por` (crm-leads.ts v1.14, action `listar_leads`).
 *   `useEffect` da BaseLeadsPage v1.8 inclui `ordenarPor` na dep array
 *   para recarregar ao trocar a ordem. Mudança aditiva — não quebra
 *   chamadas existentes.
 *
 * v1.1 (11/06/2026 — Opt-out manual / Bloco 4 do plano OPT-OUT 100%):
 *   adicionado método `desabilitar(leadId, motivo, criadoPor)` que
 *   chama a action POST `desabilitar_lead` da API (crm-leads.ts v1.11).
 *   A cascata em 4 passos roda no backend:
 *     1. UPDATE email_leads.opt_out=true
 *     2. UPSERT email_optout (LGPD irreversível)
 *     3. UPDATE email_fila SET status='cancelado' em TODAS as campanhas
 *        ativas/pausadas/agendadas com pendentes desse email
 *     4. INSERT email_lead_historico (tipo='opt_out_manual')
 *   Retorna `{ ok, total_cancelados, ja_estava_optout }` para que o
 *   chamador (BaseLeadsPage) possa mostrar feedback adequado ao usuário.
 *
 * v1.0 (Fase 1C — 29/05/2026):
 *   Responsabilidade:
 *    - Listagem, filtros, paginação, CRUD, detalhe e mudança de funil.
 *    - Comportamento idêntico ao EmpresasLeadsCRM.tsx original
 *      (linhas 218-240 + 298-380).
 */

import { useCallback, useState } from 'react';
import { useCrmApi } from './useCrmApi';
import type { Lead, LeadInput, HistoricoItem, CRMStats } from '../../types/crm.types';

// ════════════════════════════════════════════════════════════
// TIPOS DE RESPOSTA DA API
// ════════════════════════════════════════════════════════════

interface ListarLeadsResponse {
  success: boolean;
  leads: Lead[];
  total: number;
  error?: string;
}

export interface DetalheLeadResponse {
  success: boolean;
  lead: Lead;
  historico: HistoricoItem[];
  campanhas: any[];
  respostas: any[];
  error?: string;
}

interface SalvarLeadResponse {
  success: boolean;
  lead?: Lead;
  opt_out_warning?: boolean;
  error?: string;
}

// 🆕 v1.1 — Resposta da action POST `desabilitar_lead` em crm-leads.ts v1.11.
//   Retorna o número de itens da fila cancelados em todas as campanhas
//   (ativas, pausadas e agendadas), além da flag de idempotência
//   `ja_estava_optout` (true → no-op, segunda chamada na mesma sessão).
interface DesabilitarLeadResponse {
  success: boolean;
  lead_id?: number;
  email?: string;
  ja_estava_optout?: boolean;
  total_cancelados?: number;
  motivo?: string;
  mensagem?: string;
  error?: string;
}

// 🆕 v1.1 — Retorno do método `desabilitar` para o chamador.
//   `ok` indica sucesso operacional; os outros campos alimentam o
//   feedback ao usuário no toast/alert pós-ação.
export interface DesabilitarLeadResult {
  ok: boolean;
  total_cancelados: number;
  ja_estava_optout: boolean;
}

interface StatsResponse {
  success: boolean;
  stats: CRMStats;
  error?: string;
}

interface UseLeadsOptions {
  apiUrl?: string;
  pageSize?: number;
  // 🆕 v1.3 — Identificação do usuário corrente para RBAC backend.
  //   Propagado para listar_leads (filtro de visibilidade) e stats
  //   (filtro do KPI "LEADS"). Sem isso, listar_leads retorna 400 e
  //   stats retorna totalLeads=0 (fail-safe defensivo).
  currentUser?: {
    id: number;
    tipo_usuario: string;
  };
  // 🆕 v1.4 (30/06/2026) — Defaults dos filtros opcionais por perfil.
  //   Informados pelo caller (BaseLeadsPage v1.16) — o hook não decide
  //   regra de produto, apenas aplica.
  //   • defaultIncluirCreci: omitido → true (mostra CRECI, compat legado)
  //   • defaultFiltroAnalista: omitido → '' (sem filtro adicional)
  defaultIncluirCreci?: boolean;
  defaultFiltroAnalista?: string;
}

// ════════════════════════════════════════════════════════════
// HOOK
// ════════════════════════════════════════════════════════════

export function useLeads(options: UseLeadsOptions = {}) {
  const apiUrl = options.apiUrl ?? '/api/crm-leads';
  const pageSize = options.pageSize ?? 30;
  // 🆕 v1.3 — currentUser para RBAC. Sem default — caller decide.
  const currentUser = options.currentUser;

  const api = useCrmApi(apiUrl);

  // Estado de listagem
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState('');
  const [filtroFunil, setFiltroFunil] = useState('');
  // 🆕 v1.2 — Ordenação configurável (whitelist: recentes/empresa/nome/cargo).
  //   Default 'recentes' = criado_em desc (comportamento legado preservado).
  const [ordenarPor, setOrdenarPor] = useState<string>('recentes');
  // 🆕 v1.4 (30/06/2026) — Filtros opcionais do operador. Defaults via options
  //   (caller injeta por perfil — ver cabeçalho do arquivo).
  const [incluirCreci, setIncluirCreci] = useState<boolean>(
    options.defaultIncluirCreci !== undefined ? options.defaultIncluirCreci : true
  );
  const [filtroAnalista, setFiltroAnalista] = useState<string>(
    options.defaultFiltroAnalista ?? ''
  );
  const [loading, setLoading] = useState(false);

  // Estado de detalhe
  const [leadSelecionado, setLeadSelecionado] = useState<Lead | null>(null);
  const [timeline, setTimeline] = useState<HistoricoItem[]>([]);
  const [campanhasDoLead, setCampanhasDoLead] = useState<any[]>([]);
  const [respostas, setRespostas] = useState<any[]>([]);

  // Stats (KPIs do topo da página)
  const [stats, setStats] = useState<CRMStats | null>(null);

  // ════════════════════════════════════════════════════════════
  // LISTAR
  // ════════════════════════════════════════════════════════════

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: pagina,
        limit: pageSize,
      };
      if (busca) params.busca = busca;
      if (filtroFunil) params.funil = filtroFunil;
      // 🆕 v1.2 — propagar ordenação para o backend (action listar_leads
      //   do crm-leads.ts v1.14). Whitelist validada no servidor.
      if (ordenarPor) params.ordenar_por = ordenarPor;
      // 🆕 v1.3 — propagar currentUser para RBAC (crm-leads.ts v1.20).
      //   Sem esses 2 params, o backend retorna 400 — defesa em camadas.
      if (currentUser) {
        params.current_user_id = currentUser.id;
        params.current_user_tipo = currentUser.tipo_usuario;
      }
      // 🆕 v1.4 (30/06/2026) — propagar filtros opcionais (crm-leads v1.23).
      //   incluir_creci só vai como '0' quando o operador clica "Esconder";
      //   no caso default ('1'), omitimos o param para manter a URL enxuta
      //   — o backend trata ausência como '1' (incluir).
      if (incluirCreci === false) params.incluir_creci = '0';
      if (filtroAnalista) params.analista_filter = filtroAnalista;

      const resp = await api.get<ListarLeadsResponse>('listar_leads', params);
      if (resp.ok && resp.data?.success) {
        setLeads(resp.data.leads);
        setTotal(resp.data.total);
      } else {
        console.error('Erro ao carregar leads:', resp.error);
      }
    } finally {
      setLoading(false);
    }
  }, [
    api,
    pagina,
    pageSize,
    busca,
    filtroFunil,
    ordenarPor,
    currentUser?.id,
    currentUser?.tipo_usuario,
    // 🆕 v1.4 — recarregar ao trocar filtros do operador
    incluirCreci,
    filtroAnalista,
  ]);

  // ════════════════════════════════════════════════════════════
  // STATS
  // ════════════════════════════════════════════════════════════

  const carregarStats = useCallback(async () => {
    try {
      // 🆕 v1.3 — propagar currentUser para RBAC do KPI "LEADS"
      //   (crm-leads.ts v1.20 action stats). Sem currentUser, KPI vem 0
      //   (fail-safe defensivo — não trava a página).
      const params: Record<string, string | number> = {};
      if (currentUser) {
        params.current_user_id = currentUser.id;
        params.current_user_tipo = currentUser.tipo_usuario;
      }
      const resp = await api.get<StatsResponse>('stats', params);
      if (resp.ok && resp.data?.success) {
        setStats(resp.data.stats);
      }
    } catch (err) {
      console.error('Erro ao carregar stats:', err);
    }
  }, [api, currentUser?.id, currentUser?.tipo_usuario]);

  // ════════════════════════════════════════════════════════════
  // SALVAR (criar ou atualizar)
  // ════════════════════════════════════════════════════════════

  const salvar = useCallback(
    async (
      form: Partial<LeadInput> & { id?: number },
      criadoPor: string
    ): Promise<boolean> => {
      const isEdit = typeof form.id === 'number';
      const action = isEdit ? 'atualizar_lead' : 'criar_lead';
      const method = isEdit ? api.patch : api.post;

      setLoading(true);
      try {
        const resp = await method<SalvarLeadResponse>(action, {
          ...form,
          criado_por: criadoPor,
        });
        if (!resp.ok || !resp.data?.success) {
          alert(resp.data?.error || resp.error || 'Erro ao salvar lead');
          return false;
        }
        if (resp.data.opt_out_warning) {
          alert(
            '⚠️ Este email está na lista de opt-out global. ' +
              'O lead foi criado mas não receberá campanhas.'
          );
        }
        return true;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  // ════════════════════════════════════════════════════════════
  // DETALHE
  // ════════════════════════════════════════════════════════════

  const abrirDetalhe = useCallback(
    async (id: number): Promise<DetalheLeadResponse | null> => {
      setLoading(true);
      try {
        const resp = await api.get<DetalheLeadResponse>('detalhe_lead', { id });
        if (resp.ok && resp.data?.success) {
          setLeadSelecionado(resp.data.lead);
          setTimeline(resp.data.historico || []);
          setCampanhasDoLead(resp.data.campanhas || []);
          setRespostas(resp.data.respostas || []);
          return resp.data;
        }
        return null;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  const fecharDetalhe = useCallback(() => {
    setLeadSelecionado(null);
    setTimeline([]);
    setCampanhasDoLead([]);
    setRespostas([]);
  }, []);

  // ════════════════════════════════════════════════════════════
  // MUDAR FUNIL
  // ════════════════════════════════════════════════════════════

  const mudarFunil = useCallback(
    async (
      leadId: number,
      novoStatus: string,
      motivoPerda: string | null,
      criadoPor: string
    ): Promise<boolean> => {
      setLoading(true);
      try {
        const resp = await api.patch<{ success: boolean; error?: string }>('mudar_funil', {
          id: leadId,
          novo_status: novoStatus,
          motivo_perda: novoStatus === 'perdido' ? motivoPerda : null,
          criado_por: criadoPor,
        });
        if (!resp.ok || !resp.data?.success) {
          alert(resp.data?.error || resp.error || 'Erro ao mudar funil');
          return false;
        }
        return true;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  // ════════════════════════════════════════════════════════════
  // 🆕 v1.1 — DESABILITAR (opt-out manual)
  // ════════════════════════════════════════════════════════════
  //
  // Chama a action POST `desabilitar_lead` da API. A cascata completa
  // (4 passos: opt_out + email_optout + cancela fila global + histórico)
  // é executada no backend (crm-leads.ts v1.11).
  //
  // Decisão de produto (CHECKPOINT_2026-06-10_P1_VALIDADA.md P2.1):
  //   Opt-out é IRREVERSÍVEL conforme LGPD. Não há método contraparte
  //   `reabilitar` neste hook por design.
  //
  // Parâmetros:
  //   - leadId: id do lead em email_leads
  //   - motivo: texto livre opcional (ex.: "lead pediu por email"); se
  //     null/vazio, o backend grava 'opt_out_manual' como motivo padrão
  //   - criadoPor: nome do usuário logado (auditoria; vai para
  //     email_lead_historico.criado_por)
  //
  // Retorno: ver DesabilitarLeadResult acima.
  const desabilitar = useCallback(
    async (
      leadId: number,
      motivo: string | null,
      criadoPor: string
    ): Promise<DesabilitarLeadResult> => {
      setLoading(true);
      try {
        const resp = await api.post<DesabilitarLeadResponse>(
          'desabilitar_lead',
          {
            lead_id: leadId,
            motivo: motivo || undefined,
            criado_por: criadoPor,
          }
        );
        if (!resp.ok || !resp.data?.success) {
          alert(resp.data?.error || resp.error || 'Erro ao desabilitar lead');
          return { ok: false, total_cancelados: 0, ja_estava_optout: false };
        }
        return {
          ok: true,
          total_cancelados: resp.data.total_cancelados ?? 0,
          ja_estava_optout: !!resp.data.ja_estava_optout,
        };
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  // ════════════════════════════════════════════════════════════
  // RETURN
  // ════════════════════════════════════════════════════════════

  return {
    // Listagem
    leads,
    total,
    pagina,
    setPagina,
    busca,
    setBusca,
    filtroFunil,
    setFiltroFunil,
    // 🆕 v1.2 — Ordenação configurável
    ordenarPor,
    setOrdenarPor,
    // 🆕 v1.4 (30/06/2026) — Filtros opcionais do operador
    incluirCreci,
    setIncluirCreci,
    filtroAnalista,
    setFiltroAnalista,
    loading,
    carregar,
    pageSize,
    // Stats
    stats,
    carregarStats,
    // CRUD
    salvar,
    // Detalhe
    leadSelecionado,
    timeline,
    campanhasDoLead,
    respostas,
    abrirDetalhe,
    fecharDetalhe,
    // Funil
    mudarFunil,
    // 🆕 v1.1 — Opt-out manual
    desabilitar,
  };
}

export default useLeads;
