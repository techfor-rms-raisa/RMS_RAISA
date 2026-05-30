/**
 * CopyEditorModal.tsx — Modal de criar/editar copy
 *
 * Caminho: src/components/crm/copys/components/CopyEditorModal.tsx
 * Versão: 1.0 (Fase 4B — 30/05/2026)
 *
 * Modal full-screen com formulário completo:
 *   - Nome interno (identificação na biblioteca)
 *   - Tipo (vertical de negócio — select de TipoCampanha)
 *   - Ordem sugerida (1..5, opcional)
 *   - Assunto do email
 *   - Corpo HTML (textarea grande com suporte a {{name}})
 *   - Descrição/Contexto (opcional)
 *
 * Validação de campos obrigatórios antes de habilitar "Salvar".
 */

import React, { useEffect, useState } from 'react';
import type { Copy, CopyInput, TipoCampanha } from '../../types/copy.types';

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

export interface CopyEditorModalProps {
  modo: 'criar' | 'editar' | null;
  copy: Copy | null;            // Quando modo='editar'
  tipos: TipoCampanha[];        // Lista de verticais ativas
  saving: boolean;
  onSalvar: (input: CopyInput) => void;
  onFechar: () => void;
}

// ════════════════════════════════════════════════════════════
// ESTADO INICIAL
// ════════════════════════════════════════════════════════════

const ESTADO_VAZIO: CopyInput = {
  nome: '',
  tipo_id: 0,
  ordem_sugerida: null,
  assunto: '',
  corpo_html: '',
  descricao: null,
};

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const CopyEditorModal: React.FC<CopyEditorModalProps> = ({
  modo,
  copy,
  tipos,
  saving,
  onSalvar,
  onFechar,
}) => {
  const [form, setForm] = useState<CopyInput>(ESTADO_VAZIO);

  // Carrega dados ao abrir
  useEffect(() => {
    if (modo === 'editar' && copy) {
      setForm({
        id: copy.id,
        nome: copy.nome,
        tipo_id: copy.tipo_id,
        ordem_sugerida: copy.ordem_sugerida,
        assunto: copy.assunto,
        corpo_html: copy.corpo_html,
        descricao: copy.descricao,
      });
    } else if (modo === 'criar') {
      setForm({
        ...ESTADO_VAZIO,
        tipo_id: tipos[0]?.id ?? 0,
      });
    }
  }, [modo, copy, tipos]);

  if (!modo) return null;

  const setField = <K extends keyof CopyInput>(key: K, value: CopyInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const podeSalvar =
    !!form.nome.trim() &&
    !!form.tipo_id &&
    !!form.assunto.trim() &&
    !!form.corpo_html.trim();

  const handleSalvar = () => {
    if (!podeSalvar) return;
    onSalvar({
      ...form,
      nome: form.nome.trim(),
      assunto: form.assunto.trim(),
      descricao: form.descricao?.trim() || null,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <i className="fa-solid fa-pen-to-square text-indigo-600"></i>
              {modo === 'criar' ? 'Nova Copy' : 'Editar Copy'}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Use <code className="bg-yellow-100 text-yellow-800 px-1 rounded">{'{{name}}'}</code> no assunto/corpo para inserir o primeiro nome do lead.
            </p>
          </div>
          <button
            onClick={onFechar}
            className="text-gray-400 hover:text-gray-600 text-2xl"
            aria-label="Fechar"
          >
            &times;
          </button>
        </div>

        {/* Body scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Linha 1: Nome */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nome interno da copy *
            </label>
            <input
              type="text"
              value={form.nome}
              onChange={(e) => setField('nome', e.target.value)}
              placeholder="Ex: Outsourcing - Abertura (Step 1)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              Identificação interna na biblioteca (não vai no email enviado).
            </p>
          </div>

          {/* Linha 2: Tipo + Ordem sugerida */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Vertical de Negócio *
              </label>
              <select
                value={form.tipo_id}
                onChange={(e) => setField('tipo_id', Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value={0}>Selecionar...</option>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ordem sugerida
              </label>
              <select
                value={form.ordem_sugerida ?? ''}
                onChange={(e) =>
                  setField('ordem_sugerida', e.target.value ? Number(e.target.value) : null)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">— sem ordem —</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    Step {n}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Assunto */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Assunto do email *
            </label>
            <input
              type="text"
              value={form.assunto}
              onChange={(e) => setField('assunto', e.target.value)}
              placeholder="Ex: {{name}}, sua equipe de TI está no limite?"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
            />
          </div>

          {/* Corpo HTML */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Corpo do email *
            </label>
            <textarea
              value={form.corpo_html}
              onChange={(e) => setField('corpo_html', e.target.value)}
              rows={14}
              placeholder={`Olá {{name}},

Deixa eu te fazer uma pergunta direta.

[escreva o corpo do email aqui]

A assinatura do remetente será adicionada automaticamente ao final.`}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-400 focus:outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              Pode usar HTML ou texto puro. A assinatura é adicionada pela campanha.
            </p>
          </div>

          {/* Descrição (opcional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descrição / Contexto (opcional)
            </label>
            <textarea
              value={form.descricao ?? ''}
              onChange={(e) => setField('descricao', e.target.value)}
              rows={2}
              placeholder="Ex: Email frio inicial, foco em dor de equipe sobrecarregada"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              Apenas para referência interna (não é visível ao destinatário).
            </p>
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
            onClick={handleSalvar}
            disabled={!podeSalvar || saving}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <i className="fa-solid fa-spinner fa-spin"></i>
            ) : (
              <i className="fa-solid fa-floppy-disk"></i>
            )}
            {saving ? 'Salvando...' : modo === 'criar' ? 'Criar Copy' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CopyEditorModal;
