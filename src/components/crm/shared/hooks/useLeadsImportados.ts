/**
 * useLeadsImportados.ts — Hook orquestrador da aba "Leads Importados"
 *
 * Caminho: src/components/crm/shared/hooks/useLeadsImportados.ts
 * Versão: 1.2 (Sub-fase 3.D — 17/06/2026 — hotfix endpoint renomeado)
 *
 * v1.2 (Sub-fase 3.D — 17/06/2026):
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
  | 'pendente';

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
  };
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
        if (data?.success && data.ids_processados?.length > 0) {
          sucessos++;
          idsCriados.push(...data.ids_processados);
          const decisao: StatusAtualizacao = data.detalhes?.[0]?.status_atualizacao;
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

    // estado por linha
    validandoLeadIds,

    // ações
    carregar,
    validarLead,
    importarLote,
    editar,        // 🆕 v1.1
  };
}

export default useLeadsImportados;
