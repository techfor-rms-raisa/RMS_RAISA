/**
 * useImportProspects.ts — Hook de importação do Prospect Engine
 *
 * Caminho: src/components/crm/shared/hooks/useImportProspects.ts
 * Versão: 1.1 (Escopo correto do modal — 19/08/2026)
 *
 * 🆕 v1.1 (19/08/2026 — Correção do universo consultado):
 *   Até a v1.0 a chamada era `?status=novo&limit=200`, sem `origem` e sem
 *   `reservado_por`. Três consequências, todas confirmadas em Production:
 *
 *   1. ENTRAVAM EMPRESAS NO LUGAR DE PESSOAS. Os filtros estruturais do
 *      backend (exclusão de `motor cv_*` e de `importacao_lista`) só rodam
 *      dentro do bloco `origem === 'leads'` de api/prospect-leads.ts. Sem o
 *      parâmetro, nenhum deles era aplicado — e `cv_*` identifica EMPRESAS
 *      extraídas de currículo, não interlocutores. Eram 4.562 registros de
 *      empresa elegíveis a um modal de importação de leads.
 *
 *   2. ENTRAVAM LEADS DE PLANILHA. `motor='importacao_lista'` (1.052
 *      registros) tem aba própria na Base de Leads, com revalidação,
 *      cota diária e checagem anti-duplicidade. Promovê-los por aqui
 *      contornava todo esse fluxo.
 *
 *   3. ENTRAVAM PROSPECTS DE OUTROS ANALISTAS. Sem `reservado_por`, o
 *      modal listava a base inteira da equipe.
 *
 *   Correção: `?origem=leads&status=novo&reservado_por={userId}&limit=500`.
 *   O `origem=leads` reaproveita os filtros que já existem no backend
 *   (prospect-leads v1.1) em vez de duplicar a regra no frontend — se a
 *   definição de "lead de prospecção" mudar, muda em um lugar só.
 *
 *   O param `limit` só passou a ter efeito com api/prospect-leads v1.3;
 *   antes o backend impunha 500 fixo e ignorava o valor enviado.
 *
 *   Requisito novo: o hook precisa do `userId`. Sem ele a carga é
 *   abortada — devolver a base da equipe inteira por omissão seria pior
 *   que não carregar nada.
 *
 * v1.0 (Fase 1C — 29/05/2026)
 *   Comportamento idêntico ao EmpresasLeadsCRM.tsx original
 *   (linhas 386-432) — refatorado, não alterado.
 *
 * Observação: a busca de prospects disponíveis usa o endpoint
 * /api/prospect-leads (módulo Prospect Engine — não o CRM).
 * A importação chama action=importar_prospects no /api/crm-leads.
 */

import { useCallback, useState } from 'react';
import { useCrmApi } from './useCrmApi';

// ════════════════════════════════════════════════════════════
// TIPOS
// ════════════════════════════════════════════════════════════

export interface ProspectDisponivel {
  id: number;
  nome_completo: string;
  cargo: string | null;
  empresa_nome: string | null;
  email: string;
}

export interface ResultadoImport {
  importados: number;
  duplicados: number;
  sem_email: number;
  empresas_criadas: number;
}

interface ImportarResponse {
  success: boolean;
  resultados?: ResultadoImport;
  error?: string;
}

interface UseImportProspectsOptions {
  apiUrl?: string;
  prospectsApiUrl?: string;
  /**
   * 🆕 v1.1 — ID do usuário logado. Usado como `reservado_por` na consulta:
   * o modal passa a listar SOMENTE os prospects reservados para ele.
   * Sem este valor a carga é abortada (ver `carregar`).
   */
  userId?: number | null;
}

// ════════════════════════════════════════════════════════════
// HOOK
// ════════════════════════════════════════════════════════════

