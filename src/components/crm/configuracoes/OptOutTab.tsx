/**
 * OptOutTab.tsx — Aba "Opt-out" das Configurações CRM
 *
 * Caminho: src/components/crm/configuracoes/OptOutTab.tsx
 * Versão: 1.0 (01/06/2026)
 *
 * Lista a tabela email_optout com busca por e-mail. Admin/Gestão de R&S
 * podem adicionar manualmente e remover (descadastrar erros). Os demais
 * perfis nem chegam aqui (RBAC do menu lateral).
 *
 * Backend: api/crm-config.ts (listar_optout / adicionar_optout / remover_optout)
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useCrmApi } from '../shared/hooks/useCrmApi';
import type { CurrentUserLite } from '../types/crm.types';
import ConfirmDialog from '../shared/components/ConfirmDialog';
import EmptyState from '../shared/components/EmptyState';
import Toast, { ToastMensagem } from '../shared/components/Toast';

// ════════════════════════════════════════════════════════════
// TIPOS
// ════════════════════════════════════════════════════════════

const CONFIG_API_URL = '/api/crm-config';

interface OptOut {
  id: number;
  email: string;
  // Campos opcionais — podem não existir em todos os ambientes
  motivo?: string | null;
  criado_em?: string | null;
  criado_por?: string | null;
}

interface ListarResponse {
  success: boolean;
  optouts: OptOut[];
  error?: string;
}

interface OptOutTabProps {
  currentUser: CurrentUserLite;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const OptOutTab: React.FC<OptOutTabProps> = ({ currentUser }) => {
  const { get, post, del } = useCrmApi(CONFIG_API_URL);

  const atorEmail =
    (currentUser as CurrentUserLite & { email?: string; email_usuario?: string })?.email ??
    (currentUser as CurrentUserLite & { email?: string; email_usuario?: string })?.email_usuario ??
    '';

  const [optouts, setOptouts] = useState<OptOut[]>([]);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastMensagem | null>(null);

  // Modal de adicionar
  const [adicionarAberto, setAdicionarAberto] = useState(false);
  const [novoEmail, setNovoEmail] = useState('');
  const [novoMotivo, setNovoMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);

  // Confirmação de remoção
  const [alvoRemover, setAlvoRemover] = useState<OptOut | null>(null);
  const [removendo, setRemovendo] = useState(false);

  // ── Carregar ──────────────────────────────────────────────
  const carregar = useCallback(async () => {
    setLoading(true);
    const resp = await get<ListarResponse>('listar_optout', busca ? { busca } : undefined);
    if (resp.ok && resp.data?.success) {
      setOptouts(resp.data.optouts || []);
    } else {
      setToast({ tipo: 'error', texto: resp.error || 'Falha ao carregar opt-outs' });
    }
    setLoading(false);
  }, [get, busca]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // ── Adicionar ─────────────────────────────────────────────
  const adicionar = async () => {
    if (!atorEmail) {
      setToast({ tipo: 'error', texto: 'Usuário não identificado.' });
      return;
    }
    setSalvando(true);
    const resp = await post<{ success: boolean; error?: string }>('adicionar_optout', {
      email: novoEmail,
      motivo: novoMotivo,
      ator_email: atorEmail,
    });
    setSalvando(false);

    if (resp.ok && resp.data?.success) {
      setToast({ tipo: 'success', texto: 'Opt-out adicionado.' });
      setAdicionarAberto(false);
      setNovoEmail('');
      setNovoMotivo('');
      carregar();
    } else {
      setToast({ tipo: 'error', texto: resp.error || 'Falha ao adicionar opt-out' });
    }
  };

  // ── Remover ───────────────────────────────────────────────
  const remover = async () => {
    if (!alvoRemover) return;
    if (!atorEmail) {
      setToast({ tipo: 'error', texto: 'Usuário não identificado.' });
      return;
    }
    setRemovendo(true);
    const resp = await del<{ success: boolean; error?: string }>('remover_optout', {
      id: alvoRemover.id,
      ator_email: atorEmail,
    });
    setRemovendo(false);

    if (resp.ok && resp.data?.success) {
      setToast({ tipo: 'success', texto: 'Opt-out removido. Esse e-mail volta a ser elegível.' });
      setAlvoRemover(null);
      carregar();
    } else {
      setToast({ tipo: 'error', texto: resp.error || 'Falha ao remover opt-out' });
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
          <h3 className="text-base font-semibold text-gray-900">Lista de Opt-out</h3>
          <p className="text-xs text-gray-500">
            E-mails que não devem receber nenhum disparo. Adicione manualmente quando alguém pedir
            descadastro por outro canal; remova se foi um erro.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por e-mail…"
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-64"
          />
          <button
            onClick={() => setAdicionarAberto(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            <i className="fa-solid fa-plus"></i>
            Adicionar
          </button>
        </div>
      </div>

      {/* Conteúdo */}
      {loading && optouts.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <i className="fa-solid fa-spinner fa-spin text-2xl"></i>
          <p className="text-sm mt-2">Carregando…</p>
        </div>
      ) : optouts.length === 0 ? (
        <EmptyState
          icon="fa-solid fa-ban"
          titulo={busca ? 'Nenhum resultado' : 'Lista vazia'}
          descricao={
            busca
              ? `Nenhum opt-out contém "${busca}".`
              : 'Ainda não há e-mails em opt-out. Os bounces serão adicionados automaticamente quando o motor de disparo entrar.'
          }
          compacto
        />
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 font-medium">E-mail</th>
                <th className="px-4 py-3 font-medium">Motivo</th>
                <th className="px-4 py-3 font-medium">Adicionado em</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {optouts.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{o.email}</td>
                  <td className="px-4 py-3 text-gray-600">{o.motivo || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{formatarData(o.criado_em)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setAlvoRemover(o)}
                      className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                      title="Remover do opt-out"
                    >
                      <i className="fa-solid fa-trash"></i>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Adicionar */}
      {adicionarAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold text-gray-900">Adicionar opt-out</h3>
              <button
                onClick={() => setAdicionarAberto(false)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail *</label>
                <input
                  type="email"
                  value={novoEmail}
                  onChange={(e) => setNovoEmail(e.target.value)}
                  placeholder="alguem@empresa.com.br"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Motivo (opcional)
                </label>
                <input
                  type="text"
                  value={novoMotivo}
                  onChange={(e) => setNovoMotivo(e.target.value)}
                  placeholder="Ex.: pediu descadastro por WhatsApp"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
              <button
                onClick={() => setAdicionarAberto(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                onClick={adicionar}
                disabled={salvando || !novoEmail.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {salvando ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-plus"></i>}
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação de remoção */}
      <ConfirmDialog
        open={alvoRemover !== null}
        titulo="Remover do opt-out"
        mensagem={
          alvoRemover ? (
            <>
              Tem certeza que deseja remover <strong>{alvoRemover.email}</strong> da lista de
              opt-out?
              <br />
              <span className="text-xs text-gray-500">
                Após a remoção, este e-mail volta a ser elegível para campanhas. Use isso apenas se
                a entrada foi um erro.
              </span>
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Remover"
        cancelLabel="Cancelar"
        variante="danger"
        loading={removendo}
        onConfirm={remover}
        onCancel={() => setAlvoRemover(null)}
      />
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// HELPER
// ════════════════════════════════════════════════════════════

function formatarData(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export default OptOutTab;
