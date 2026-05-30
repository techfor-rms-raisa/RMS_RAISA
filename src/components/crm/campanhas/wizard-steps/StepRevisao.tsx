/**
 * StepRevisao.tsx — Passo 4 do wizard: Preview/Revisão do email
 *
 * Caminho: src/components/crm/campanhas/wizard-steps/StepRevisao.tsx
 * Versão: 1.0 (Fase 1D — 30/05/2026)
 *
 * Decomposto de CampaignBuilder.tsx (linhas 1232-1329).
 */

import React from 'react';
import type { Campanha, Step, LeadCampanha } from '../../types/crm.types';

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

export interface StepRevisaoProps {
  campanha: Partial<Campanha>;
  steps: Step[];
  vinculados: LeadCampanha[];
  previewHtml: string;
  previewAssunto: string;
  previewStep: number;
  saving: boolean;
  onMudarPreviewStep: (ordem: number) => void;
  onVoltar: () => void;
  onSalvar: () => void;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const StepRevisao: React.FC<StepRevisaoProps> = ({
  campanha,
  steps,
  vinculados,
  previewHtml,
  previewAssunto,
  previewStep,
  saving,
  onMudarPreviewStep,
  onVoltar,
  onSalvar,
}) => {
  const stepAtual = steps[previewStep - 1];
  const primeiroLead = vinculados[0]?.email_leads;
  const primeiroNome = primeiroLead?.nome?.split(' ')[0] || '{{name}}';

  return (
    <div className="space-y-4">
      {/* Header com seletor de step */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Preview do email</h3>
        {steps.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Step:</span>
            {steps.map((s) => (
              <button
                key={s.ordem}
                onClick={() => onMudarPreviewStep(s.ordem)}
                className={`w-8 h-8 rounded-full text-xs font-bold transition-colors ${
                  previewStep === s.ordem
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s.ordem}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Preview do email */}
      {steps.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p>Adicione ao menos um step para ver o preview</p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {/* Cabeçalho do email */}
          <div className="bg-gray-50 px-4 py-3 border-b space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500 w-16">De:</span>
              <span className="font-medium">
                {campanha.nome_remetente || '—'} &lt;
                {campanha.email_remetente || '—'}&gt;
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500 w-16">Para:</span>
              <span>{primeiroLead?.email || 'lead@empresa.com'}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500 w-16">Assunto:</span>
              <span className="font-medium">
                {previewAssunto || stepAtual?.assunto || '—'}
              </span>
            </div>
          </div>

          {/* Corpo do email */}
          <div className="p-6 bg-white">
            {previewHtml ? (
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{
                  __html: previewHtml.replace(/\n/g, '<br/>'),
                }}
              />
            ) : (
              <div className="whitespace-pre-wrap text-sm text-gray-700">
                {stepAtual?.corpo_html
                  ?.replace(/\{\{name\}\}/gi, primeiroNome) || 'Sem conteúdo'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Info resumo */}
      {campanha.id && (
        <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
          <p>
            <span className="text-gray-500">Campanha:</span>{' '}
            <span className="font-medium">{campanha.nome}</span>
          </p>
          <p>
            <span className="text-gray-500">Tipo:</span> {campanha.tipo}
          </p>
          <p>
            <span className="text-gray-500">Steps:</span> {steps.length}
          </p>
          <p>
            <span className="text-gray-500">Leads:</span> {vinculados.length}
          </p>
          <p>
            <span className="text-gray-500">Domínio de envio:</span>{' '}
            {campanha.dominio_envio || 'Não definido'}
          </p>
          <p>
            <span className="text-gray-500">Janela de envio:</span>{' '}
            {campanha.horario_inicio} — {campanha.horario_fim}
          </p>
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
          onClick={onSalvar}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? (
            <i className="fa-solid fa-spinner fa-spin"></i>
          ) : (
            <i className="fa-solid fa-floppy-disk"></i>
          )}
          Salvar campanha
        </button>
      </div>
    </div>
  );
};

export default StepRevisao;
