/**
 * useAssinatura.ts — Hook de assinatura do usuário (remetente)
 *
 * Caminho: src/components/crm/shared/hooks/useAssinatura.ts
 * Versão: 1.1 (Fase E-1/E-2 — 01/06/2026)
 *
 * Histórico:
 *  - v1.0 (30/05/2026 — Fase 1D): hook inicial, 1 assinatura por user_email.
 *  - v1.1 (01/06/2026 — Fase E-1/E-2): aceita `unidade` em carregar e
 *    salvar (default 'TechFor TI' quando omitida — preserva comportamento
 *    da chamada legada do CampanhasPage). Para gerenciar outras unidades
 *    de uma pessoa, usar a aba Assinaturas (Admin).
 *
 * Responsabilidade:
 *  - Carregar a assinatura do usuário logado (por email + unidade)
 *  - Salvar (criar/atualizar) assinatura
 */

import { useCallback, useState } from 'react';
import { useCrmApi } from './useCrmApi';
import { CAMPANHA_API_URL, UNIDADE_PADRAO } from '../../types/crm.constants';
import type { Assinatura } from '../../types/crm.types';

// ════════════════════════════════════════════════════════════
// TIPOS DE RESPOSTA
// ════════════════════════════════════════════════════════════

interface MinhaAssinaturaResponse {
  success: boolean;
  assinatura: Assinatura | null;
  error?: string;
}

interface SalvarAssinaturaResponse {
  success: boolean;
  assinatura?: Assinatura;
  error?: string;
}

interface UseAssinaturaOptions {
  apiUrl?: string;
}

// ════════════════════════════════════════════════════════════
// HOOK
// ════════════════════════════════════════════════════════════

export function useAssinatura(options: UseAssinaturaOptions = {}) {
  const apiUrl = options.apiUrl ?? CAMPANHA_API_URL;
  const api = useCrmApi(apiUrl);

  const [assinatura, setAssinatura] = useState<Partial<Assinatura>>({});
  const [carregada, setCarregada] = useState(false);
  const [loading, setLoading] = useState(false);

  // ════════════════════════════════════════════════════════════
  // CARREGAR
  // ════════════════════════════════════════════════════════════

  /**
   * Carrega a assinatura da pessoa (por email) na unidade do grupo
   * informada. Quando `unidade` é omitida, usa a UNIDADE_PADRAO
   * (TechFor TI) — preserva o comportamento da chamada legada do
   * CampanhasPage (botão "Minha Assinatura" da lista de campanhas).
   * Para gerenciar outras unidades, usar a aba Assinaturas (Admin).
   */
  const carregar = useCallback(
    async (userEmail: string, unidade: string = UNIDADE_PADRAO): Promise<void> => {
      if (!userEmail) return;
      setLoading(true);
      try {
        const resp = await api.get<MinhaAssinaturaResponse>('minha_assinatura', {
          user_email: userEmail,
          unidade,
        });
        if (resp.ok && resp.data?.success && resp.data.assinatura) {
          setAssinatura(resp.data.assinatura);
          setCarregada(true);
        }
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  // ════════════════════════════════════════════════════════════
  // SALVAR
  // ════════════════════════════════════════════════════════════

  /**
   * Salva a assinatura no servidor. A unidade vai junto no payload —
   * a do state (preenchida pelo carregar) ou UNIDADE_PADRAO se vazia.
   *
   * @returns true em caso de sucesso, false caso contrário (alerta exibido).
   */
  const salvar = useCallback(
    async (userEmail: string): Promise<boolean> => {
      if (!userEmail) {
        alert('Email do usuário não definido');
        return false;
      }
      setLoading(true);
      try {
        const resp = await api.post<SalvarAssinaturaResponse>(
          'salvar_assinatura',
          {
            ...assinatura,
            user_email: userEmail,
            unidade: assinatura.unidade || UNIDADE_PADRAO,
          }
        );
        if (!resp.ok || !resp.data?.success) {
          alert(resp.data?.error || resp.error || 'Erro ao salvar assinatura');
          return false;
        }
        if (resp.data.assinatura) {
          setAssinatura(resp.data.assinatura);
          setCarregada(true);
        }
        return true;
      } finally {
        setLoading(false);
      }
    },
    [api, assinatura]
  );

  // ════════════════════════════════════════════════════════════
  // RETURN
  // ════════════════════════════════════════════════════════════

  return {
    assinatura,
    setAssinatura,
    carregada,
    loading,
    carregar,
    salvar,
  };
}

export default useAssinatura;
