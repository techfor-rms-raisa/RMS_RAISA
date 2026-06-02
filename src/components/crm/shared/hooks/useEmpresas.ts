/**
 * useEmpresas.ts — Hook de gestão de Empresas
 *
 * Caminho: src/components/crm/shared/hooks/useEmpresas.ts
 * Versão: 1.0 (Fase 1C — 29/05/2026)
 *
 * Responsabilidade:
 *  - Encapsular todo o ciclo de Empresas: listagem, filtros (busca,
 *    setor), paginação, criação, edição e abertura de detalhe.
 *  - Consumir o endpoint /api/crm-leads (renomeado da Fase 1E,
 *    antes /api/campaign-leads).
 *
 * Comportamento idêntico ao EmpresasLeadsCRM.tsx original
 * (linhas 194-216 + 250-292) — refatorado, não alterado.
 */

import { useCallback, useState } from 'react';
import { useCrmApi } from './useCrmApi';
import type { Empresa, EmpresaInput } from '../../types/crm.types';

// ════════════════════════════════════════════════════════════
// TIPOS DE RESPOSTA DA API
// ════════════════════════════════════════════════════════════

interface ListarEmpresasResponse {
  success: boolean;
  empresas: Empresa[];
  total: number;
  error?: string;
}

interface DetalheEmpresaResponse {
  success: boolean;
  empresa: Empresa;
  leads: any[];
  total_leads: number;
  error?: string;
}

interface SalvarEmpresaResponse {
  success: boolean;
  empresa?: Empresa;
  error?: string;
}

interface UseEmpresasOptions {
  /** URL base do endpoint. Default: /api/crm-leads (renomeado na Fase 1E). */
  apiUrl?: string;
  /** Itens por página (default 20). */
  pageSize?: number;
}

// ════════════════════════════════════════════════════════════
// HOOK
// ════════════════════════════════════════════════════════════

export function useEmpresas(options: UseEmpresasOptions = {}) {
  const apiUrl = options.apiUrl ?? '/api/crm-leads';
  const pageSize = options.pageSize ?? 20;

  const api = useCrmApi(apiUrl);

  // Estado
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState('');
  const [filtroSetor, setFiltroSetor] = useState('');
  const [loading, setLoading] = useState(false);
  const [detalhe, setDetalhe] = useState<DetalheEmpresaResponse | null>(null);

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
      if (filtroSetor) params.setor = filtroSetor;

      const resp = await api.get<ListarEmpresasResponse>('listar_empresas', params);
      if (resp.ok && resp.data?.success) {
        setEmpresas(resp.data.empresas);
        setTotal(resp.data.total);
      } else {
        console.error('Erro ao carregar empresas:', resp.error);
      }
    } finally {
      setLoading(false);
    }
  }, [api, pagina, pageSize, busca, filtroSetor]);

  // ════════════════════════════════════════════════════════════
  // SALVAR (criar ou atualizar)
  // ════════════════════════════════════════════════════════════

  /**
   * @returns true se salvou com sucesso; false caso contrário (alerta exibido).
   */
  const salvar = useCallback(
    async (form: Partial<EmpresaInput> & { id?: number }, criadoPor: string): Promise<boolean> => {
      const isEdit = typeof form.id === 'number';
      const action = isEdit ? 'atualizar_empresa' : 'criar_empresa';
      const method = isEdit ? api.patch : api.post;

      setLoading(true);
      try {
        const resp = await method<SalvarEmpresaResponse>(action, {
          ...form,
          criado_por: criadoPor,
        });
        if (!resp.ok || !resp.data?.success) {
          alert(resp.data?.error || resp.error || 'Erro ao salvar empresa');
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
  // DETALHE
  // ════════════════════════════════════════════════════════════

  const abrirDetalhe = useCallback(
    async (id: number): Promise<DetalheEmpresaResponse | null> => {
      setLoading(true);
      try {
        const resp = await api.get<DetalheEmpresaResponse>('detalhe_empresa', { id });
        if (resp.ok && resp.data?.success) {
          setDetalhe(resp.data);
          return resp.data;
        }
        return null;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  const fecharDetalhe = useCallback(() => setDetalhe(null), []);

  // ════════════════════════════════════════════════════════════
  // RETURN
  // ════════════════════════════════════════════════════════════

  return {
    // Listagem
    empresas,
    total,
    pagina,
    setPagina,
    busca,
    setBusca,
    filtroSetor,
    setFiltroSetor,
    loading,
    carregar,
    pageSize,
    // CRUD
    salvar,
    // Detalhe
    detalhe,
    abrirDetalhe,
    fecharDetalhe,
  };
}

export default useEmpresas;
