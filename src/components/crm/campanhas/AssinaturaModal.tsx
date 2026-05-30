/**
 * AssinaturaModal.tsx — Modal de gestão da assinatura do remetente
 *
 * Caminho: src/components/crm/campanhas/AssinaturaModal.tsx
 * Versão: 1.0 (Fase 1D — 30/05/2026)
 *
 * Decomposto de CampaignBuilder.tsx (linhas 1335-1455).
 * Comportamento e visual preservados integralmente.
 */

import React from 'react';
import type { Assinatura } from '../types/crm.types';

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

export interface AssinaturaModalProps {
  aberto: boolean;
  assinatura: Partial<Assinatura>;
  saving: boolean;
  onChange: (next: Partial<Assinatura>) => void;
  onSalvar: () => void;
  onFechar: () => void;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const AssinaturaModal: React.FC<AssinaturaModalProps> = ({
  aberto,
  assinatura,
  saving,
  onChange,
  onSalvar,
  onFechar,
}) => {
  if (!aberto) return null;

  const setField = <K extends keyof Assinatura>(key: K, value: Assinatura[K]) => {
    onChange({ ...assinatura, [key]: value });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-lg font-bold text-gray-900">Minha Assinatura</h3>
          <button
            onClick={onFechar}
            className="text-gray-400 hover:text-gray-600 text-xl"
            aria-label="Fechar"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nome completo *
            </label>
            <input
              type="text"
              value={assinatura.nome_completo || ''}
              onChange={(e) => setField('nome_completo', e.target.value)}
              placeholder="Ex: Tatiana Santos da Silva Cruz"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cargo
            </label>
            <input
              type="text"
              value={assinatura.cargo || ''}
              onChange={(e) => setField('cargo', e.target.value)}
              placeholder="Ex: Gerente de Negócios"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email na assinatura *
            </label>
            <input
              type="email"
              value={assinatura.email_assinatura || ''}
              onChange={(e) => setField('email_assinatura', e.target.value)}
              placeholder="Ex: tsilva@techforti.com.br"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">
              Email institucional (não o domínio de envio)
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Telefone fixo
              </label>
              <input
                type="text"
                value={assinatura.telefone_fixo || ''}
                onChange={(e) => setField('telefone_fixo', e.target.value)}
                placeholder="+55 (11) 3138-5800"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Celular
              </label>
              <input
                type="text"
                value={assinatura.telefone_celular || ''}
                onChange={(e) => setField('telefone_celular', e.target.value)}
                placeholder="+55 (11) 9 9484-4169"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Websites (um por linha)
            </label>
            <textarea
              value={(assinatura.websites || []).join('\n')}
              onChange={(e) =>
                setField('websites', e.target.value.split('\n').filter(Boolean))
              }
              rows={2}
              placeholder={`http://www.techforti.com.br\nhttp://www.techcob.com.br`}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              URL Política de Privacidade
            </label>
            <input
              type="url"
              value={assinatura.politica_privacidade_url || ''}
              onChange={(e) => setField('politica_privacidade_url', e.target.value)}
              placeholder="https://outsourcing.techforti.online/privacidade/"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Texto de opt-out
            </label>
            <input
              type="text"
              value={
                assinatura.optout_texto ||
                'Caso não queira receber nossos comunicados, responda SAIR'
              }
              onChange={(e) => setField('optout_texto', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
          <button
            onClick={onFechar}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-100"
          >
            Cancelar
          </button>
          <button
            onClick={onSalvar}
            disabled={
              saving || !assinatura.nome_completo || !assinatura.email_assinatura
            }
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? (
              <i className="fa-solid fa-spinner fa-spin"></i>
            ) : (
              <i className="fa-solid fa-floppy-disk"></i>
            )}
            Salvar assinatura
          </button>
        </div>
      </div>
    </div>
  );
};

export default AssinaturaModal;
