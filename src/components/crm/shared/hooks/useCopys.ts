/**
 * useCopys.ts — Hook de gestão da Biblioteca de Copys
 *
 * Caminho: src/components/crm/shared/hooks/useCopys.ts
 * Versão: 1.0 (Fase 4B — 30/05/2026)
 *
 * Responsabilidade:
 *  - Listar copys com filtros (tipo_id, busca, incluir_inativos)
 *  - Stats (KPIs da biblioteca)
 *  - Detalhe (corpo completo da copy)
 *  - CRUD com RBAC (backend valida via tipo_usuario + usuario_id)
 */

import { useCallback, useState } from 'react';
import { useCrmApi } from './useCrmApi';
import type { Copy, CopyInput, CopysStats } from '../../types/copy.types';

// ════════════════════════════════════════════════════════════
// TIPOS DE RESPOSTA
// ════════════════════════════════════════════════════════════

interface ListarCopysResponse {
  success: boolean;
  copys: Copy[];
  error?: string;
}

interface DetalheCopyResponse {
  success: boolean;
  copy: Copy;
  error?: string;
}

interface SalvarCopyResponse {
  success: boolean;
  copy?: Copy;
  error?: string;
}

interface StatsResponse {
  success: boolean;
  stats: CopysStats;
  error?: string;
}

interface ExcluirResponse {
  success: boolean;
  error?: string;
  campanhas?: string[]; // se bloqueado por uso
}

interface UseCopysOptions {
  apiUrl?: string;
}

// ════════════════════════════════════════════════════════════
// HOOK
// ════════════════════════════════════════════════════════════

export function useCopys(options: UseCopysOptions = {}) {
  const apiUrl = options.apiUrl ?? '/api/crm-copys';
  const api = useCrmApi(apiUrl);

  // Listagem
  const [copys, setCopys] = useState<Copy[]>([]);
  const [busca, setBusca] = useState('');
  const [filtroTipoId, setFiltroTipoId] = useState<number | null>(null);
  const [incluirInativos, setIncluirInativos] = useState(false);
  const [loading, setLoading] = useState(false);

  // Stats
  const [stats, setStats] = useState<CopysStats>({
    total_copys: 0,
    total_tipos: 0,
    distribuicao_por_tipo: {},
  });

  // Detalhe (copy aberta para edição/preview)
  const [copyAtual, setCopyAtual] = useState<Copy | null>(null);

  // ────────────────────────────────────────────────────────
  // LISTAR
  // ────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filtroTipoId) params.tipo_id = String(filtroTipoId);
      if (busca) params.busca = busca;
      if (incluirInativos) params.incluir_inativos = 'true';

      const resp = await api.get<ListarCopysResponse>('listar_copys', params);
      if (resp.ok && resp.data?.success) {
        setCopys(resp.data.copys || []);
      } else {
        console.error('Erro ao carregar copys:', resp.error);
      }
    } finally {
      setLoading(false);
    }
  }, [api, filtroTipoId, busca, incluirInativos]);

  // ────────────────────────────────────────────────────────
  // STATS
  // ────────────────────────────────────────────────────────
  const carregarStats = useCallback(async () => {
    try {
      const resp = await api.get<StatsResponse>('stats');
      if (resp.ok && resp.data?.success) {
        setStats(resp.data.stats);
      }
    } catch (err) {
      console.error('Erro ao carregar stats:', err);
    }
  }, [api]);

  // ────────────────────────────────────────────────────────
  // DETALHE (carrega corpo completo)
  // ────────────────────────────────────────────────────────
  const carregarDetalhe = useCallback(
    async (id: number): Promise<Copy | null> => {
      setLoading(true);
      try {
        const resp = await api.get<DetalheCopyResponse>('detalhe_copy', { id: String(id) });
        if (resp.ok && resp.data?.success) {
          setCopyAtual(resp.data.copy);
          return resp.data.copy;
        }
        return null;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  // ────────────────────────────────────────────────────────
  // SALVAR (criar ou atualizar)
  // ────────────────────────────────────────────────────────
  const salvar = useCallback(
    async (
      input: CopyInput,
      usuario: { nome: string; id: number; tipo: string }
    ): Promise<boolean> => {
      const isEdit = typeof input.id === 'number';
      const action = isEdit ? 'atualizar_copy' : 'criar_copy';
      const method = isEdit ? api.patch : api.post;

      setLoading(true);
      try {
        const body: any = {
          nome: input.nome,
          tipo_id: input.tipo_id,
          ordem_sugerida: input.ordem_sugerida,
          assunto: input.assunto,
          corpo_html: input.corpo_html,
          descricao: input.descricao,
          tipo_usuario: usuario.tipo,
        };
        if (isEdit) {
          body.id = input.id;
          body.usuario_id = usuario.id;
          body.atualizado_por = usuario.nome;
        } else {
          body.criado_por = usuario.nome;
          body.criado_por_id = usuario.id;
        }

        const resp = await method<SalvarCopyResponse>(action, body);
        if (!resp.ok || !resp.data?.success) {
          alert(resp.data?.error || resp.error || 'Erro ao salvar copy');
          return false;
        }
        return true;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  // ────────────────────────────────────────────────────────
  // EXCLUIR (soft + verifica uso em campanhas ativas)
  // ────────────────────────────────────────────────────────
  const excluir = useCallback(
    async (
      id: number,
      usuario: { id: number; tipo: string }
    ): Promise<{ ok: boolean; campanhas?: string[] }> => {
      setLoading(true);
      try {
        const resp = await api.del<ExcluirResponse>('excluir_copy', {
          id: String(id),
          usuario_id: String(usuario.id),
          tipo_usuario: usuario.tipo,
        });
        if (!resp.ok || !resp.data?.success) {
          return {
            ok: false,
            campanhas: resp.data?.campanhas,
          };
        }
        return { ok: true };
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  return {
    // Listagem
    copys,
    busca,
    setBusca,
    filtroTipoId,
    setFiltroTipoId,
    incluirInativos,
    setIncluirInativos,
    loading,
    carregar,
    // Stats
    stats,
    carregarStats,
    // Detalhe
    copyAtual,
    setCopyAtual,
    carregarDetalhe,
    // CRUD
    salvar,
    excluir,
  };
}

export default useCopys;