export function useImportProspects(options: UseImportProspectsOptions = {}) {
  const apiUrl = options.apiUrl ?? '/api/crm-leads';
  const prospectsApiUrl = options.prospectsApiUrl ?? '/api/prospect-leads';
  const userId = options.userId ?? null;   // 🆕 v1.1

  const api = useCrmApi(apiUrl);

  // Estado
  const [disponiveis, setDisponiveis] = useState<ProspectDisponivel[]>([]);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImport | null>(null);

  // ════════════════════════════════════════════════════════════
  // CARREGAR PROSPECTS DISPONÍVEIS
  // ════════════════════════════════════════════════════════════

  const carregar = useCallback(async () => {
    // 🆕 v1.1 — sem usuário identificado não há como delimitar a
    //   propriedade. Carregar assim mesmo devolveria a base de toda a
    //   equipe, que é exatamente o comportamento que esta versão corrige.
    if (!userId) {
      console.warn('[useImportProspects] userId ausente — carga abortada.');
      setDisponiveis([]);
      setSelecionados(new Set());
      return;
    }

    setLoading(true);
    setResultado(null);
    try {
      // /api/prospect-leads é outro endpoint — não usa action-router.
      // Mantemos a chamada original (fetch direto).
      //
      // 🆕 v1.1 — parâmetros:
      //   origem=leads   → backend exclui `motor cv_*` (EMPRESAS) e
      //                    `importacao_lista` (aba própria)
      //   status=novo    → ainda não promovido nem exportado
      //   reservado_por  → somente os prospects do usuário logado
      //   limit          → respeitado a partir de prospect-leads v1.3
      const params = new URLSearchParams({
        origem:        'leads',
        status:        'novo',
        reservado_por: String(userId),
        limit:         '500',
      });

      const resp = await fetch(`${prospectsApiUrl}?${params.toString()}`);
      const data = await resp.json();
      // Filtrar apenas os que têm email
      const comEmail = (data.leads || data.data || []).filter(
        (p: ProspectDisponivel) => !!p.email
      );
      setDisponiveis(comEmail);
      setSelecionados(new Set());
    } catch (err) {
      console.error('Erro ao carregar prospects:', err);
    } finally {
      setLoading(false);
    }
  }, [prospectsApiUrl, userId]);

  // ════════════════════════════════════════════════════════════
  // SELEÇÃO
  // ════════════════════════════════════════════════════════════

  const toggleSelecionado = useCallback((id: number) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selecionarTodos = useCallback(() => {
    setSelecionados((prev) => {
      if (prev.size === disponiveis.length) {
        return new Set(); // toggle off
      }
      return new Set(disponiveis.map((p) => p.id));
    });
  }, [disponiveis]);

  // ════════════════════════════════════════════════════════════
  // EXECUTAR IMPORTAÇÃO
  // ════════════════════════════════════════════════════════════

  const executar = useCallback(
    async (criadoPor: string): Promise<ResultadoImport | null> => {
      if (selecionados.size === 0) return null;
      setLoading(true);
      try {
        const resp = await api.post<ImportarResponse>('importar_prospects', {
          prospect_ids: Array.from(selecionados),
          criado_por: criadoPor,
        });
        if (resp.ok && resp.data?.success && resp.data.resultados) {
          setResultado(resp.data.resultados);
          return resp.data.resultados;
        }
        alert(resp.data?.error || resp.error || 'Erro na importação');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [api, selecionados]
  );

  // ════════════════════════════════════════════════════════════
  // RESET
  // ════════════════════════════════════════════════════════════

  const reset = useCallback(() => {
    setDisponiveis([]);
    setSelecionados(new Set());
    setResultado(null);
  }, []);

  // ════════════════════════════════════════════════════════════
  // RETURN
  // ════════════════════════════════════════════════════════════

  return {
    disponiveis,
    selecionados,
    loading,
    resultado,
    carregar,
    toggleSelecionado,
    selecionarTodos,
    executar,
    reset,
  };
}

export default useImportProspects;
