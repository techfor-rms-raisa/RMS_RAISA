/**
 * StepCopys.tsx — Passo 2 do wizard: Steps da sequência (até 5)
 *
 * Caminho: src/components/crm/campanhas/wizard-steps/StepCopys.tsx
 * Versão: 2.1 (Fase 5B-UI — 02/06/2026)
 *
 * Histórico:
 *  - v1.0 (Fase 1D): decomposto de CampaignBuilder.tsx (linhas 922-1080).
 *    Textareas inline de assunto/corpo + input de delay + select de condição.
 *  - v2.0 (Fase 4C, 31/05/2026): substituição do editor inline pelo seletor
 *    de biblioteca. Conteúdo (assunto/corpo) deixa de ser digitado aqui —
 *    cada step é criado selecionando uma copy via CopySelector (snapshot).
 *    Conteúdo READ-ONLY. Permanecem editáveis apenas timing (delay/condição).
 *    Modo híbrido: steps legados sem copy_id continuam sendo exibidos como
 *    "Conteúdo manual (legado)".
 *  - v2.1 (02/06/2026 — Fase 5B-UI): correção visual do input de delay no
 *    Step 1. O input já era `disabled={index === 0}` (regra: primeiro step =
 *    envio imediato), mas o `value` exibia o `delay_dias` do banco — e
 *    campanhas LEGACY criadas antes da correção `||` → `??` (crm-campanhas
 *    v1.8, 02/06/2026) carregavam `3` aqui, confundindo o usuário que via
 *    "3 dias" debaixo de um campo bloqueado com texto "envio imediato".
 *    Agora o `value` força `0` quando `index === 0`, independente do banco.
 *    O cron já ignorava esse valor (ver mudar_status, step 1 = AGORA);
 *    a correção é puramente cosmética.
 *
 * 🔄 Fase 4C — Substituição do editor inline pelo seletor de biblioteca:
 *  - O conteúdo (assunto/corpo) deixa de ser digitado aqui. Cada step é criado
 *    selecionando uma copy da Biblioteca (snapshot) via CopySelector.
 *  - O conteúdo do step é READ-ONLY (fiel à copy selecionada — decisão travada).
 *  - Permanecem editáveis apenas os campos de TIMING do step: delay e condição.
 *  - Compatibilidade (modo híbrido): steps legados sem copy_id continuam sendo
 *    exibidos (read-only), marcados como "Conteúdo manual (legado)".
 */

import React from 'react';
import { LABEL_CONDICAO_STEP, MAX_STEPS_POR_CAMPANHA } from '../../types/crm.constants';
import type { Step } from '../../types/crm.types';
import EmptyState from '../../shared/components/EmptyState';

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

export interface StepCopysProps {
  steps: Step[];
  stepEditando: number | null;
  podeAdicionar: boolean;
  setStepEditando: (idx: number | null) => void;
  /** 🆕 Fase 4C — abre o CopySelector (substitui o antigo onAdicionar). */
  onAbrirSeletor: () => void;
  /** Atualiza campos de timing do step (delay_dias, condicao). */
  onAtualizarCampo: <K extends keyof Step>(idx: number, campo: K, valor: Step[K]) => void;
  onExcluir: (idx: number) => void;
  onVoltar: () => void;
  onProximo: () => void;
}

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

