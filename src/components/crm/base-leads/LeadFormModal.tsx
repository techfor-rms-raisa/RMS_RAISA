/**
 * LeadFormModal.tsx — Modal de criar/editar lead
 *
 * Caminho: src/components/crm/base-leads/LeadFormModal.tsx
 * Versão: 1.0 (Fase 1C — 29/05/2026)
 *
 * Decomposto de EmpresasLeadsCRM.tsx (linhas 799-859).
 */

import React from 'react';
import type { Empresa, Lead } from '../types/crm.types';

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

export interface LeadFormModalProps {
  modo: 'criar' | 'editar' | null;
  form: Partial<Lead>;
  loading: boolean;
  /** Lista de empresas para o select (vem do hook useEmpresas). */
  empresas: Empresa[];
  onChange: (next: Partial<Lead>) => void;
  onSalvar: () => void;
  onFechar: () => void;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const LeadFormModal: React.FC<LeadFormModalProps> = ({
  modo,
  form,
  loading,
  empresas,
  onChange,
  onSalvar,
  onFechar,
}) => {
  if (!modo) return null;

  const setField = <K extends keyof Lead>(key: K, value: Lead[K]) => {
    onChange({ ...form, [key]: value });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">
            {modo === 'criar' ? 'Novo Lead' : 'Editar Lead'}
          </h2>
          <button
            onClick={onFechar}
            className="text-gray-400 hover:text-gray-600 text-xl"
            aria-label="Fechar"
          >
            &times;
          </button>
        </div>

        {/* Form */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
            <input
              value={form.nome || ''}
              onChange={(e) => setField('nome', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input
              type="email"
              value={form.email || ''}
              onChange={(e) => setField('email', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
              <input
                value={form.cargo || ''}
                onChange={(e) => setField('cargo', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
              <input
                value={form.telefone || ''}
                onChange={(e) => setField('telefone', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
            <select
              value={form.empresa_id ?? ''}
              onChange={(e) =>
                setField('empresa_id', e.target.value ? Number(e.target.value) : null)
              }
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
            >
              <option value="">Sem empresa</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">LinkedIn</label>
            <input
              value={form.linkedin_url || ''}
              onChange={(e) => setField('linkedin_url', e.target.value)}
              placeholder="https://linkedin.com/in/..."
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea
              value={form.notas || ''}
              onChange={(e) => setField('notas', e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-gray-50">
          <button
            onClick={onFechar}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Cancelar
          </button>
          <button
            onClick={onSalvar}
            disabled={!form.nome || !form.email || loading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LeadFormModal;
