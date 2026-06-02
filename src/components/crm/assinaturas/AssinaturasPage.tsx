/**
 * AssinaturasPage.tsx — Aba "Assinaturas" do módulo CRM & Campanhas
 *
 * Caminho: src/components/crm/assinaturas/AssinaturasPage.tsx
 * Versão: 1.3 (Fase E-1/E-2 — 01/06/2026)
 *
 * Histórico:
 *  - v1.0 (01/06/2026 — Fase D): versão inicial da aba.
 *  - v1.1 (01/06/2026 — Fase D): correção de loop — depende de `get`/`del`
 *    (referências estáveis), não do objeto `api`.
 *  - v1.2 (01/06/2026 — Fase D): botão Excluir (Admin) com ConfirmDialog.
 *  - v1.3 (01/06/2026 — Fase E-1/E-2): adaptado ao novo retorno do backend
 *    (`listar_usuarios_assinatura` v1.7 → produto cartesiano pessoa×unidade).
 *    Cada linha agora representa uma combinação (pessoa, unidade do grupo),
 *    com assinatura cadastrada ou ainda em aberto. Tabela ganha coluna
 *    "Unidade", filtro por unidade no topo, e botão "Nova Assinatura"
 *    do header foi removido (criação sempre pelo "+ Criar" na linha
 *    específica, com pessoa e unidade travadas — mais claro do que
 *    abrir o modal genérico e fazer 2 seleções).
 *
 * Conceito:
 *  - Administrador: CRUD completo das assinaturas do time (criar/editar,
 *    excluir). A assinatura fica vinculada a uma PESSOA + UNIDADE.
 *  - Demais perfis (Gestão Comercial, SDR, ...): somente leitura — consultam
 *    e pré-visualizam, sem criar/editar.
 *  - A regra "assinatura travada no responsável + unidade da campanha"
 *    (Fase B + E-1) usa exatamente estas linhas.
 *
 * Backend (api/crm-campanhas.ts v1.7):
 *  - GET  listar_usuarios_assinatura → linhas {pessoa, unidade, assinatura|null}
 *  - GET  render_assinatura          → HTML fiel do rodapé (mesma render do envio)
 *  - POST salvar_assinatura          → cria/edita por (user_email, unidade) — RBAC Admin
 *  - DEL  excluir_assinatura         → por id da assinatura — RBAC Admin
 *
 * Reusa o AssinaturaModal v3.0 (../campanhas/AssinaturaModal).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useCrmApi } from '../shared/hooks/useCrmApi';
import { CAMPANHA_API_URL, UNIDADES_GRUPO } from '../types/crm.constants';
import type { Assinatura, CurrentUserLite } from '../types/crm.types';
import AssinaturaModal, { PessoaAssinatura } from '../campanhas/AssinaturaModal';
import ConfirmDialog from '../shared/components/ConfirmDialog';
import EmptyState from '../shared/components/EmptyState';
import Toast, { ToastMensagem } from '../shared/components/Toast';

// ════════════════════════════════════════════════════════════
// TIPOS
// ════════════════════════════════════════════════════════════

/**
 * Uma linha da tabela = um par (pessoa, unidade do grupo).
 * Backend retorna o produto cartesiano (todas as combinações), com
 * `assinatura: {...}` quando já cadastrada ou `null` quando em aberto.
 */
interface LinhaAssinatura {
  id: number;
  nome_usuario: string;
  email_usuario: string;
  tipo_usuario: string;
  unidade: string;
  assinatura: Assinatura | null;
}

interface ListarUsuariosResponse {
  success: boolean;
  usuarios: LinhaAssinatura[];
  error?: string;
}

interface RenderResponse {
  success: boolean;
  html: string;
  error?: string;
}

interface SalvarResponse {
  success: boolean;
  assinatura?: Assinatura;
  error?: string;
}

