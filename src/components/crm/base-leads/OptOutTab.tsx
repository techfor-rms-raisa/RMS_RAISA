/**
 * OptOutTab.tsx — Aba "Opt-Out" da Base de Leads
 *
 * Caminho: src/components/crm/base-leads/OptOutTab.tsx
 * Versão: 1.0 (13/06/2026)
 *
 * 🆕 v1.0 (13/06/2026 — Fase 1 da reorganização Prospect/Lead):
 *   Aba "Opt-Out" movida das Configurações CRM para a Base de Leads,
 *   formando o quadro completo do funil (Empresas → Leads → Vincular
 *   em Lote → Respostas → Inválidos → Opt-Out).
 *
 *   Diferenças vs OptOutTab antigo (src/components/crm/configuracoes/):
 *
 *   1. RBAC CONTEXTUAL (não mais restrito a Admin/GR&S na UI):
 *      • Administrador / Gestão de R&S:
 *          - Vê TODOS os opt-outs do sistema.
 *          - Pode adicionar qualquer e-mail manualmente.
 *          - Pode remover qualquer entrada (descadastrar erros).
 *      • Gestão Comercial / SDR:
 *          - Vê APENAS opt-outs cujos leads pertencem a si
 *            (filtro feito no backend via JOIN com email_leads
 *            ON reservado_por = ator.id — ver crm-config v1.1).
 *          - Pode adicionar e-mails dos próprios leads
 *            (backend valida ownership antes do INSERT).
 *          - NÃO pode remover entradas (LGPD: opt-out é irreversível
 *            no fluxo normal; apenas Admin/GR&S corrige erros).
 *
 *   2. UX DIFERENTE:
 *      • Header focado no contexto da Base de Leads
 *        (descadastros LGPD + bounces automáticos).
 *      • Banner explicativo de RBAC para GC/SDR
 *        ("Você está vendo apenas opt-outs dos seus leads").
 *      • Botão "Remover" só renderiza para Admin/GR&S
 *        (defesa em camadas; backend também bloqueia).
 *
 *   3. PARÂMETRO ator_email enviado em TODAS as chamadas
 *      (não só nas mutações). O backend precisa do ator
 *      para aplicar o filtro de listagem.
 *
 * Backend: api/crm-config.ts v1.1 (listar_optout / adicionar_optout /
 *  remover_optout — todas com RBAC contextual).
 *
 * Mantém o arquivo antigo src/components/crm/configuracoes/OptOutTab.tsx
 * no repositório (sem import), preservando histórico Git.
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

const PERFIS_GERENCIAM_TODOS = ['Administrador', 'Gestão de R&S'];

interface OptOut {
  id: number;
  email: string;
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

  // Resolve o email do ator de forma tolerante (alguns CurrentUserLite
  // expõem `email`, outros `email_usuario`).
  const atorEmail =
    (currentUser as CurrentUserLite & { email?: string; email_usuario?: string })?.email ??
    (currentUser as CurrentUserLite & { email?: string; email_usuario?: string })?.email_usuario ??
    '';

  const isAdminOrRS = PERFIS_GERENCIAM_TODOS.includes(currentUser?.tipo_usuario || '');

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
  //
  // 🆕 v1.0 (13/06/2026): passa SEMPRE `ator_email` para o backend
  //   aplicar o filtro RBAC contextual (GC/SDR vê só opt-outs cujos
  //   leads são deles). Admin/GR&S vê tudo.
  const carregar = useCallback(async () => {
    if (!atorEmail) {
      setToast({ tipo: 'error', texto: 'Usuário não identificado.' });
      setLoading(false);
      return;
    }
    setLoading(true);
    const params: Record<string, string> = { ator_email: atorEmail };
    if (busca) params.busca = busca;

    const resp = await get<ListarResponse>('listar_optout', params);
    if (resp.ok && resp.data?.success) {
      setOptouts(resp.data.optouts || []);
    } else {
      setToast({ tipo: 'error', texto: resp.error || 'Falha ao carregar opt-outs' });
    }
    setLoading(false);
  }, [get, busca, atorEmail]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // ── Adicionar ─────────────────────────────────────────────
  //
  // 🆕 v1.0 (13/06/2026): GC/SDR pode adicionar APENAS e-mails
  //   dos próprios leads. Validação acontece no backend (defesa em
  //   profundidade — UI não esconde o botão, mas o backend rejeita
  //   com mensagem clara se o email não pertence a um lead do ator).
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
      setToast({
        tipo: 'error',
        texto:
          resp.data?.error ||
          resp.error ||
          'Falha ao adicionar opt-out',
      });
    }
  };

  // ── Remover (Admin / GR&S apenas) ─────────────────────────
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
      setToast({ tipo: 'error', texto: resp.data?.error || resp.error || 'Falha ao remover opt-out' });
    }
  };

  // ────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-4">
      <Toast mensagem={toast} onDismiss={() => setToast(null)} />

      {/* Cabeçalho contextual */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">
            <i className="fa-solid fa-ban text-red-500 mr-1.5"></i>
            Lista de Opt-Out
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            E-mails removidos da base de envio — bounces permanentes do Resend,
            opt-outs automáticos (clicou em "SAIR"), spam complaints e
            descadastros manuais por outros canais (WhatsApp, telefone).
            {' '}
            <strong className="text-red-600">Saída irreversível por LGPD.</strong>
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

      {/* Banner explicativo de RBAC para GC/SDR */}
      {!isAdminOrRS && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 text-xs text-blue-800 flex items-start gap-2">
          <i className="fa-solid fa-circle-info mt-0.5"></i>
          <div>
            Você está vendo apenas opt-outs dos <strong>seus leads</strong>.
            Para adicionar um opt-out manual (descadastro por WhatsApp/telefone),
            o e-mail precisa pertencer a um lead reservado a você.
            Remoção de opt-out (descadastro de erro) é exclusiva da gestão.
          </div>
        </div>
      )}

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
              : isAdminOrRS
                ? 'Ainda não há e-mails em opt-out na base.'
                : 'Você ainda não tem opt-outs vinculados aos seus leads.'
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
                {/* Coluna "Ações" só aparece para Admin/GR&S (botão Remover).
                    Para GC/SDR não há ação possível nesta tabela. */}
                {isAdminOrRS && (
                  <th className="px-4 py-3 font-medium text-right">Ações</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {optouts.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{o.email}</td>
                  <td className="px-4 py-3 text-gray-600">{o.motivo || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{formatarData(o.criado_em)}</td>
                  {isAdminOrRS && (
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setAlvoRemover(o)}
                        className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                        title="Remover do opt-out (descadastrar erro)"
                      >
                        <i className="fa-solid fa-trash"></i>
                      </button>
                    </td>
                  )}
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
                {/* Aviso de ownership só para GC/SDR */}
                {!isAdminOrRS && (
                  <p className="text-xs text-gray-500 mt-1">
                    O e-mail precisa pertencer a um lead reservado a você.
                  </p>
                )}
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

      {/* Confirmação de remoção (só Admin/GR&S chega aqui — botão não renderiza para GC/SDR) */}
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
                a entrada foi um erro (ex.: bounce temporário marcado por engano).
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
