/**
 * useImportProspects.ts — Hook de importação do Prospect Engine
 *
 * Caminho: src/components/crm/shared/hooks/useImportProspects.ts
 * Versão: 1.0 (Fase 1C — 29/05/2026)
 *
 * Comportamento idêntico ao EmpresasLeadsCRM.tsx original
 * (linhas 386-432) — refatorado, não alterado.
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
}

// ════════════════════════════════════════════════════════════
// HOOK
// ════════════════════════════════════════════════════════════

export function useImportProspects(options: UseImportProspectsOptions = {}) {
  const apiUrl = options.apiUrl ?? '/api/crm-leads';
  const prospectsApiUrl = options.prospectsApiUrl ?? '/api/prospect-leads';

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
    setLoading(true);
    setResultado(null);
    try {
      // /api/prospect-leads é outro endpoint — não usa action-router.
      // Mantemos a chamada original (fetch direto).
      const resp = await fetch(`${prospectsApiUrl}?status=novo&limit=200`);
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
  }, [prospectsApiUrl]);

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
