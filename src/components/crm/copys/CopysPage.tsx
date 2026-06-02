/**
 * CopysPage.tsx — Container da Biblioteca de Copys
 *
 * Caminho: src/components/crm/copys/CopysPage.tsx
 * Versão: 1.0 (Fase 4B — 30/05/2026)
 *
 * Responsabilidades:
 *  - Listar copys filtradas por vertical (TipoCampanha) e busca
 *  - KPI cards (total copys, total tipos, distribuição)
 *  - Abrir CopyEditorModal (criar/editar)
 *  - Abrir CopyPreviewModal (visualização)
 *  - Soft-delete com proteção (backend bloqueia se em uso em campanha)
 *
 * RBAC:
 *  - Todos veem a página
 *  - Botão "Nova Copy" só aparece para Admin + Gestão Comercial
 *  - Botões "Editar/Excluir" só aparecem para criador ou Admin
 */

import React, { useEffect, useState } from 'react';
import { useCopys } from '../shared/hooks/useCopys';
import { useTiposCampanha } from '../shared/hooks/useTiposCampanha';
import CopyEditorModal from './components/CopyEditorModal';
import CopyPreviewModal from './components/CopyPreviewModal';
import KpiCard from '../shared/components/KpiCard';
import EmptyState from '../shared/components/EmptyState';
import Toast, { ToastMensagem } from '../shared/components/Toast';
import { formatDate } from '../types/crm.constants';
import {
  podeCriarCopy,
  podeEditarCopy,
  type Copy,
  type CopyInput,
} from '../types/copy.types';
import type { CurrentUserLite } from '../types/crm.types';

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

