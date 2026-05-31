/**
 * CampanhasPage.tsx — Container principal do módulo de Campanhas
 *
 * Caminho: src/components/crm/campanhas/CampanhasPage.tsx
 * Versão: 1.0 (Fase 1D — 30/05/2026)
 *
 * Substitui o componente monolítico CampaignBuilder.tsx (1483 linhas).
 * Orquestra os 5 hooks (campanhas, steps, leads, assinatura, preview),
 * alterna entre VISTA LISTA e VISTA WIZARD, e exibe modal de assinatura
 * e toast de mensagens.
 */

import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useCampanhas } from '../shared/hooks/useCampanhas';
import { useCampanhaSteps } from '../shared/hooks/useCampanhaSteps';
import { useCampanhaLeads } from '../shared/hooks/useCampanhaLeads';
import { useCampanhaPreview } from '../shared/hooks/useCampanhaPreview';
import { useAssinatura } from '../shared/hooks/useAssinatura';

import CampanhaWizard from './CampanhaWizard';
import AssinaturaModal from './AssinaturaModal';
import StatusBadge from '../shared/components/StatusBadge';
import KpiCard from '../shared/components/KpiCard';
import EmptyState from '../shared/components/EmptyState';
import Toast, { ToastMensagem } from '../shared/components/Toast';
import { formatDate } from '../types/crm.constants';
import type { Campanha, CurrentUserLite } from '../types/crm.types';

// ════════════════════════════════════════════════════════════
// PROPS
// ════════════════════════════════════════════════════════════

