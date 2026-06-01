/**
 * AssinaturasPage.tsx — Aba "Assinaturas" do módulo CRM & Campanhas
 *
 * Caminho: src/components/crm/assinaturas/AssinaturasPage.tsx
 * Versão: 1.0 (Fase D — 01/06/2026)
 *
 * Conceito:
 *  - Administrador: CRUD completo das assinaturas do time (criar/editar,
 *    ativar/inativar). A assinatura fica vinculada a uma PESSOA (user_email).
 *  - Demais perfis (Gestão Comercial, SDR, ...): somente leitura — consultam
 *    e pré-visualizam, sem criar/editar.
 *  - A regra "assinatura travada no responsável" (Fase B) usa exatamente estas
 *    assinaturas: cada campanha herda a assinatura da pessoa responsável.
 *
 * Backend (api/crm-campanhas.ts v1.4):
 *  - GET  listar_usuarios_assinatura → usuários elegíveis + assinatura vinculada
 *  - GET  render_assinatura          → HTML fiel do rodapé (mesma render do envio)
 *  - POST salvar_assinatura          → cria/edita (RBAC: só Administrador)
 *
 * Reusa o AssinaturaModal (v2.0) de ../campanhas/AssinaturaModal.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useCrmApi } from '../shared/hooks/useCrmApi';
import { CAMPANHA_API_URL } from '../types/crm.constants';
import type { Assinatura, CurrentUserLite } from '../types/crm.types';
import AssinaturaModal, { PessoaAssinatura } from '../campanhas/AssinaturaModal';
import EmptyState from '../shared/components/EmptyState';
import Toast, { ToastMensagem } from '../shared/components/Toast';

// ════════════════════════════════════════════════════════════
// TIPOS
// ════════════════════════════════════════════════════════════

interface UsuarioComAssinatura {
  id: number;
  nome_usuario: string;
  email_usuario: string;
  tipo_usuario: string;
  assinatura: Assinatura | null;
}

interface ListarUsuariosResponse {
  success: boolean;
  usuarios: UsuarioComAssinatura[];
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
  const api = useCrmApi(CAMPANHA_API_URL);

  const isAdmin = currentUser?.tipo_usuario === 'Administrador';
  // E-mail do ator (necessário para o RBAC do backend). O User real carrega
  // `email`; alguns contextos usam `email_usuario` — leitura defensiva.
  const atorEmail =
    (currentUser as CurrentUserLite & { email?: string; email_usuario?: string })?.email ??
    (currentUser as CurrentUserLite & { email?: string; email_usuario?: string })?.email_usuario ??
    '';

  const [usuarios, setUsuarios] = useState<UsuarioComAssinatura[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastMensagem | null>(null);

  // Modal (criar/editar/consultar)
  const [modalAberto, setModalAberto] = useState(false);
  const [modalReadOnly, setModalReadOnly] = useState(false);
  const [pessoaBloqueada, setPessoaBloqueada] = useState(false);
  const [pessoasSeletor, setPessoasSeletor] = useState<PessoaAssinatura[] | undefined>(undefined);
  const [editValue, setEditValue] = useState<Partial<Assinatura>>({});
  const [saving, setSaving] = useState(false);

  // Preview (HTML renderizado)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  // ── Carregar ──────────────────────────────────────────────
  const carregar = useCallback(async () => {
    setLoading(true);
    const resp = await api.get<ListarUsuariosResponse>('listar_usuarios_assinatura');
    if (resp.ok && resp.data?.success) {
      setUsuarios(resp.data.usuarios || []);
    } else {
      setToast({ tipo: 'error', texto: resp.error || 'Falha ao carregar assinaturas' });
    }
    setLoading(false);
  }, [api]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // ── Abrir: Nova (Admin) — escolhe a pessoa (só quem não tem assinatura) ─
  const abrirNova = () => {
    const semAssinatura: PessoaAssinatura[] = usuarios
      .filter((u) => !u.assinatura)
      .map((u) => ({
        id: u.id,
        nome_usuario: u.nome_usuario,
        email_usuario: u.email_usuario,
        tipo_usuario: u.tipo_usuario,
      }));

    if (semAssinatura.length === 0) {
      setToast({ tipo: 'info', texto: 'Todos os usuários elegíveis já possuem assinatura.' });
      return;
    }

    setEditValue({ websites: [] });
    setPessoasSeletor(semAssinatura);
    setPessoaBloqueada(false);
    setModalReadOnly(false);
    setModalAberto(true);
  };

  // ── Abrir: Criar para uma pessoa específica (Admin) ───────
  const abrirCriarPara = (u: UsuarioComAssinatura) => {
    setEditValue({
      user_email: u.email_usuario,
      nome_completo: u.nome_usuario,
      email_assinatura: u.email_usuario,
      websites: [],
    });
    setPessoasSeletor([
      { id: u.id, nome_usuario: u.nome_usuario, email_usuario: u.email_usuario, tipo_usuario: u.tipo_usuario },
    ]);
    setPessoaBloqueada(true);
    setModalReadOnly(false);
    setModalAberto(true);
  };

  // ── Abrir: Editar (Admin) — pessoa travada ────────────────
  const abrirEditar = (u: UsuarioComAssinatura) => {
    if (!u.assinatura) return;
    setEditValue({ ...u.assinatura });
    setPessoasSeletor([
      { id: u.id, nome_usuario: u.nome_usuario, email_usuario: u.email_usuario, tipo_usuario: u.tipo_usuario },
    ]);
    setPessoaBloqueada(true);
    setModalReadOnly(false);
    setModalAberto(true);
  };

  // ── Abrir: Consultar (qualquer perfil) — somente leitura ──
  const abrirConsulta = (u: UsuarioComAssinatura) => {
    if (!u.assinatura) return;
    setEditValue({ ...u.assinatura });
    setPessoasSeletor(undefined);
    setPessoaBloqueada(false);
    setModalReadOnly(true);
    setModalAberto(true);
  };

  // ── Pré-visualizar (HTML renderizado) ─────────────────────
  const abrirPreview = async (u: UsuarioComAssinatura) => {
    if (!u.assinatura?.id) return;
    const resp = await api.get<RenderResponse>('render_assinatura', { id: u.assinatura.id });
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
    const resp = await api.post<SalvarResponse>('salvar_assinatura', {
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

  // ────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <Toast mensagem={toast} onDismiss={() => setToast(null)} />

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Assinaturas</h2>
          <p className="text-xs text-gray-500">
            {isAdmin
              ? 'Crie e edite as assinaturas do time. Cada campanha herda a assinatura da pessoa responsável.'
              : 'Consulte as assinaturas do time. Apenas o Administrador pode criar ou editar.'}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={abrirNova}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            <i className="fa-solid fa-plus"></i>
            Nova Assinatura
          </button>
        )}
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">
          <i className="fa-solid fa-spinner fa-spin text-2xl"></i>
          <p className="text-sm mt-2">Carregando assinaturas…</p>
        </div>
      ) : usuarios.length === 0 ? (
        <EmptyState
          icon="fa-solid fa-signature"
          titulo="Nenhum usuário elegível"
          descricao="Não há usuários (Administrador, Gestão Comercial ou SDR) ativos para vincular assinaturas."
        />
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 font-medium">Pessoa</th>
                <th className="px-4 py-3 font-medium">Assinatura</th>
                <th className="px-4 py-3 font-medium">E-mail</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {usuarios.map((u) => {
                const temAssinatura = !!u.assinatura;
                const ativa = u.assinatura?.ativo !== false; // default ativo
                return (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{u.nome_usuario}</div>
                      <div className="text-xs text-gray-500">{u.tipo_usuario}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {temAssinatura ? (
                        <>
                          <div>{u.assinatura!.nome_completo}</div>
                          {u.assinatura!.cargo && (
                            <div className="text-xs text-gray-500">{u.assinatura!.cargo}</div>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-400 italic">Sem assinatura</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {temAssinatura ? u.assinatura!.email_assinatura : '—'}
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
                            onClick={() => abrirPreview(u)}
                            className="px-2 py-1 text-xs text-gray-600 hover:text-blue-600"
                            title="Pré-visualizar"
                          >
                            <i className="fa-solid fa-eye"></i>
                          </button>
                        )}
                        {temAssinatura && (
                          <button
                            onClick={() => abrirConsulta(u)}
                            className="px-2 py-1 text-xs text-gray-600 hover:text-blue-600"
                            title="Consultar dados"
                          >
                            <i className="fa-solid fa-list"></i>
                          </button>
                        )}
                        {isAdmin && temAssinatura && (
                          <button
                            onClick={() => abrirEditar(u)}
                            className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100"
                          >
                            <i className="fa-solid fa-pen mr-1"></i> Editar
                          </button>
                        )}
                        {isAdmin && !temAssinatura && (
                          <button
                            onClick={() => abrirCriarPara(u)}
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
    </div>
  );
};

export default AssinaturasPage;