interface AssinaturasPageProps {
  currentUser: CurrentUserLite;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const AssinaturasPage: React.FC<AssinaturasPageProps> = ({ currentUser }) => {
  // get/post são referências ESTÁVEIS (useCallback dentro do useCrmApi).
  // Depender do objeto `api` inteiro recriaria o callback a cada render e
  // dispararia o useEffect em loop. Por isso destruturamos.
  const { get, post, del } = useCrmApi(CAMPANHA_API_URL);

  const isAdmin = currentUser?.tipo_usuario === 'Administrador';
  // E-mail do ator (necessário para o RBAC do backend). O User real carrega
  // `email`; alguns contextos usam `email_usuario` — leitura defensiva.
  const atorEmail =
    (currentUser as CurrentUserLite & { email?: string; email_usuario?: string })?.email ??
    (currentUser as CurrentUserLite & { email?: string; email_usuario?: string })?.email_usuario ??
    '';

  const [linhas, setLinhas] = useState<LinhaAssinatura[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastMensagem | null>(null);

  // 🆕 Fase E-2: filtro por unidade (default 'Todas')
  const [filtroUnidade, setFiltroUnidade] = useState<string>('');

  // Modal (criar/editar/consultar)
  const [modalAberto, setModalAberto] = useState(false);
  const [modalReadOnly, setModalReadOnly] = useState(false);
  const [pessoaBloqueada, setPessoaBloqueada] = useState(false);
  const [pessoasSeletor, setPessoasSeletor] = useState<PessoaAssinatura[] | undefined>(undefined);
  const [editValue, setEditValue] = useState<Partial<Assinatura>>({});
  const [saving, setSaving] = useState(false);

  // Preview (HTML renderizado)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  // Confirmação de exclusão (Fase D v1.2)
  const [alvoExcluir, setAlvoExcluir] = useState<LinhaAssinatura | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  // ── Carregar ──────────────────────────────────────────────
  const carregar = useCallback(async () => {
    setLoading(true);
    const resp = await get<ListarUsuariosResponse>('listar_usuarios_assinatura');
    if (resp.ok && resp.data?.success) {
      setLinhas(resp.data.usuarios || []);
    } else {
      setToast({ tipo: 'error', texto: resp.error || 'Falha ao carregar assinaturas' });
    }
    setLoading(false);
  }, [get]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // 🆕 Fase E-2: linhas após filtro de unidade
  const linhasFiltradas = useMemo(() => {
    if (!filtroUnidade) return linhas;
    return linhas.filter((l) => l.unidade === filtroUnidade);
  }, [linhas, filtroUnidade]);

  // ── Abrir: Criar para uma linha específica (Admin) ────────
  //         Pessoa e unidade vêm travadas pela linha clicada.
  const abrirCriarPara = (l: LinhaAssinatura) => {
    const pessoa: PessoaAssinatura = {
      id: l.id,
      nome_usuario: l.nome_usuario,
      email_usuario: l.email_usuario,
      tipo_usuario: l.tipo_usuario,
    };
    setEditValue({
      user_email: l.email_usuario,
      unidade: l.unidade,
      nome_completo: l.nome_usuario,
      email_assinatura: l.email_usuario,
      websites: [],
    });
    setPessoasSeletor([pessoa]);
    setPessoaBloqueada(true);
    setModalReadOnly(false);
    setModalAberto(true);
  };

  // ── Abrir: Editar (Admin) — pessoa e unidade travadas ─────
  const abrirEditar = (l: LinhaAssinatura) => {
    if (!l.assinatura) return;
    const pessoa: PessoaAssinatura = {
      id: l.id,
      nome_usuario: l.nome_usuario,
      email_usuario: l.email_usuario,
      tipo_usuario: l.tipo_usuario,
    };
    // Garante que `unidade` está no editValue (mesmo se o registro
    // antigo viesse sem o campo — defensivo, não deve acontecer pós-migração).
    setEditValue({ ...l.assinatura, unidade: l.assinatura.unidade || l.unidade });
    setPessoasSeletor([pessoa]);
    setPessoaBloqueada(true);
    setModalReadOnly(false);
    setModalAberto(true);
  };

  // ── Abrir: Consultar (qualquer perfil) — somente leitura ──
  const abrirConsulta = (l: LinhaAssinatura) => {
    if (!l.assinatura) return;
    const pessoa: PessoaAssinatura = {
      id: l.id,
      nome_usuario: l.nome_usuario,
      email_usuario: l.email_usuario,
      tipo_usuario: l.tipo_usuario,
    };
    setEditValue({ ...l.assinatura, unidade: l.assinatura.unidade || l.unidade });
    setPessoasSeletor([pessoa]);
    setPessoaBloqueada(true);
    setModalReadOnly(true);
    setModalAberto(true);
  };

  // ── Pré-visualizar (HTML renderizado) ─────────────────────
  const abrirPreview = async (l: LinhaAssinatura) => {
    if (!l.assinatura?.id) return;
    const resp = await get<RenderResponse>('render_assinatura', { id: l.assinatura.id });
    if (resp.ok && resp.data?.success) {
      setPreviewHtml(resp.data.html);
    } else {
      setToast({ tipo: 'error', texto: resp.error || 'Falha ao gerar pré-visualização' });
    }
  };

  // ── Salvar (Admin) ────────────────────────────────────────
  const salvar = async () => {
    if (!atorEmail) {
      setToast({ tipo: 'error', texto: 'Não foi possível identificar o usuário logado.' });
      return;
    }
    setSaving(true);
    const resp = await post<SalvarResponse>('salvar_assinatura', {
      ...editValue,
      ator_email: atorEmail,
    });
    setSaving(false);

    if (resp.ok && resp.data?.success) {
      setToast({ tipo: 'success', texto: 'Assinatura salva com sucesso.' });
      setModalAberto(false);
      carregar();
    } else {
      setToast({ tipo: 'error', texto: resp.error || 'Falha ao salvar assinatura' });
    }
  };

  // ── Excluir (Admin) — Fase D v1.2 ─────────────────────────
  const excluir = async () => {
    if (!alvoExcluir?.assinatura?.id) return;
    if (!atorEmail) {
      setToast({ tipo: 'error', texto: 'Não foi possível identificar o usuário logado.' });
      return;
    }
    setExcluindo(true);
    const resp = await del<{ success: boolean; error?: string }>('excluir_assinatura', {
      id: alvoExcluir.assinatura.id,
      ator_email: atorEmail,
    });
    setExcluindo(false);

    if (resp.ok && resp.data?.success) {
      setToast({ tipo: 'success', texto: 'Assinatura excluída.' });
      setAlvoExcluir(null);
      carregar();
    } else {
      setToast({ tipo: 'error', texto: resp.error || 'Falha ao excluir assinatura' });
    }
  };
  // ────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <Toast mensagem={toast} onDismiss={() => setToast(null)} />

      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Assinaturas</h2>
          <p className="text-xs text-gray-500">
            {isAdmin
              ? 'Crie e edite as assinaturas do time por pessoa e unidade. Cada campanha herda a assinatura do responsável NA UNIDADE da campanha.'
              : 'Consulte as assinaturas do time por pessoa e unidade. Apenas o Administrador pode criar ou editar.'}
          </p>
        </div>

        {/* 🆕 Fase E-2: filtro por unidade do grupo */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Unidade:</label>
          <select
            value={filtroUnidade}
            onChange={(e) => setFiltroUnidade(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Todas</option>
            {UNIDADES_GRUPO.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">
          <i className="fa-solid fa-spinner fa-spin text-2xl"></i>
          <p className="text-sm mt-2">Carregando assinaturas…</p>
        </div>
      ) : linhasFiltradas.length === 0 ? (
        <EmptyState
          icon="fa-solid fa-signature"
          titulo={filtroUnidade ? `Sem combinações para a unidade ${filtroUnidade}` : 'Nenhum usuário elegível'}
          descricao={
            filtroUnidade
              ? 'Limpe o filtro para ver outras unidades.'
              : 'Não há usuários (Administrador, Gestão Comercial ou SDR) ativos para vincular assinaturas.'
          }
        />
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 font-medium">Pessoa</th>
                <th className="px-4 py-3 font-medium">Unidade</th>
                <th className="px-4 py-3 font-medium">Assinatura</th>
                <th className="px-4 py-3 font-medium">E-mail</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {linhasFiltradas.map((l) => {
                const temAssinatura = !!l.assinatura;
                const ativa = l.assinatura?.ativo !== false; // default ativo
                // Chave composta — a mesma pessoa aparece N vezes (uma por unidade)
                const rowKey = `${l.id}::${l.unidade}`;
                return (
                  <tr key={rowKey} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{l.nome_usuario}</div>
                      <div className="text-xs text-gray-500">{l.tipo_usuario}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700 font-medium">
                        {l.unidade}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {temAssinatura ? (
                        <>
                          <div>{l.assinatura!.nome_completo}</div>
                          {l.assinatura!.cargo && (
                            <div className="text-xs text-gray-500">{l.assinatura!.cargo}</div>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-400 italic">Sem assinatura</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {temAssinatura ? l.assinatura!.email_assinatura : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {!temAssinatura ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500">
                          —
                        </span>
                      ) : ativa ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">
                          Ativa
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-700">
                          Inativa
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {temAssinatura && (
                          <button
                            onClick={() => abrirPreview(l)}
                            className="px-2 py-1 text-xs text-gray-600 hover:text-blue-600"
                            title="Pré-visualizar"
                          >
                            <i className="fa-solid fa-eye"></i>
                          </button>
                        )}
                        {temAssinatura && (
                          <button
                            onClick={() => abrirConsulta(l)}
                            className="px-2 py-1 text-xs text-gray-600 hover:text-blue-600"
                            title="Consultar dados"
                          >
                            <i className="fa-solid fa-list"></i>
                          </button>
                        )}
                        {isAdmin && temAssinatura && (
                          <button
                            onClick={() => abrirEditar(l)}
                            className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100"
                          >
                            <i className="fa-solid fa-pen mr-1"></i> Editar
                          </button>
                        )}
                        {isAdmin && temAssinatura && (
                          <button
                            onClick={() => setAlvoExcluir(l)}
                            className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                            title="Excluir assinatura"
                          >
                            <i className="fa-solid fa-trash"></i>
                          </button>
                        )}
                        {isAdmin && !temAssinatura && (
                          <button
                            onClick={() => abrirCriarPara(l)}
                            className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            <i className="fa-solid fa-plus mr-1"></i> Criar
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

      {/* Modal criar/editar/consultar */}
      <AssinaturaModal
        aberto={modalAberto}
        assinatura={editValue}
        saving={saving}
        onChange={setEditValue}
        onSalvar={salvar}
        onFechar={() => setModalAberto(false)}
        readOnly={modalReadOnly}
        pessoas={pessoasSeletor}
        pessoaBloqueada={pessoaBloqueada}
      />

      {/* Preview do rodapé renderizado */}
      {previewHtml !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPreviewHtml(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold text-gray-900">Pré-visualização</h3>
              <button
                onClick={() => setPreviewHtml(null)}
                className="text-gray-400 hover:text-gray-600 text-xl"
                aria-label="Fechar"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="px-6 py-6">
              <div
                className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
            <div className="flex justify-end px-6 py-4 border-t bg-gray-50">
              <button
                onClick={() => setPreviewHtml(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-100"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Confirmação de exclusão (Admin) */}
      <ConfirmDialog
        open={alvoExcluir !== null}
        titulo="Excluir assinatura"
        mensagem={
          alvoExcluir?.assinatura ? (
            <>
              Tem certeza que deseja excluir a assinatura de{' '}
              <strong>{alvoExcluir.assinatura.nome_completo}</strong> na unidade{' '}
              <strong>{alvoExcluir.unidade}</strong> ({alvoExcluir.email_usuario})?
              <br />
              <span className="text-xs text-gray-500">
                Campanhas em rascunho ou concluídas que usavam esta assinatura ficarão sem
                assinatura vinculada. Campanhas ativas, agendadas ou pausadas bloqueiam a exclusão.
              </span>
            </>
          ) : ''
        }
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        variante="danger"
        loading={excluindo}
        onConfirm={excluir}
        onCancel={() => setAlvoExcluir(null)}
      />
    </div>
  );
};

export default AssinaturasPage;
