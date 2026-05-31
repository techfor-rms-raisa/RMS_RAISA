/**
 * CopySelector.tsx — Drawer de seleção de Copy da Biblioteca (Fase 4C)
 *
 * Caminho: src/components/crm/campanhas/wizard-steps/CopySelector.tsx
 * Versão: 1.0 (Fase 4C — 31/05/2026)
 *
 * Substitui o antigo editor inline do StepCopys. Abre como drawer lateral,
 * lista as copys da biblioteca PRÉ-FILTRADAS pela vertical da campanha
 * (com opção de ver todas) e permite busca por nome. Ao clicar num card,
 * carrega o corpo completo e abre o CopyPreviewModal — onde o usuário
 * confirma a seleção (botão "Selecionar esta copy").
 *
 * Decisões travadas (31/05/2026):
 *  - Conteúdo read-only (snapshot fiel à copy).
 *  - Sem modo manual (toda criação de step passa por aqui).
 *  - Pré-filtra na vertical da campanha, mas permite "Todas".
 *
 * Reutiliza CopyPreviewModal (Fase 4B), que já renderiza {{name}} em destaque
 * e expõe a prop onSelecionar para esta finalidade.
 */

import React, { useEffect, useState } from 'react';
import { useCopys } from '../../shared/hooks/useCopys';
import CopyPreviewModal from '../../copys/components/CopyPreviewModal';
import type { Copy, TipoCampanha } from '../../types/copy.types';

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

export interface CopySelectorProps {
  aberto: boolean;
  /** Lista de verticais ativas (email_tipos_campanha) — para o filtro. */
  tipos: TipoCampanha[];
  /** Vertical da campanha (id), usada como filtro inicial. null = "Todas". */
  tipoIdInicial: number | null;
  /** Chamado quando o usuário confirma a seleção de uma copy (corpo completo). */
  onSelecionar: (copy: Copy) => void;
  onFechar: () => void;
}

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

/** Remove tags e corta o corpo para um trecho de pré-visualização. */
function trechoCorpo(html: string, max = 120): string {
  const semTags = (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return semTags.length > max ? `${semTags.slice(0, max)}…` : semTags;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const CopySelector: React.FC<CopySelectorProps> = ({
  aberto,
  tipos,
  tipoIdInicial,
  onSelecionar,
  onFechar,
}) => {
  const copysH = useCopys();
  const [previewCopy, setPreviewCopy] = useState<Copy | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  // Ao abrir: aplica o filtro inicial (vertical da campanha)
  useEffect(() => {
    if (aberto) {
      copysH.setFiltroTipoId(tipoIdInicial);
      copysH.setBusca('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, tipoIdInicial]);

  // Recarrega a lista quando filtros mudam (somente com o drawer aberto)
  useEffect(() => {
    if (aberto) {
      copysH.carregar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, copysH.filtroTipoId, copysH.busca]);

  // Fecha com ESC (apenas quando não há preview aberto por cima)
  useEffect(() => {
    if (!aberto) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !previewCopy) onFechar();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [aberto, previewCopy, onFechar]);

  if (!aberto) return null;

  // ── Clique no card: carrega corpo completo e abre preview ──
  const handleAbrirPreview = async (c: Copy) => {
    setCarregandoDetalhe(true);
    try {
      const detalhe = await copysH.carregarDetalhe(c.id);
      if (detalhe) setPreviewCopy(detalhe);
    } finally {
      setCarregandoDetalhe(false);
    }
  };

  // ── Confirmação de seleção (vinda do CopyPreviewModal) ──
  const handleConfirmar = (c: Copy) => {
    setPreviewCopy(null);
    onSelecionar(c);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50 flex justify-end">
        {/* Drawer lateral */}
        <div className="bg-white w-full max-w-xl h-full overflow-y-auto shadow-2xl flex flex-col">
          {/* Header */}
          <div className="flex items-start justify-between px-6 py-4 border-b bg-indigo-50 sticky top-0 z-10">
            <div>
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <i className="fa-solid fa-book-open text-indigo-600"></i>
                Selecionar copy da biblioteca
              </h2>
              <p className="text-sm text-gray-600 mt-0.5">
                Escolha uma copy para criar este step. O conteúdo é copiado como
                snapshot — alterações futuras na biblioteca não afetam a campanha.
              </p>
            </div>
            <button
              onClick={onFechar}
              className="text-gray-400 hover:text-gray-600 p-1"
              aria-label="Fechar"
            >
              <i className="fa-solid fa-xmark text-xl"></i>
            </button>
          </div>

          {/* Filtros */}
          <div className="px-6 py-3 border-b bg-white sticky top-[73px] z-10 space-y-3">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                <input
                  type="text"
                  value={copysH.busca}
                  onChange={(e) => copysH.setBusca(e.target.value)}
                  placeholder="Buscar por nome da copy…"
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <select
                value={copysH.filtroTipoId ?? ''}
                onChange={(e) =>
                  copysH.setFiltroTipoId(e.target.value ? Number(e.target.value) : null)
                }
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="">Todas as verticais</option>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </div>
            {tipoIdInicial !== null && copysH.filtroTipoId === tipoIdInicial && (
              <p className="text-xs text-indigo-600">
                <i className="fa-solid fa-filter"></i> Filtrando pela vertical da
                campanha. Selecione "Todas as verticais" para ver tudo.
              </p>
            )}
          </div>

          {/* Lista de copys */}
          <div className="flex-1 px-6 py-4">
            {copysH.loading ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <i className="fa-solid fa-spinner fa-spin text-2xl"></i>
              </div>
            ) : copysH.copys.length === 0 ? (
              <div className="text-center py-12">
                <i className="fa-solid fa-inbox text-4xl text-gray-300 mb-3"></i>
                <p className="text-sm text-gray-500">
                  Nenhuma copy encontrada com os filtros atuais.
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Crie copys em <span className="font-medium">CRM → Biblioteca de Copys</span>.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {copysH.copys.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleAbrirPreview(c)}
                    disabled={carregandoDetalhe}
                    className="w-full text-left border border-gray-200 rounded-lg p-3 hover:border-indigo-400 hover:bg-indigo-50/40 transition-colors disabled:opacity-60"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">
                          {c.nome}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {c.assunto || '(sem assunto)'}
                        </p>
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                          {trechoCorpo(c.corpo_html)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {c.email_tipos_campanha?.nome && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 whitespace-nowrap">
                            {c.email_tipos_campanha.nome}
                          </span>
                        )}
                        {c.ordem_sugerida != null && (
                          <span className="text-[11px] text-gray-400">
                            Sugerido: step {c.ordem_sugerida}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Preview por cima do drawer — confirma a seleção */}
      <CopyPreviewModal
        copy={previewCopy}
        onFechar={() => setPreviewCopy(null)}
        onSelecionar={handleConfirmar}
      />
    </>
  );
};

export default CopySelector;
