/**
 * TiposCampanhaTab.tsx — Aba "Tipos de Campanha" das Configurações CRM
 *
 * Caminho: src/components/crm/configuracoes/TiposCampanhaTab.tsx
 * Versão: 1.0 (01/06/2026)
 *
 * CRUD das verticais (ex.: Outsourcing, BPO, Service Center, etc.).
 * Reusa o hook useTiposCampanha que já existia (Fase 4B). RBAC vem
 * pronto do backend api/crm-copys.ts (criar_tipo, atualizar_tipo,
 * excluir_tipo): apenas Administrador pode criar/editar/excluir.
 * Gestão de R&S consulta.
 *
 * NOTA: Apesar de estar dentro de "Configurações CRM" (acessada por
 * Admin + Gestão de R&S — RBAC do Sidebar), o CRUD interno permite
 * APENAS Admin escrever — Gestão de R&S vê em modo leitura.
 */

import React, { useEffect, useState } from 'react';
import { useTiposCampanha } from '../shared/hooks/useTiposCampanha';
import type { CurrentUserLite } from '../types/crm.types';
import type { TipoCampanha } from '../types/copy.types';
import ConfirmDialog from '../shared/components/ConfirmDialog';
import EmptyState from '../shared/components/EmptyState';
import Toast, { ToastMensagem } from '../shared/components/Toast';

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

interface TiposCampanhaTabProps {
  currentUser: CurrentUserLite;
}

interface FormState {
  id?: number;
  nome: string;
  descricao: string;
  ativo: boolean;
}

const FORM_VAZIO: FormState = { nome: '', descricao: '', ativo: true };

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const TiposCampanhaTab: React.FC<TiposCampanhaTabProps> = ({ currentUser }) => {
  const { tipos, loading, carregar, criar, atualizar, excluir } = useTiposCampanha();

  const podeEditar = currentUser?.tipo_usuario === 'Administrador';
  const tipoUsuario = currentUser?.tipo_usuario || '';
  const atorEmail =
    (currentUser as CurrentUserLite & { email?: string; email_usuario?: string })?.email ??
    (currentUser as CurrentUserLite & { email?: string; email_usuario?: string })?.email_usuario ??
    '';

  const [toast, setToast] = useState<ToastMensagem | null>(null);

  // Modal (criar/editar)
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);

  // Confirmação de exclusão
  const [alvoExcluir, setAlvoExcluir] = useState<TipoCampanha | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  // Carregar na montagem
  useEffect(() => {
    carregar();
  }, [carregar]);

  // ── Ações ─────────────────────────────────────────────────
  const abrirNovo = () => {
    setForm(FORM_VAZIO);
    setModalAberto(true);
  };

  const abrirEditar = (t: TipoCampanha) => {
    setForm({
      id: t.id,
      nome: t.nome,
      descricao: t.descricao || '',
      ativo: t.ativo !== false,
    });
    setModalAberto(true);
  };

  const salvar = async () => {
    if (!form.nome.trim()) {
      setToast({ tipo: 'error', texto: 'Nome é obrigatório.' });
      return;
    }
    setSalvando(true);
    let ok = false;
    if (form.id) {
      ok = await atualizar(
        form.id,
        { nome: form.nome, descricao: form.descricao, ativo: form.ativo },
        tipoUsuario
      );
    } else {
      ok = await criar(form.nome, form.descricao, atorEmail, tipoUsuario);
    }
    setSalvando(false);
    if (ok) {
      setToast({ tipo: 'success', texto: form.id ? 'Tipo atualizado.' : 'Tipo criado.' });
      setModalAberto(false);
    }
    // erros já são reportados pelo hook (alert)
  };

  const confirmarExcluir = async () => {
    if (!alvoExcluir) return;
    setExcluindo(true);
    const ok = await excluir(alvoExcluir.id, tipoUsuario);
    setExcluindo(false);
    if (ok) {
      setToast({ tipo: 'success', texto: 'Tipo desativado.' });
      setAlvoExcluir(null);
    }
  };

  // ────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <Toast mensagem={toast} onDismiss={() => setToast(null)} />

      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Tipos de Campanha (verticais)</h3>
          <p className="text-xs text-gray-500">
            {podeEditar
              ? 'Crie, edite ou desative as verticais. Cada lead e cada campanha pertencem a uma vertical.'
              : 'Consulte as verticais ativas. Apenas o Administrador pode criar ou editar.'}
          </p>
        </div>
        {podeEditar && (
          <button
            onClick={abrirNovo}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            <i className="fa-solid fa-plus"></i>
            Nova vertical
          </button>
        )}
      </div>

      {/* Conteúdo */}
      {loading && tipos.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <i className="fa-solid fa-spinner fa-spin text-2xl"></i>
          <p className="text-sm mt-2">Carregando…</p>
        </div>
      ) : tipos.length === 0 ? (
        <EmptyState
          icon="fa-solid fa-tag"
          titulo="Nenhuma vertical cadastrada"
          descricao="Crie a primeira vertical para começar a classificar leads e campanhas."
          compacto
        />
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Descrição</th>
                <th className="px-4 py-3 font-medium text-right">Copys</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tipos.map((t: any) => {
                const ativo = t.ativo !== false;
                return (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{t.nome}</td>
                    <td className="px-4 py-3 text-gray-600">{t.descricao || '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {typeof t.total_copys === 'number' ? t.total_copys : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {ativo ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">
                          Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500">
                          Inativo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {podeEditar && (
                          <button
                            onClick={() => abrirEditar(t)}
                            className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100"
                          >
                            <i className="fa-solid fa-pen mr-1"></i> Editar
                          </button>
                        )}
                        {podeEditar && ativo && (
                          <button
                            onClick={() => setAlvoExcluir(t)}
                            className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                            title="Desativar"
                          >
                            <i className="fa-solid fa-trash"></i>
                          </button>
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

      {/* Modal: criar/editar */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold text-gray-900">
                {form.id ? 'Editar vertical' : 'Nova vertical'}
              </h3>
              <button
                onClick={() => setModalAberto(false)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input
                  type="text"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Ex.: Service Center"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descrição
                </label>
                <textarea
                  value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  rows={3}
                  placeholder="Para que serve esta vertical (opcional)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              {form.id && (
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.ativo}
                    onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                  />
                  Ativo (deixar disponível para classificar leads e campanhas)
                </label>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
              <button
                onClick={() => setModalAberto(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={salvando || !form.nome.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {salvando ? (
                  <i className="fa-solid fa-spinner fa-spin"></i>
                ) : (
                  <i className="fa-solid fa-floppy-disk"></i>
                )}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação de exclusão (soft via backend) */}
      <ConfirmDialog
        open={alvoExcluir !== null}
        titulo="Desativar vertical"
        mensagem={
          alvoExcluir ? (
            <>
              Tem certeza que deseja desativar <strong>{alvoExcluir.nome}</strong>?
              <br />
              <span className="text-xs text-gray-500">
                Campanhas e leads que já usam esta vertical continuam funcionando. Ela apenas deixa
                de aparecer como opção em novos cadastros até ser reativada.
              </span>
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Desativar"
        cancelLabel="Cancelar"
        variante="warning"
        loading={excluindo}
        onConfirm={confirmarExcluir}
        onCancel={() => setAlvoExcluir(null)}
      />
    </div>
  );
};

export default TiposCampanhaTab;
