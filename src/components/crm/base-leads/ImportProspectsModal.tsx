/**
 * ImportProspectsModal.tsx — Modal de importação do Prospect Engine
 *
 * Caminho: src/components/crm/base-leads/ImportProspectsModal.tsx
 * Versão: 1.0 (Fase 1C — 29/05/2026)
 *
 * Decomposto de EmpresasLeadsCRM.tsx (linhas 1114-1199).
 */

import React from 'react';
import type {
  ProspectDisponivel,
  ResultadoImport,
} from '../shared/hooks/useImportProspects';

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

export interface ImportProspectsModalProps {
  aberto: boolean;
  loading: boolean;
  disponiveis: ProspectDisponivel[];
  selecionados: Set<number>;
  resultado: ResultadoImport | null;
  onToggleSelecionado: (id: number) => void;
  onSelecionarTodos: () => void;
  onExecutar: () => void;
  onFechar: () => void;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const ImportProspectsModal: React.FC<ImportProspectsModalProps> = ({
  aberto,
  loading,
  disponiveis,
  selecionados,
  resultado,
  onToggleSelecionado,
  onSelecionarTodos,
  onExecutar,
  onFechar,
}) => {
  if (!aberto) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Importar do Prospect Engine</h2>
            <p className="text-sm text-gray-500">
              Selecione os prospects com email para importar como leads
            </p>
          </div>
          <button
            onClick={onFechar}
            className="text-gray-400 hover:text-gray-600 text-xl"
            aria-label="Fechar"
          >
            &times;
          </button>
        </div>

        {resultado ? (
          /* ═══════════════ RESULTADO ═══════════════ */
          <div className="p-6 text-center">
            <i className="fa-solid fa-circle-check text-4xl text-green-500 mb-3"></i>
            <h3 className="text-lg font-bold text-gray-800 mb-4">Importação Concluída</h3>
            <div className="grid grid-cols-2 gap-3 text-sm max-w-xs mx-auto">
              <div className="bg-green-50 p-3 rounded-lg">
                <span className="text-2xl font-bold text-green-700">
                  {resultado.importados}
                </span>
                <p className="text-green-600">Importados</p>
              </div>
              <div className="bg-yellow-50 p-3 rounded-lg">
                <span className="text-2xl font-bold text-yellow-700">
                  {resultado.duplicados}
                </span>
                <p className="text-yellow-600">Duplicados</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <span className="text-2xl font-bold text-gray-700">
                  {resultado.sem_email}
                </span>
                <p className="text-gray-600">Sem email</p>
              </div>
              <div className="bg-indigo-50 p-3 rounded-lg">
                <span className="text-2xl font-bold text-indigo-700">
                  {resultado.empresas_criadas}
                </span>
                <p className="text-indigo-600">Empresas criadas</p>
              </div>
            </div>
            <button
              onClick={onFechar}
              className="mt-6 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
            >
              Fechar
            </button>
          </div>
        ) : (
          /* ═══════════════ LISTA DE PROSPECTS ═══════════════ */
          <>
            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="text-center py-12 text-gray-400">
                  <i className="fa-solid fa-spinner fa-spin text-2xl mb-2 block"></i>
                  Carregando prospects...
                </div>
              ) : disponiveis.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p>Nenhum prospect com email disponível para importação</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={
                          selecionados.size === disponiveis.length && disponiveis.length > 0
                        }
                        onChange={onSelecionarTodos}
                        className="rounded"
                      />
                      Selecionar todos ({disponiveis.length})
                    </label>
                    <span className="text-sm text-indigo-600 font-medium">
                      {selecionados.size} selecionados
                    </span>
                  </div>
                  <div className="space-y-1">
                    {disponiveis.map((p) => (
                      <label
                        key={p.id}
                        className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={selecionados.has(p.id)}
                          onChange={() => onToggleSelecionado(p.id)}
                          className="rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 truncate">
                            {p.nome_completo}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {p.cargo || '—'} — {p.empresa_nome || '—'} — {p.email}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t bg-gray-50">
              <button
                onClick={onFechar}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={onExecutar}
                disabled={selecionados.size === 0 || loading}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                <i className="fa-solid fa-download"></i>
                {loading
                  ? 'Importando...'
                  : `Importar ${selecionados.size} prospect${
                      selecionados.size !== 1 ? 's' : ''
                    }`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ImportProspectsModal;
