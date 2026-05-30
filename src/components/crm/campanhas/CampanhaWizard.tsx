/**
 * CampanhaWizard.tsx — Orquestrador do wizard de edição de campanha
 *
 * Caminho: src/components/crm/campanhas/CampanhaWizard.tsx
 * Versão: 1.0 (Fase 1D — 30/05/2026)
 *
 * Decomposto de CampaignBuilder.tsx (linhas 651-761 + ações dos passos).
 * Recebe os hooks já instanciados pelo CampanhasPage para evitar
 * duplicar estado e permitir refresh da lista após salvar.
 */

import React, { useEffect, useState } from 'react';
import StepInfo from './wizard-steps/StepInfo';
import StepCopys from './wizard-steps/StepCopys';
import StepLeads from './wizard-steps/StepLeads';
import StepRevisao from './wizard-steps/StepRevisao';
import StatusBadge from '../shared/components/StatusBadge';
import type { useCampanhas } from '../shared/hooks/useCampanhas';
import type { useCampanhaSteps } from '../shared/hooks/useCampanhaSteps';
import type { useCampanhaLeads } from '../shared/hooks/useCampanhaLeads';
import type { useCampanhaPreview } from '../shared/hooks/useCampanhaPreview';
import type { ToastMensagem } from '../shared/components/Toast';

// ════════════════════════════════════════════════════════════
// TIPOS
// ════════════════════════════════════════════════════════════

type WizardTab = 'info' | 'steps' | 'leads' | 'preview';

interface UserCtx {
  email: string;
  nome: string;
}

export interface CampanhaWizardProps {
  user: UserCtx;
  campanhasHook: ReturnType<typeof useCampanhas>;
  stepsHook: ReturnType<typeof useCampanhaSteps>;
  leadsHook: ReturnType<typeof useCampanhaLeads>;
  previewHook: ReturnType<typeof useCampanhaPreview>;
  assinaturaCarregada: boolean;
  onAbrirAssinatura: () => void;
  onVoltarLista: () => void;
  onMensagem: (m: ToastMensagem) => void;
}

// ════════════════════════════════════════════════════════════
// COMPONENTE
// ════════════════════════════════════════════════════════════

