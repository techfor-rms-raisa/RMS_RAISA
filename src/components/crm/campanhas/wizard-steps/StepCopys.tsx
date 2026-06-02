/**
 * StepCopys.tsx — Passo 2 do wizard: Steps da sequência (até 5)
 *
 * Caminho: src/components/crm/campanhas/wizard-steps/StepCopys.tsx
 * Versão: 2.0 (Fase 4C — 31/05/2026)
 *
 * 🔄 Fase 4C — Substituição do editor inline pelo seletor de biblioteca:
 *  - O conteúdo (assunto/corpo) deixa de ser digitado aqui. Cada step é criado
 *    selecionando uma copy da Biblioteca (snapshot) via CopySelector.
 *  - O conteúdo do step é READ-ONLY (fiel à copy selecionada — decisão travada).
 *  - Permanecem editáveis apenas os campos de TIMING do step: delay e condição.
 *  - Compatibilidade (modo híbrido): steps legados sem copy_id continuam sendo
 *    exibidos (read-only), marcados como "Conteúdo manual (legado)".
 *
 * Versão anterior (1.0, Fase 1D) trazia textareas de assunto/corpo inline,
 * decompostas de CampaignBuilder.tsx (linhas 922-1080). Removidas nesta versão.
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
                          value={step.delay_dias}
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
