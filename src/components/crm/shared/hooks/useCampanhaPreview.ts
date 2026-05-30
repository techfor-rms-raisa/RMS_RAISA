/**
 * useCampanhaPreview.ts — Hook de preview do email da campanha
 *
 * Caminho: src/components/crm/shared/hooks/useCampanhaPreview.ts
 * Versão: 1.0 (Fase 1D — 30/05/2026)
 *
 * Responsabilidade:
 *  - Chamar o endpoint de preview com substituição de variáveis ({{name}})
 *    e adição da assinatura.
 *  - Manter estado do step sendo visualizado.
 *
 * Comportamento idêntico a CampaignBuilder.tsx (linhas 252-267).
 */

import { useCallback, useState } from 'react';
import { useCrmApi } from './useCrmApi';
import { CAMPANHA_API_URL } from '../../types/crm.constants';

// ════════════════════════════════════════════════════════════
// TIPOS DE RESPOSTA
// ════════════════════════════════════════════════════════════

interface PreviewResponse {
  success: boolean;
  preview: {
    assunto: string;
    corpo: string;
  };
  error?: string;
}

interface UseCampanhaPreviewOptions {
  apiUrl?: string;
}

// ════════════════════════════════════════════════════════════
// HOOK
// ════════════════════════════════════════════════════════════

export function useCampanhaPreview(options: UseCampanhaPreviewOptions = {}) {
  const apiUrl = options.apiUrl ?? CAMPANHA_API_URL;
  const api = useCrmApi(apiUrl);

  const [previewHtml, setPreviewHtml] = useState('');
  const [previewAssunto, setPreviewAssunto] = useState('');
  const [previewStep, setPreviewStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // ════════════════════════════════════════════════════════════
  // CARREGAR
  // ════════════════════════════════════════════════════════════

  /**
   * @param campanhaId  ID da campanha
   * @param stepOrdem   Ordem do step (1, 2, 3, ...)
   * @param userEmail   Email do usuário (para buscar assinatura)
   * @param leadId      ID de um lead para usar como exemplo (opcional)
   */
  const carregar = useCallback(
    async (
      campanhaId: number,
      stepOrdem: number,
      userEmail?: string,
      leadId?: number
    ): Promise<void> => {
      setLoading(true);
      try {
        const params: Record<string, string> = {
          campanha_id: String(campanhaId),
          step_ordem: String(stepOrdem),
        };
        if (userEmail) params.user_email = userEmail;
        if (leadId) params.lead_id = String(leadId);

        const resp = await api.get<PreviewResponse>('preview', params);
        if (resp.ok && resp.data?.success && resp.data.preview) {
          setPreviewHtml(resp.data.preview.corpo);
          setPreviewAssunto(resp.data.preview.assunto);
          setPreviewStep(stepOrdem);
        }
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  // ════════════════════════════════════════════════════════════
  // RESET
  // ════════════════════════════════════════════════════════════

  const reset = useCallback(() => {
    setPreviewHtml('');
    setPreviewAssunto('');
    setPreviewStep(1);
  }, []);

  // ════════════════════════════════════════════════════════════
  // RETURN
  // ════════════════════════════════════════════════════════════

  return {
    previewHtml,
    previewAssunto,
    previewStep,
    setPreviewStep,
    loading,
    carregar,
    reset,
  };
}

export default useCampanhaPreview;