const CampanhaWizard: React.FC<CampanhaWizardProps> = ({
  user,
  campanhasHook,
  stepsHook,
  leadsHook,
  previewHook,
  assinaturaCarregada,
  onAbrirAssinatura,
  onVoltarLista,
  onMensagem,
}) => {
  const [activeTab, setActiveTab] = useState<WizardTab>('info');
  const [saving, setSaving] = useState(false);

  const campanha = campanhasHook.campanhaAtual;
  const podeSalvar = !!campanha.nome;

  // Carrega busca de leads disponíveis quando a busca muda
  useEffect(() => {
    if (activeTab === 'leads' && campanha.id) {
      leadsHook.carregarDisponiveis(campanha.id, leadsHook.busca);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadsHook.busca]);

  // ════════════════════════════════════════════════════════════
  // HANDLERS — SALVAR CAMPANHA (campanha + steps em sequência)
  // ════════════════════════════════════════════════════════════

  const salvarTudo = async (): Promise<boolean> => {
    setSaving(true);
    try {
      // 1. Salva campanha (cria ou atualiza)
      const id = await campanhasHook.salvar(campanha, user.email);
      if (!id) return false;

      // 2. Salva steps (cria/atualiza em loop)
      if (stepsHook.steps.length > 0) {
        const ok = await stepsHook.salvarTodos(id);
        if (!ok) return false;
      }

      onMensagem({ tipo: 'success', texto: 'Campanha salva com sucesso!' });
      campanhasHook.carregarStats();
      return true;
    } finally {
      setSaving(false);
    }
  };

  // ════════════════════════════════════════════════════════════
  // HANDLERS — MUDAR STATUS
  // ════════════════════════════════════════════════════════════

  const handleMudarStatus = async (novoStatus: string) => {
    if (!campanha.id) return;
    const ok = await campanhasHook.mudarStatus(campanha.id, novoStatus);
    if (ok) {
      onMensagem({ tipo: 'success', texto: `Status alterado para ${novoStatus}` });
      campanhasHook.carregar();
      campanhasHook.carregarStats();
    }
  };

  // ════════════════════════════════════════════════════════════
  // HANDLERS — TROCA DE TAB COM CARREGAMENTO LAZY
  // ════════════════════════════════════════════════════════════

  const trocarTab = (tab: WizardTab) => {
    setActiveTab(tab);
    if (tab === 'leads' && campanha.id) {
      leadsHook.carregarVinculados(campanha.id);
      leadsHook.carregarDisponiveis(campanha.id);
    }
    if (tab === 'preview' && campanha.id) {
      previewHook.carregar(
        campanha.id,
        previewHook.previewStep,
        user.email,
        leadsHook.vinculados[0]?.email_leads.id
      );
    }
  };

  // ════════════════════════════════════════════════════════════
  // HANDLERS — VINCULAR / DESVINCULAR
  // ════════════════════════════════════════════════════════════

  const handleVincular = async () => {
    if (!campanha.id) return;
    const resultado = await leadsHook.vincular(campanha.id);
    if (resultado) {
      const sufixo =
        resultado.optout_ignorados > 0
          ? ` (${resultado.optout_ignorados} em opt-out ignorados)`
          : '';
      onMensagem({
        tipo: 'success',
        texto: `${resultado.vinculados} leads vinculados${sufixo}`,
      });
      leadsHook.carregarVinculados(campanha.id);
      leadsHook.carregarDisponiveis(campanha.id, leadsHook.busca);
    }
  };

  const handleDesvincular = async (leadId: number) => {
    if (!campanha.id) return;
    const qtd = await leadsHook.desvincular(campanha.id, [leadId]);
    if (qtd !== null) {
      onMensagem({ tipo: 'success', texto: `${qtd} leads removidos` });
      leadsHook.carregarVinculados(campanha.id);
    }
  };

  // ════════════════════════════════════════════════════════════
  // HANDLERS — STEPS
  // ════════════════════════════════════════════════════════════

  const handleAdicionarStep = () => {
    const ok = stepsHook.adicionar();
    if (!ok) {
      onMensagem({
        tipo: 'error',
        texto: `Máximo de ${stepsHook.maxSteps} steps por campanha`,
      });
    }
  };

  // ════════════════════════════════════════════════════════════
  // RENDER — TABS DEFINIÇÃO
  // ════════════════════════════════════════════════════════════

  const tabs: { key: WizardTab; label: string; icon: string }[] = [
    { key: 'info', label: 'Campanha', icon: 'fa-solid fa-file-lines' },
    { key: 'steps', label: `Steps (${stepsHook.steps.length})`, icon: 'fa-solid fa-envelope' },
    { key: 'leads', label: `Leads (${leadsHook.vinculados.length})`, icon: 'fa-solid fa-users' },
    { key: 'preview', label: 'Preview', icon: 'fa-solid fa-eye' },
  ];

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header do editor */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onVoltarLista}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Voltar"
          >
            <i className="fa-solid fa-arrow-left text-xl"></i>
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {campanha.id ? 'Editar Campanha' : 'Nova Campanha'}
            </h2>
            {campanha.id && (
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-400">ID: {campanha.id}</span>
                <span className="text-gray-300">•</span>
                <StatusBadge status={campanha.status || 'rascunho'} />
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Botões de status */}
          {campanha.id &&
            campanha.status === 'rascunho' &&
            stepsHook.steps.length > 0 &&
            leadsHook.vinculados.length > 0 && (
              <button
                onClick={() => handleMudarStatus('agendada')}
                className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
              >
                <i className="fa-solid fa-clock"></i> Agendar
              </button>
            )}
          {campanha.id && campanha.status === 'agendada' && (
            <button
              onClick={() => handleMudarStatus('ativa')}
              className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
            >
              <i className="fa-solid fa-circle-play"></i> Ativar
            </button>
          )}
          {campanha.id && campanha.status === 'ativa' && (
            <button
              onClick={() => handleMudarStatus('pausada')}
              className="flex items-center gap-1 px-3 py-2 bg-yellow-600 text-white rounded-lg text-sm hover:bg-yellow-700"
            >
              <i className="fa-solid fa-circle-pause"></i> Pausar
            </button>
          )}
          {campanha.id && campanha.status === 'pausada' && (
            <button
              onClick={() => handleMudarStatus('ativa')}
              className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
            >
              <i className="fa-solid fa-circle-play"></i> Reativar
            </button>
          )}

          <button
            onClick={salvarTudo}
            disabled={saving || !podeSalvar}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? (
              <i className="fa-solid fa-spinner fa-spin"></i>
            ) : (
              <i className="fa-solid fa-floppy-disk"></i>
            )}
            Salvar
          </button>
        </div>
      </div>

      {/* Tabs do wizard */}
      <div className="flex border-b border-gray-200 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => trocarTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <i className={tab.icon}></i>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Conteúdo do wizard */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {activeTab === 'info' && (
          <StepInfo
            campanha={campanha}
            tipos={campanhasHook.tipos}
            assinaturaCarregada={assinaturaCarregada}
            onChange={campanhasHook.setCampanhaAtual}
            onAbrirAssinatura={onAbrirAssinatura}
            onProximo={() => trocarTab('steps')}
          />
        )}
        {activeTab === 'steps' && (
          <StepCopys
            steps={stepsHook.steps}
            stepEditando={stepsHook.stepEditando}
            podeAdicionar={stepsHook.podeAdicionar}
            setStepEditando={stepsHook.setStepEditando}
            onAdicionar={handleAdicionarStep}
            onAtualizarCampo={stepsHook.atualizarCampo}
            onExcluir={async (idx) => {
              const ok = await stepsHook.excluir(idx);
              if (ok) onMensagem({ tipo: 'success', texto: 'Step removido' });
            }}
            onVoltar={() => trocarTab('info')}
            onProximo={() => {
              if (!campanha.id) {
                onMensagem({
                  tipo: 'error',
                  texto: 'Salve a campanha primeiro antes de vincular leads',
                });
                return;
              }
              trocarTab('leads');
            }}
          />
        )}
        {activeTab === 'leads' && (
          <StepLeads
            disponiveis={leadsHook.disponiveis}
            vinculados={leadsHook.vinculados}
            selecionados={leadsHook.selecionados}
            busca={leadsHook.busca}
            loadingVinculados={leadsHook.loading}
            saving={leadsHook.saving}
            onBuscaChange={leadsHook.setBusca}
            onToggleSelecionado={leadsHook.toggleSelecionado}
            onVincular={handleVincular}
            onDesvincular={handleDesvincular}
            onVoltar={() => trocarTab('steps')}
            onProximo={() => trocarTab('preview')}
          />
        )}
        {activeTab === 'preview' && (
          <StepRevisao
            campanha={campanha}
            steps={stepsHook.steps}
            vinculados={leadsHook.vinculados}
            previewHtml={previewHook.previewHtml}
            previewAssunto={previewHook.previewAssunto}
            previewStep={previewHook.previewStep}
            saving={saving}
            onMudarPreviewStep={(ordem) => {
              if (campanha.id) {
                previewHook.carregar(
                  campanha.id,
                  ordem,
                  user.email,
                  leadsHook.vinculados[0]?.email_leads.id
                );
              }
            }}
            onVoltar={() => trocarTab('leads')}
            onSalvar={salvarTudo}
          />
        )}
      </div>
    </div>
  );
};

export default CampanhaWizard;
