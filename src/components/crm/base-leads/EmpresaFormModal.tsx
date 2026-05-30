/**
 * EmpresaFormModal.tsx — Modal de criar/editar empresa
 *
 * Caminho: src/components/crm/base-leads/EmpresaFormModal.tsx
 * Versão: 1.0 (Fase 1C — 29/05/2026)
 *
 * Decomposto de EmpresasLeadsCRM.tsx (linhas 717-794).
 * Comportamento e estilo preservados integralmente.
 */

import React from 'react';
import { SETORES, PORTES } from '../types/crm.constants';
import type { Empresa } from '../types/crm.types';

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

export interface EmpresaFormModalProps {
  modo: 'criar' | 'editar' | null;
  form: Partial<Empresa>;
  loading: boolean;
  onChange: (next: Partial<Empresa>) => void;
  onSalvar: () => void;
  onFechar: () => void;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const EmpresaFormModal: React.FC<EmpresaFormModalProps> = ({
  modo,
  form,
  loading,
  onChange,
  onSalvar,
  onFechar,
}) => {
  if (!modo) return null;

  const setField = <K extends keyof Empresa>(key: K, value: Empresa[K]) => {
    onChange({ ...form, [key]: value });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">
            {modo === 'criar' ? 'Nova Empresa' : 'Editar Empresa'}
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Domínio</label>
              <input
                value={form.dominio || ''}
                onChange={(e) => setField('dominio', e.target.value)}
                placeholder="empresa.com.br"
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
              <input
                value={form.cnpj || ''}
                onChange={(e) => setField('cnpj', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Setor</label>
              <select
                value={form.setor || ''}
                onChange={(e) => setField('setor', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
              >
                <option value="">Selecionar</option>
                {SETORES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Porte</label>
              <select
                value={form.porte || ''}
                onChange={(e) => setField('porte', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
              >
                <option value="">Selecionar</option>
                {PORTES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
              <input
                value={form.cidade || ''}
                onChange={(e) => setField('cidade', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">UF</label>
              <input
                value={form.uf || ''}
                onChange={(e) => setField('uf', e.target.value)}
                maxLength={2}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
            <input
              value={form.website || ''}
              onChange={(e) => setField('website', e.target.value)}
              placeholder="https://"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
            <textarea
              value={form.observacoes || ''}
              onChange={(e) => setField('observacoes', e.target.value)}
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
            disabled={!form.nome || loading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmpresaFormModal;
