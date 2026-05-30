/**
 * StepLeads.tsx — Passo 3 do wizard: Vincular/Desvincular Leads
 *
 * Caminho: src/components/crm/campanhas/wizard-steps/StepLeads.tsx
 * Versão: 1.0 (Fase 1D — 30/05/2026)
 *
 * Decomposto de CampaignBuilder.tsx (linhas 1086-1226).
 * Layout em 2 colunas: disponíveis | vinculados.
 */

import React from 'react';
import type { LeadCampanha, LeadDisponivel } from '../../types/crm.types';

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

export interface StepLeadsProps {
  disponiveis: LeadDisponivel[];
  vinculados: LeadCampanha[];
  selecionados: number[];
  busca: string;
  loadingVinculados: boolean;
  saving: boolean;
  onBuscaChange: (v: string) => void;
  onToggleSelecionado: (leadId: number) => void;
  onVincular: () => void;
  onDesvincular: (leadId: number) => void;
  onVoltar: () => void;
  onProximo: () => void;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const StepLeads: React.FC<StepLeadsProps> = ({
  disponiveis,
  vinculados,
  selecionados,
  busca,
  loadingVinculados,
  saving,
  onBuscaChange,
  onToggleSelecionado,
  onVincular,
  onDesvincular,
  onVoltar,
  onProximo,
}) => {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ══════════════════════════════════════════ */}
        {/* Coluna esquerda: leads disponíveis        */}
        {/* ══════════════════════════════════════════ */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <i className="fa-solid fa-user-plus text-green-600"></i>
            Leads disponíveis
          </h3>

          {/* Busca */}
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
              <input
                type="text"
                placeholder="Buscar lead..."
                value={busca}
                onChange={(e) => onBuscaChange(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>

          {/* Lista */}
          <div className="border border-gray-200 rounded-lg max-h-80 overflow-y-auto">
            {disponiveis.length === 0 ? (
              <p className="text-center text-gray-400 py-8 text-sm">
                Nenhum lead disponível
              </p>
            ) : (
              <div className="divide-y divide-gray-100">
                {disponiveis.map((lead) => (
                  <label
                    key={lead.id}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selecionados.includes(lead.id)}
                      onChange={() => onToggleSelecionado(lead.id)}
                      className="rounded text-blue-600"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {lead.nome}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {lead.email} • {lead.email_empresas?.nome || '—'}
                      </p>
                    </div>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        lead.funil === 'lead'
                          ? 'bg-gray-100 text-gray-600'
                          : lead.funil === 'prospect'
                          ? 'bg-blue-100 text-blue-600'
                          : 'bg-green-100 text-green-600'
                      }`}
                    >
                      {lead.funil}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Botão Vincular */}
          {selecionados.length > 0 && (
            <button
              onClick={onVincular}
              disabled={saving}
              className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? (
                <i className="fa-solid fa-spinner fa-spin"></i>
              ) : (
                <i className="fa-solid fa-user-plus"></i>
              )}
              Vincular {selecionados.length} lead
              {selecionados.length > 1 ? 's' : ''}
            </button>
          )}
        </div>

        {/* ══════════════════════════════════════════ */}
        {/* Coluna direita: leads vinculados          */}
        {/* ══════════════════════════════════════════ */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <i className="fa-solid fa-users text-blue-600"></i>
            Leads na campanha ({vinculados.length})
          </h3>

          <div className="border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
            {loadingVinculados ? (
              <div className="flex items-center justify-center py-8">
                <i className="fa-solid fa-spinner fa-spin text-blue-500 text-2xl"></i>
              </div>
            ) : vinculados.length === 0 ? (
              <p className="text-center text-gray-400 py-8 text-sm">
                Nenhum lead vinculado
              </p>
            ) : (
              <div className="divide-y divide-gray-100">
                {vinculados.map((lc) => (
                  <div
                    key={lc.id}
                    className="flex items-center justify-between px-3 py-2 hover:bg-gray-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {lc.email_leads.nome}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {lc.email_leads.email} •{' '}
                        {lc.email_leads.email_empresas?.nome || '—'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <span className="text-xs text-gray-400">
                        Step {lc.step_atual}
                      </span>
                      <button
                        onClick={() => onDesvincular(lc.email_leads.id)}
                        className="text-red-400 hover:text-red-600 p-1"
                        title="Remover"
                      >
                        <i className="fa-solid fa-user-minus text-sm"></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

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
          Próximo: Preview <i className="fa-solid fa-chevron-right"></i>
        </button>
      </div>
    </div>
  );
};

export default StepLeads;
