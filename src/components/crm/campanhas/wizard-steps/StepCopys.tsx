/**
 * StepCopys.tsx — Passo 2 do wizard: Editor de Copys/Emails (até 5 steps)
 *
 * Caminho: src/components/crm/campanhas/wizard-steps/StepCopys.tsx
 * Versão: 1.0 (Fase 1D — 30/05/2026)
 *
 * Decomposto de CampaignBuilder.tsx (linhas 922-1080).
 * Mantém o nome "Step" do original — no UI são "Steps da sequência".
 *
 * Nota: na Fase 4 do plano (Pré-Projeto v3.1), este passo será reformulado
 * para SELECIONAR copys da Biblioteca (CRUD Admin-only) em vez de editar
 * inline. Por enquanto preserva o comportamento original.
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
  onAdicionar: () => void;
  onAtualizarCampo: <K extends keyof Step>(idx: number, campo: K, valor: Step[K]) => void;
  onExcluir: (idx: number) => void;
  onVoltar: () => void;
  onProximo: () => void;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const StepCopys: React.FC<StepCopysProps> = ({
  steps,
  stepEditando,
  podeAdicionar,
  setStepEditando,
  onAdicionar,
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
            Configure de 1 a {MAX_STEPS_POR_CAMPANHA} emails na sequência. Use{' '}
            <code className="bg-gray-100 px-1 rounded">{'{{name}}'}</code> para inserir o
            primeiro nome do lead.
          </p>
        </div>
        <button
          onClick={onAdicionar}
          disabled={!podeAdicionar}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          <i className="fa-solid fa-plus"></i>
          Adicionar Step
        </button>
      </div>

      {/* Lista de steps */}
      {steps.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-lg">
          <EmptyState
            icon="fa-solid fa-envelope"
            titulo="Nenhum step adicionado"
            descricao="Comece adicionando o primeiro email da sequência"
            acaoLabel="+ Adicionar primeiro step"
            onAcao={onAdicionar}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {steps.map((step, index) => {
            const ativo = stepEditando === index;
            return (
              <div
                key={index}
                className={`border rounded-lg transition-all ${
                  ativo ? 'border-blue-300 shadow-sm' : 'border-gray-200'
                }`}
              >
                {/* Header do step */}
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
                  onClick={() => setStepEditando(ativo ? null : index)}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                      {step.ordem}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {step.assunto || '(sem assunto)'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {index === 0
                          ? 'Envio imediato'
                          : `${step.delay_dias} dias após step ${step.ordem - 1}`}
                        {' • '}
                        {LABEL_CONDICAO_STEP[step.condicao] || step.condicao}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
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

                {/* Editor do step (expandido) */}
                {ativo && (
                  <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-4">
                    {/* Assunto */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Assunto do email *
                      </label>
                      <input
                        type="text"
                        value={step.assunto}
                        onChange={(e) => onAtualizarCampo(index, 'assunto', e.target.value)}
                        placeholder="Ex: Sua equipe de TI está no limite — e o problema pode não ser a equipe"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>

                    {/* Corpo HTML */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Corpo do email (HTML) *
                        <span className="ml-2 text-xs font-normal text-gray-400">
                          Use <code>{'{{name}}'}</code> para o primeiro nome do lead
                        </span>
                      </label>
                      <textarea
                        value={step.corpo_html}
                        onChange={(e) =>
                          onAtualizarCampo(index, 'corpo_html', e.target.value)
                        }
                        rows={12}
                        placeholder={`Olá {{name}},\n\nDeixa eu te fazer uma pergunta direta.\n\n...`}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        A assinatura do remetente será adicionada automaticamente ao final.
                      </p>
                    </div>

                    {/* Delay + Condição */}
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