export interface CampanhasPageProps {
  /** Mantido para consistência com BaseLeadsPage (RBAC futuro). */
  currentUser?: CurrentUserLite;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const CampanhasPage: React.FC<CampanhasPageProps> = () => {
  const { user } = useAuth();

  // ── View atual ──
  const [view, setView] = useState<'list' | 'editor'>('list');

  // ── Hooks ──
  const campanhasH = useCampanhas();
  const stepsH = useCampanhaSteps();
  const leadsH = useCampanhaLeads();
  const previewH = useCampanhaPreview();
  const assinaturaH = useAssinatura();

  // ── Modal de assinatura ──
  const [showAssinatura, setShowAssinatura] = useState(false);

  // ── Toast ──
  const [mensagem, setMensagem] = useState<ToastMensagem | null>(null);

  // ════════════════════════════════════════════════════════════
  // EFEITOS
  // ════════════════════════════════════════════════════════════

  // Carga inicial
  useEffect(() => {
    campanhasH.carregar();
    campanhasH.carregarStats();
    campanhasH.carregarTipos();
    if (user?.email) {
      assinaturaH.carregar(user.email);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh da lista quando filtros mudam
  useEffect(() => {
    campanhasH.carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campanhasH.filtroStatus, campanhasH.busca]);

  // ════════════════════════════════════════════════════════════
  // HANDLERS
  // ════════════════════════════════════════════════════════════

  const handleNovaCampanha = () => {
    campanhasH.setCampanhaAtual({
      nome: '',
      tipo: 'Outsourcing',
      status: 'rascunho',
      dominio_envio: '',
      email_remetente: user?.email || '',
      nome_remetente: user?.nome || '',
      horario_inicio: '08:00',
      horario_fim: '18:00',
    });
    stepsH.setSteps([]);
    leadsH.reset();
    previewH.reset();
    setView('editor');
  };

  const handleEditarCampanha = async (c: Campanha) => {
    const detalhe = await campanhasH.carregarDetalhe(c.id);
    if (detalhe) {
      stepsH.setSteps(detalhe.steps || []);
      await leadsH.carregarVinculados(c.id);
      setView('editor');
    }
  };

  const handleExcluirCampanha = async (id: number) => {
    if (!confirm('Excluir esta campanha? Esta ação não pode ser desfeita.')) return;
    const ok = await campanhasH.excluir(id);
    if (ok) {
      setMensagem({ tipo: 'success', texto: 'Campanha excluída' });
      campanhasH.carregar();
      campanhasH.carregarStats();
    }
  };

  const handleVoltarLista = () => {
    setView('list');
    campanhasH.carregar();
    leadsH.reset();
    previewH.reset();
  };

  const handleSalvarAssinatura = async () => {
    if (!user?.email) return;
    const ok = await assinaturaH.salvar(user.email);
    if (ok) {
      setShowAssinatura(false);
      setMensagem({ tipo: 'success', texto: 'Assinatura salva!' });
    }
  };

  // ════════════════════════════════════════════════════════════
  // RENDER — VISTA LISTA
  // ════════════════════════════════════════════════════════════

  const renderLista = () => (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <i className="fa-solid fa-rocket text-blue-600"></i>
            Campanhas de Email
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Crie e gerencie sequências de email com múltiplos steps
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAssinatura(true)}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
          >
            <i className="fa-solid fa-signature"></i>
            Minha Assinatura
          </button>
          <button
            onClick={handleNovaCampanha}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            <i className="fa-solid fa-plus"></i>
            Nova Campanha
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Total"
          valor={campanhasH.stats.total}
          icon="fa-solid fa-envelopes-bulk"
          cor="gray"
        />
        <KpiCard
          label="Ativas"
          valor={campanhasH.stats.ativas}
          icon="fa-solid fa-circle-play"
          cor="green"
        />
        <KpiCard
          label="Rascunhos"
          valor={campanhasH.stats.rascunhos}
          icon="fa-solid fa-pen-to-square"
          cor="amber"
        />
        <KpiCard
          label="Concluídas"
          valor={campanhasH.stats.concluidas}
          icon="fa-solid fa-circle-check"
          cor="purple"
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
          <input
            type="text"
            placeholder="Buscar campanha..."
            value={campanhasH.busca}
            onChange={(e) => campanhasH.setBusca(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <select
          value={campanhasH.filtroStatus}
          onChange={(e) => campanhasH.setFiltroStatus(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">Todos os status</option>
          <option value="rascunho">Rascunho</option>
          <option value="agendada">Agendada</option>
          <option value="ativa">Ativa</option>
          <option value="pausada">Pausada</option>
          <option value="concluida">Concluída</option>
        </select>
      </div>

      {/* Tabela */}
      {campanhasH.loading ? (
        <div className="flex items-center justify-center py-12">
          <i className="fa-solid fa-spinner fa-spin text-blue-500 text-3xl"></i>
        </div>
      ) : campanhasH.campanhas.length === 0 ? (
        <EmptyState
          icon="fa-solid fa-envelope"
          titulo="Nenhuma campanha encontrada"
          descricao='Clique em "Nova Campanha" para começar'
          acaoLabel="+ Nova Campanha"
          onAcao={handleNovaCampanha}
        />
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Campanha</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Tipo</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Leads</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Enviados</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Abertos</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Criado em</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {campanhasH.campanhas.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleEditarCampanha(c)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{c.nome}</p>
                      <p className="text-xs text-gray-400">{c.nome_remetente || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                        {c.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3 text-center font-medium">
                      {c.total_destinatarios || 0}
                    </td>
                    <td className="px-4 py-3 text-center">{c.total_enviados || 0}</td>
                    <td className="px-4 py-3 text-center">
                      {c.total_abertos || 0}
                      {c.taxa_abertura > 0 && (
                        <span className="text-xs text-gray-400 ml-1">
                          ({c.taxa_abertura}%)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(c.criado_em)}</td>
                    <td
                      className="px-4 py-3 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {c.status === 'rascunho' && (
                        <button
                          onClick={() => handleExcluirCampanha(c.id)}
                          className="text-red-400 hover:text-red-600 p-1"
                          title="Excluir"
                        >
                          <i className="fa-solid fa-trash text-sm"></i>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // RENDER PRINCIPAL
  // ════════════════════════════════════════════════════════════

  return (
    <>
      <Toast mensagem={mensagem} onDismiss={() => setMensagem(null)} />

      {view === 'list' ? (
        renderLista()
      ) : (
        <CampanhaWizard
          user={{
            // 🔧 31/05/2026 (Fase 4C-fix): o modelo de usuário usa nome_usuario.
            // email/nome podem vir vazios → fallback para nome_usuario garante criado_por.
            email: user?.email || user?.nome_usuario || '',
            nome: user?.nome || user?.nome_usuario || '',
          }}
          campanhasHook={campanhasH}
          stepsHook={stepsH}
          leadsHook={leadsH}
          previewHook={previewH}
          assinaturaCarregada={assinaturaH.carregada}
          onAbrirAssinatura={() => setShowAssinatura(true)}
          onVoltarLista={handleVoltarLista}
          onMensagem={setMensagem}
        />
      )}

      <AssinaturaModal
        aberto={showAssinatura}
        assinatura={assinaturaH.assinatura}
        saving={assinaturaH.loading}
        onChange={assinaturaH.setAssinatura}
        onSalvar={handleSalvarAssinatura}
        onFechar={() => setShowAssinatura(false)}
      />
    </>
  );
};

export default CampanhasPage;