export interface CopysPageProps {
  currentUser: CurrentUserLite;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const CopysPage: React.FC<CopysPageProps> = ({ currentUser }) => {
  // Hooks
  const copysH = useCopys();
  const tiposH = useTiposCampanha();

  // Modais
  const [editorAberto, setEditorAberto] = useState<'criar' | 'editar' | null>(null);
  const [copyEditando, setCopyEditando] = useState<Copy | null>(null);
  const [copyPreview, setCopyPreview] = useState<Copy | null>(null);

  // Toast
  const [mensagem, setMensagem] = useState<ToastMensagem | null>(null);

  // Saving (compartilhado entre criar/editar)
  const [saving, setSaving] = useState(false);

  // ── RBAC flags ──
  const podeCriar = podeCriarCopy(currentUser?.tipo_usuario);

  // ════════════════════════════════════════════════════════════
  // EFEITOS
  // ════════════════════════════════════════════════════════════

  // Carga inicial
  useEffect(() => {
    tiposH.carregar();
    copysH.carregarStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh ao mudar filtros
  useEffect(() => {
    copysH.carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copysH.filtroTipoId, copysH.busca, copysH.incluirInativos]);

  // ════════════════════════════════════════════════════════════
  // HANDLERS
  // ════════════════════════════════════════════════════════════

  const handleNovaCopy = () => {
    setCopyEditando(null);
    setEditorAberto('criar');
  };

  const handleEditarCopy = async (c: Copy) => {
    // Carrega o corpo completo (listar_copys não retorna corpo_html)
    const detalhe = await copysH.carregarDetalhe(c.id);
    if (detalhe) {
      setCopyEditando(detalhe);
      setEditorAberto('editar');
    }
  };

  const handlePreview = async (c: Copy) => {
    // Carrega corpo completo para preview
    const detalhe = await copysH.carregarDetalhe(c.id);
    if (detalhe) {
      setCopyPreview(detalhe);
    }
  };

  const handleSalvar = async (input: CopyInput) => {
    setSaving(true);
    try {
      const ok = await copysH.salvar(input, {
        nome: currentUser.nome_usuario,
        id: currentUser.id,
        tipo: currentUser.tipo_usuario,
      });
      if (ok) {
        setEditorAberto(null);
        setCopyEditando(null);
        copysH.carregar();
        copysH.carregarStats();
        setMensagem({
          tipo: 'success',
          texto: input.id ? 'Copy atualizada!' : 'Copy criada com sucesso!',
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleExcluir = async (c: Copy) => {
    if (
      !confirm(
        `Excluir a copy "${c.nome}"?\n\nA copy ficará oculta (soft-delete). Não pode ser excluída se estiver em uso em campanha ativa/agendada/pausada.`
      )
    ) {
      return;
    }
    const { ok, campanhas } = await copysH.excluir(c.id, {
      id: currentUser.id,
      tipo: currentUser.tipo_usuario,
    });
    if (ok) {
      setMensagem({ tipo: 'success', texto: 'Copy desativada' });
      copysH.carregar();
      copysH.carregarStats();
    } else if (campanhas && campanhas.length > 0) {
      setMensagem({
        tipo: 'error',
        texto: `Copy em uso em: ${campanhas.join(', ')}`,
      });
    }
  };

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════

  return (
    <>
      <Toast mensagem={mensagem} onDismiss={() => setMensagem(null)} />

      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <i className="fa-solid fa-pen-fancy text-indigo-600"></i>
              Biblioteca de Copys
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Repositório central de copys reutilizáveis por vertical de negócio
            </p>
          </div>
          {podeCriar && (
            <button
              onClick={handleNovaCopy}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-1.5"
            >
              <i className="fa-solid fa-plus"></i> Nova Copy
            </button>
          )}
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <KpiCard
            label="Copys"
            valor={copysH.stats.total_copys}
            icon="fa-solid fa-pen-fancy"
            cor="purple"
          />
          <KpiCard
            label="Verticais"
            valor={copysH.stats.total_tipos}
            icon="fa-solid fa-layer-group"
            cor="blue"
          />
          <KpiCard
            label="Vertical mais usada"
            valor={
              Object.entries(copysH.stats.distribuicao_por_tipo).sort(
                (a, b) => b[1] - a[1]
              )[0]?.[0] || '—'
            }
            icon="fa-solid fa-trophy"
            cor="amber"
          />
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Buscar</label>
              <input
                value={copysH.busca}
                onChange={(e) => copysH.setBusca(e.target.value)}
                placeholder="Nome da copy ou assunto..."
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Vertical</label>
              <select
                value={copysH.filtroTipoId ?? ''}
                onChange={(e) =>
                  copysH.setFiltroTipoId(e.target.value ? Number(e.target.value) : null)
                }
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="">Todas as verticais</option>
                {tiposH.tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={copysH.incluirInativos}
                  onChange={(e) => copysH.setIncluirInativos(e.target.checked)}
                  className="rounded"
                />
                Mostrar inativas
              </label>
            </div>
          </div>
        </div>

        {/* Lista de copys */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          {copysH.loading ? (
            <div className="text-center py-12 text-gray-400">
              <i className="fa-solid fa-spinner fa-spin text-2xl mb-2 block"></i>
              Carregando copys...
            </div>
          ) : copysH.copys.length === 0 ? (
            <EmptyState
              icon="fa-solid fa-pen-fancy"
              titulo="Nenhuma copy encontrada"
              descricao={
                podeCriar
                  ? 'Crie sua primeira copy clicando em "Nova Copy"'
                  : 'Aguarde a equipe comercial criar copys nesta vertical'
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 text-xs uppercase">
                    <th className="px-3 py-2.5 text-left font-semibold">Nome / Assunto</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Vertical</th>
                    <th className="px-3 py-2.5 text-center font-semibold hidden md:table-cell">
                      Ordem
                    </th>
                    <th className="px-3 py-2.5 text-left font-semibold hidden lg:table-cell">
                      Criada por
                    </th>
                    <th className="px-3 py-2.5 text-left font-semibold hidden lg:table-cell">
                      Atualizada
                    </th>
                    <th className="px-3 py-2.5 text-center font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {copysH.copys.map((c) => {
                    const podeEditar = podeEditarCopy(
                      currentUser.tipo_usuario,
                      currentUser.id,
                      c.criado_por_id
                    );
                    return (
                      <tr
                        key={c.id}
                        className={`hover:bg-gray-50 transition-colors ${
                          !c.ativo ? 'opacity-60' : ''
                        }`}
                      >
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-gray-800">
                            {c.nome}
                            {!c.ativo && (
                              <span className="ml-2 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                                Inativa
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 truncate max-w-xl">
                            {c.assunto}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-xs">
                            {c.email_tipos_campanha?.nome || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center hidden md:table-cell">
                          {c.ordem_sugerida ? (
                            <span className="inline-block w-6 h-6 rounded-full bg-gray-100 text-gray-700 text-xs font-medium leading-6">
                              {c.ordem_sugerida}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-gray-500 hidden lg:table-cell text-xs">
                          {c.criado_por}
                        </td>
                        <td className="px-3 py-2.5 text-gray-500 hidden lg:table-cell text-xs">
                          {formatDate(c.atualizado_em)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handlePreview(c)}
                              className="text-gray-400 hover:text-indigo-600 p-1.5 transition-colors"
                              title="Visualizar"
                            >
                              <i className="fa-solid fa-eye"></i>
                            </button>
                            {podeEditar && (
                              <>
                                <button
                                  onClick={() => handleEditarCopy(c)}
                                  className="text-gray-400 hover:text-blue-600 p-1.5 transition-colors"
                                  title="Editar"
                                >
                                  <i className="fa-solid fa-pen-to-square"></i>
                                </button>
                                {c.ativo && (
                                  <button
                                    onClick={() => handleExcluir(c)}
                                    className="text-gray-400 hover:text-red-600 p-1.5 transition-colors"
                                    title="Desativar (soft-delete)"
                                  >
                                    <i className="fa-solid fa-trash"></i>
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* MODAIS */}
      <CopyEditorModal
        modo={editorAberto}
        copy={copyEditando}
        tipos={tiposH.tipos}
        saving={saving}
        onSalvar={handleSalvar}
        onFechar={() => {
          setEditorAberto(null);
          setCopyEditando(null);
        }}
      />

      <CopyPreviewModal
        copy={copyPreview}
        onFechar={() => setCopyPreview(null)}
      />
    </>
  );
};

export default CopysPage;
