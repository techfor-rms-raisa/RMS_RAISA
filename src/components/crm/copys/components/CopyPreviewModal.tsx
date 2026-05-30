/**
 * CopyPreviewModal.tsx — Modal lateral de preview de copy
 *
 * Caminho: src/components/crm/copys/components/CopyPreviewModal.tsx
 * Versão: 1.0 (Fase 4B — 30/05/2026)
 *
 * Mostra o HTML renderizado de uma copy. Usado no CopysPage e
 * será reutilizado no StepCopys (Fase 4C — botão "👁 Preview" do seletor).
 *
 * Comportamento: drawer lateral (right-side), fecha clicando fora ou ESC.
 */

import React, { useEffect } from 'react';
import type { Copy } from '../../types/copy.types';

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

export interface CopyPreviewModalProps {
  copy: Copy | null;
  onFechar: () => void;
  /**
   * Quando definido, exibe um botão "Selecionar esta copy" no rodapé.
   * Será usado pelo StepCopys (Fase 4C).
   */
  onSelecionar?: (copy: Copy) => void;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const CopyPreviewModal: React.FC<CopyPreviewModalProps> = ({
  copy,
  onFechar,
  onSelecionar,
}) => {
  // Fecha com tecla ESC
  useEffect(() => {
    if (!copy) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [copy, onFechar]);

  if (!copy) return null;

  // Render do corpo: tenta HTML primeiro; se não tiver tags, usa whitespace-pre-wrap
  const corpo = copy.corpo_html || '';
  const ehHtml = /<\/?[a-z][\s\S]*>/i.test(corpo);
  // Aplica substituição de {{name}} por placeholder visual
  const corpoComPlaceholder = corpo.replace(
    /\{\{name\}\}/gi,
    '<span class="bg-yellow-100 text-yellow-800 px-1 rounded">[Primeiro Nome]</span>'
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-end">
      {/* Drawer lateral */}
      <div className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b bg-indigo-50 sticky top-0 z-10">
          <div className="flex-1">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <i className="fa-solid fa-eye text-indigo-600"></i>
              Preview da Copy
            </h2>
            <p className="text-sm text-gray-600 mt-0.5">{copy.nome}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {copy.email_tipos_campanha?.nome && (
                <span className="inline-block px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
                  {copy.email_tipos_campanha.nome}
                </span>
              )}
              {copy.ordem_sugerida && (
                <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                  Step sugerido: {copy.ordem_sugerida}
                </span>
              )}
              {!copy.ativo && (
                <span className="inline-block px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">
                  Inativa
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onFechar}
            className="text-gray-400 hover:text-gray-600 text-2xl ml-3"
            aria-label="Fechar"
          >
            &times;
          </button>
        </div>

        {/* Email mockup */}
        <div className="p-6 flex-1">
          {/* Cabeçalho do email */}
          <div className="bg-gray-50 border border-gray-200 rounded-t-lg px-4 py-3 space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500 w-16">De:</span>
              <span className="text-gray-700">
                <em>(definido na campanha)</em>
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500 w-16">Para:</span>
              <span className="text-gray-700">
                <em>(definido pelos leads vinculados)</em>
              </span>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <span className="text-gray-500 w-16 flex-shrink-0">Assunto:</span>
              <span className="font-semibold text-gray-900">{copy.assunto}</span>
            </div>
          </div>

          {/* Corpo */}
          <div className="border border-t-0 border-gray-200 rounded-b-lg p-6 bg-white">
            {ehHtml ? (
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: corpoComPlaceholder }}
              />
            ) : (
              <div
                className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: corpoComPlaceholder }}
              />
            )}
          </div>

          {/* Variáveis usadas */}
          {copy.variaveis && copy.variaveis.length > 0 && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs font-semibold text-blue-800 mb-1">
                <i className="fa-solid fa-circle-info"></i> Variáveis suportadas
              </p>
              <div className="flex flex-wrap gap-1.5">
                {copy.variaveis.map((v) => (
                  <code
                    key={v}
                    className="bg-white px-2 py-0.5 rounded text-xs text-blue-700 border border-blue-200"
                  >
                    {v}
                  </code>
                ))}
              </div>
              <p className="text-xs text-blue-700 mt-2">
                A assinatura do remetente é adicionada automaticamente ao final.
              </p>
            </div>
          )}

          {/* Descrição */}
          {copy.descricao && (
            <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-xs font-semibold text-gray-700 mb-1">Descrição / Contexto</p>
              <p className="text-sm text-gray-600">{copy.descricao}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between sticky bottom-0">
          <div className="text-xs text-gray-500">
            Criada por <span className="font-medium">{copy.criado_por}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onFechar}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Fechar
            </button>
            {onSelecionar && (
              <button
                onClick={() => onSelecionar(copy)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-2"
              >
                <i className="fa-solid fa-check"></i>
                Selecionar esta copy
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CopyPreviewModal;