/** Realça {{name}} no corpo para a pré-visualização (mesmo padrão do CopyPreviewModal). */
function realceName(html: string): string {
  return (html || '').replace(
    /\{\{name\}\}/gi,
    '<span class="bg-yellow-100 text-yellow-800 px-1 rounded">[Primeiro Nome]</span>'
  );
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const StepCopys: React.FC<StepCopysProps> = ({
  steps,
  stepEditando,
  podeAdicionar,
  setStepEditando,
  onAbrirSeletor,
  onAtualizarCampo,
  onExcluir,
  onVoltar,
  onProximo,
}) => {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Steps da sequência</h3>
          <p className="text-sm text-gray-500">
            Configure de 1 a {MAX_STEPS_POR_CAMPANHA} emails na sequência. O conteúdo
            de cada step vem da{' '}
            <span className="font-medium">Biblioteca de Copys</span> e é copiado como
            snapshot (somente leitura aqui).
          </p>
        </div>
        <button
          onClick={onAbrirSeletor}
          disabled={!podeAdicionar}
          className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
        >
          <i className="fa-solid fa-book-open"></i>
          Selecionar copy da biblioteca
        </button>
      </div>

      {/* Lista de steps */}
      {steps.length === 0 ? (
        <EmptyState
          icon="fa-solid fa-envelope-open-text"
          titulo="Nenhum step ainda"
          descricao='Clique em "Selecionar copy da biblioteca" para criar o primeiro email da sequência.'
        />
      ) : (
        <div className="space-y-3">
          {steps.map((step, index) => {
            const ativo = stepEditando === index;
            const temCopy = step.copy_id != null;
            return (
              <div
                key={step.id ?? `novo-${index}`}
                className="border border-gray-200 rounded-lg overflow-hidden"
              >
                {/* Cabeçalho colapsável do step */}
                <div
                  onClick={() => setStepEditando(ativo ? null : index)}
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-sm font-bold shrink-0">
                      {step.ordem}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {step.assunto || '(sem assunto)'}
                        </p>
                        {temCopy ? (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 whitespace-nowrap">
                            <i className="fa-solid fa-book"></i> Biblioteca
                          </span>
                        ) : (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">
                            <i className="fa-solid fa-pen"></i> Manual (legado)
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {index === 0
                          ? 'Envio imediato'
                          : `${step.delay_dias} dias após step ${step.ordem - 1}`}
                        {' • '}
                        {LABEL_CONDICAO_STEP[step.condicao] || step.condicao}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Excluir este step?')) onExcluir(index);
                      }}
                      className="text-red-400 hover:text-red-600 p-1"
                      title="Excluir step"
                    >
                      <i className="fa-solid fa-trash text-sm"></i>
                    </button>
                    <i
                      className={`fa-solid ${
                        ativo ? 'fa-chevron-up' : 'fa-chevron-down'
                      } text-gray-400 text-sm`}
                    ></i>
                  </div>
                </div>

                {/* Conteúdo expandido (read-only) + timing editável */}
                {ativo && (
                  <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-4">
                    {/* Assunto (read-only) */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Assunto do email
                      </label>
                      <p className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
                        {step.assunto || '(sem assunto)'}
                      </p>
                    </div>

                    {/* Corpo (read-only, com realce de {{name}}) */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Conteúdo do email
                        <span className="ml-2 text-xs font-normal text-gray-400">
                          Somente leitura — definido pela copy da biblioteca
                        </span>
                      </label>
                      <div
                        className="w-full max-h-72 overflow-y-auto px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: realceName(step.corpo_html) }}
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        A assinatura do remetente será adicionada automaticamente ao final.
                      </p>
                    </div>

                    {/* Timing: Delay + Condição (editáveis) */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Delay (dias após step anterior)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="30"
                          // 🔧 v2.1 — display força 0 no Step 1 (envio imediato),
                          // independente do que está no banco. Cobre campanhas
                          // legacy criadas com a v1.7 do backend (antes do
                          // fix `|| 3` → `?? 3` no criar_step v1.8).
                          value={index === 0 ? 0 : step.delay_dias}
                          onChange={(e) =>
                            onAtualizarCampo(
                              index,
                              'delay_dias',
                              parseInt(e.target.value) || 0
                            )
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          disabled={index === 0}
                        />
                        {index === 0 && (
                          <p className="text-xs text-gray-400 mt-1">
                            Primeiro step: envio imediato
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Condição de envio
                        </label>
                        <select
                          value={step.condicao}
                          onChange={(e) =>
                            onAtualizarCampo(index, 'condicao', e.target.value)
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                          {Object.entries(LABEL_CONDICAO_STEP).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Navegação */}
      <div className="flex justify-between pt-4 border-t">
        <button
          onClick={onVoltar}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
        >
          <i className="fa-solid fa-arrow-left"></i> Voltar
        </button>
        <button
          onClick={onProximo}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          Próximo: Leads <i className="fa-solid fa-chevron-right"></i>
        </button>
      </div>
    </div>
  );
};

export default StepCopys;
