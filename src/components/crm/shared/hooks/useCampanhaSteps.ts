/**
 * useCampanhaSteps.ts — Hook de gestão dos Steps da campanha
 *
 * Caminho: src/components/crm/shared/hooks/useCampanhaSteps.ts
 * Versão: 1.0 (Fase 1D — 30/05/2026)
 *
 * Responsabilidade:
 *  - Gerenciar a lista de steps em memória durante a edição no wizard
 *  - Salvar (cria ou atualiza) cada step na API após "Salvar campanha"
 *  - Excluir step (API + remoção local com reordenação)
 *
 * Comportamento idêntico a CampaignBuilder.tsx (linhas 386-425 + loop de
 * salvamento dentro de salvarCampanha 328-352).
 */

import { useCallback, useState } from 'react';
import { useCrmApi } from './useCrmApi';
import {
  CAMPANHA_API_URL,
  MAX_STEPS_POR_CAMPANHA,
  DELAY_PADRAO_STEP_SUBSEQUENTE,
} from '../../types/crm.constants';
import type { Step } from '../../types/crm.types';

// ════════════════════════════════════════════════════════════
// TIPOS DE RESPOSTA
// ════════════════════════════════════════════════════════════

interface SalvarStepResponse {
  success: boolean;
  step?: Step;
  error?: string;
}

interface UseCampanhaStepsOptions {
  apiUrl?: string;
}

// ════════════════════════════════════════════════════════════
// HOOK
// ════════════════════════════════════════════════════════════

export function useCampanhaSteps(options: UseCampanhaStepsOptions = {}) {
  const apiUrl = options.apiUrl ?? CAMPANHA_API_URL;
  const api = useCrmApi(apiUrl);

  const [steps, setSteps] = useState<Step[]>([]);
  const [stepEditando, setStepEditando] = useState<number | null>(null);

  // ════════════════════════════════════════════════════════════
  // ADICIONAR (local)
  // ════════════════════════════════════════════════════════════

  /**
   * @returns true se conseguiu adicionar; false se já atingiu o limite.
   */
  const adicionar = useCallback((): boolean => {
    if (steps.length >= MAX_STEPS_POR_CAMPANHA) {
      return false;
    }
    const novoStep: Step = {
      ordem: steps.length + 1,
      assunto: '',
      corpo_html: '',
      corpo_texto: '',
      delay_dias: steps.length === 0 ? 0 : DELAY_PADRAO_STEP_SUBSEQUENTE,
      condicao: 'sempre',
      ativo: true,
    };
    setSteps((prev) => [...prev, novoStep]);
    setStepEditando(steps.length);
    return true;
  }, [steps.length]);

  // ════════════════════════════════════════════════════════════
  // ATUALIZAR campo (local)
  // ════════════════════════════════════════════════════════════

  const atualizarCampo = useCallback(
    <K extends keyof Step>(index: number, campo: K, valor: Step[K]) => {
      setSteps((prev) => {
        const next = [...prev];
        if (next[index]) {
          next[index] = { ...next[index], [campo]: valor };
        }
        return next;
      });
    },
    []
  );

  // ════════════════════════════════════════════════════════════
  // EXCLUIR (API + local com reordenação)
  // ════════════════════════════════════════════════════════════

  const excluir = useCallback(
    async (index: number): Promise<boolean> => {
      const step = steps[index];
      if (!step) return false;

      // Se já estava persistido, chamar API
      if (step.id) {
        const resp = await api.del<{ success: boolean; error?: string }>(
          'excluir_step',
          { id: String(step.id) }
        );
        if (!resp.ok || !resp.data?.success) {
          alert(resp.data?.error || resp.error || 'Erro ao excluir step');
          return false;
        }
      }

      // Remove localmente e reordena
      setSteps((prev) =>
        prev
          .filter((_, i) => i !== index)
          .map((s, i) => ({ ...s, ordem: i + 1 }))
      );
      setStepEditando(null);
      return true;
    },
    [api, steps]
  );

  // ════════════════════════════════════════════════════════════
  // SALVAR (cria/atualiza todos os steps de uma campanha)
  // ════════════════════════════════════════════════════════════

  /**
   * Itera todos os steps em memória e persiste cada um na API.
   * - Se step.id existe → PATCH (atualizar)
   * - Se step.id não existe → POST (criar) e atualiza o id local
   *
   * Comportamento idêntico a CampaignBuilder.tsx linhas 328-352.
   */
  const salvarTodos = useCallback(
    async (campanhaId: number): Promise<boolean> => {
      try {
        const stepsAtualizados: Step[] = [];

        for (const step of steps) {
          if (step.id) {
            // UPDATE
            const resp = await api.patch<SalvarStepResponse>('atualizar_step', {
              id: step.id,
              assunto: step.assunto,
              corpo_html: step.corpo_html,
              corpo_texto: step.corpo_texto,
              delay_dias: step.delay_dias,
              condicao: step.condicao,
              ordem: step.ordem,
            });
            if (!resp.ok || !resp.data?.success) {
              throw new Error(
                resp.data?.error || resp.error || `Erro ao atualizar step ${step.ordem}`
              );
            }
            stepsAtualizados.push(step);
          } else {
            // CREATE
            const resp = await api.post<SalvarStepResponse>('criar_step', {
              campanha_id: campanhaId,
              ordem: step.ordem,
              assunto: step.assunto,
              corpo_html: step.corpo_html,
              corpo_texto: step.corpo_texto,
              delay_dias: step.delay_dias,
              condicao: step.condicao,
            });
            if (!resp.ok || !resp.data?.success) {
              throw new Error(
                resp.data?.error || resp.error || `Erro ao criar step ${step.ordem}`
              );
            }
            // Atualiza id local
            stepsAtualizados.push({ ...step, id: resp.data.step?.id });
          }
        }

        // Reflete os IDs novos no estado
        setSteps(stepsAtualizados);
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao salvar steps';
        alert(msg);
        return false;
      }
    },
    [api, steps]
  );

  // ════════════════════════════════════════════════════════════
  // RETURN
  // ════════════════════════════════════════════════════════════

  return {
    steps,
    setSteps,
    stepEditando,
    setStepEditando,
    adicionar,
    atualizarCampo,
    excluir,
    salvarTodos,
    podeAdicionar: steps.length < MAX_STEPS_POR_CAMPANHA,
    maxSteps: MAX_STEPS_POR_CAMPANHA,
  };
}

export default useCampanhaSteps;
