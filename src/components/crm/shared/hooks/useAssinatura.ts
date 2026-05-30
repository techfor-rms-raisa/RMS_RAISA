/**
 * useAssinatura.ts — Hook de assinatura do usuário (remetente)
 *
 * Caminho: src/components/crm/shared/hooks/useAssinatura.ts
 * Versão: 1.0 (Fase 1D — 30/05/2026)
 *
 * Responsabilidade:
 *  - Carregar a assinatura do usuário logado (por email)
 *  - Salvar (criar/atualizar) assinatura
 *
 * Comportamento idêntico a CampaignBuilder.tsx (linhas 219-226 + 461-476).
 *
 * NOTA: Na Fase 4 do plano (Pré-Projeto v3.1) este hook será substituído
 * por uma versão integrada com tabela `email_assinaturas` (CRUD completo
 * com múltiplas assinaturas por usuário). Por enquanto reproduz o
 * comportamento legado: 1 assinatura por user_email.
 */

import { useCallback, useState } from 'react';
import { useCrmApi } from './useCrmApi';
import { CAMPANHA_API_URL } from '../../types/crm.constants';
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

  const carregar = useCallback(
    async (userEmail: string): Promise<void> => {
      if (!userEmail) return;
      setLoading(true);
      try {
        const resp = await api.get<MinhaAssinaturaResponse>('minha_assinatura', {
          user_email: userEmail,
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
