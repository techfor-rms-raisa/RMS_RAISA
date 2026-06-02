/**
 * useTiposCampanha.ts — Hook de Tipos de Campanha (Verticais)
 *
 * Caminho: src/components/crm/shared/hooks/useTiposCampanha.ts
 * Versão: 1.0 (Fase 4B — 30/05/2026)
 *
 * Responsabilidade:
 *  - Listar verticais (todos os perfis leem)
 *  - CRUD (apenas Administrador — backend valida)
 *  - Usado pelo CopysPage e pelo seletor de tipo da copy
 */

import { useCallback, useState } from 'react';
import { useCrmApi } from './useCrmApi';
import type { TipoCampanha } from '../../types/copy.types';

// ════════════════════════════════════════════════════════════
// TIPOS DE RESPOSTA
// ════════════════════════════════════════════════════════════

interface ListarTiposResponse {
  success: boolean;
  tipos: TipoCampanha[];
  error?: string;
}

interface SalvarTipoResponse {
  success: boolean;
  tipo?: TipoCampanha;
  error?: string;
}

interface UseTiposCampanhaOptions {
  apiUrl?: string;
}

// ════════════════════════════════════════════════════════════
// HOOK
// ════════════════════════════════════════════════════════════

export function useTiposCampanha(options: UseTiposCampanhaOptions = {}) {
  const apiUrl = options.apiUrl ?? '/api/crm-copys';
  const api = useCrmApi(apiUrl);

  const [tipos, setTipos] = useState<TipoCampanha[]>([]);
  const [loading, setLoading] = useState(false);

  // ────────────────────────────────────────────────────────
  // LISTAR
  // ────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api.get<ListarTiposResponse>('listar_tipos');
      if (resp.ok && resp.data?.success) {
        setTipos(resp.data.tipos);
      } else {
        console.error('Erro ao carregar tipos:', resp.error);
      }
    } finally {
      setLoading(false);
    }
  }, [api]);

  // ────────────────────────────────────────────────────────
  // CRIAR
  // ────────────────────────────────────────────────────────
  const criar = useCallback(
    async (
      nome: string,
      descricao: string,
      criadoPor: string,
      tipoUsuario: string
    ): Promise<boolean> => {
      setLoading(true);
      try {
        const resp = await api.post<SalvarTipoResponse>('criar_tipo', {
          nome,
          descricao,
          criado_por: criadoPor,
          tipo_usuario: tipoUsuario,
        });
        if (!resp.ok || !resp.data?.success) {
          alert(resp.data?.error || resp.error || 'Erro ao criar tipo');
          return false;
        }
        await carregar();
        return true;
      } finally {
        setLoading(false);
      }
    },
    [api, carregar]
  );

  // ────────────────────────────────────────────────────────
  // ATUALIZAR
  // ────────────────────────────────────────────────────────
  const atualizar = useCallback(
    async (
      id: number,
      campos: Partial<Pick<TipoCampanha, 'nome' | 'descricao' | 'ativo'>>,
      tipoUsuario: string
    ): Promise<boolean> => {
      setLoading(true);
      try {
        const resp = await api.patch<SalvarTipoResponse>('atualizar_tipo', {
          id,
          ...campos,
          tipo_usuario: tipoUsuario,
        });
        if (!resp.ok || !resp.data?.success) {
          alert(resp.data?.error || resp.error || 'Erro ao atualizar tipo');
          return false;
        }
        await carregar();
        return true;
      } finally {
        setLoading(false);
      }
    },
    [api, carregar]
  );

  // ────────────────────────────────────────────────────────
  // EXCLUIR (soft)
  // ────────────────────────────────────────────────────────
  const excluir = useCallback(
    async (id: number, tipoUsuario: string): Promise<boolean> => {
      setLoading(true);
      try {
        const resp = await api.del<{ success: boolean; error?: string }>(
          'excluir_tipo',
          { id: String(id), tipo_usuario: tipoUsuario }
        );
        if (!resp.ok || !resp.data?.success) {
          alert(resp.data?.error || resp.error || 'Erro ao excluir tipo');
          return false;
        }
        await carregar();
        return true;
      } finally {
        setLoading(false);
      }
    },
    [api, carregar]
  );

  return {
    tipos,
    loading,
    carregar,
    criar,
    atualizar,
    excluir,
  };
}

export default useTiposCampanha;
