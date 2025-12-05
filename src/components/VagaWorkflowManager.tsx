/**
 * COMPONENTE: VAGA WORKFLOW MANAGER
 * Gerencia o fluxo completo de 10 etapas de uma vaga
 */

import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  ArrowRight,
  Sparkles,
  User,
  RefreshCw
} from 'lucide-react';
import { vagaWorkflowService, VagaWorkflow } from '../services/vagaWorkflowService';
import { DescricaoAprovacaoModal } from './DescricaoAprovacaoModal';
import { PriorizacaoAprovacaoModal } from './PriorizacaoAprovacaoModal';
import { RedistribuicaoModal } from './RedistribuicaoModal';

interface VagaWorkflowManagerProps {
  vagaId: number;
  onWorkflowUpdate?: () => void;
}

const WORKFLOW_STEPS = [
  { id: 'rascunho', label: 'Rascunho', icon: FileText },
  { id: 'aguardando_revisao', label: 'Aguardando Revisão IA', icon: Sparkles },
  { id: 'aguardando_aprovacao_descricao', label: 'Aprovar Descrição', icon: CheckCircle },
  { id: 'descricao_aprovada', label: 'Descrição Aprovada', icon: CheckCircle },
  { id: 'aguardando_aprovacao_priorizacao', label: 'Aprovar Priorização', icon: CheckCircle },
  { id: 'priorizada_e_distribuida', label: 'Priorizada e Distribuída', icon: User },
  { id: 'em_andamento', label: 'Em Andamento', icon: Clock },
  { id: 'cvs_enviados', label: 'CVs Enviados', icon: FileText },
  { id: 'entrevistas_agendadas', label: 'Entrevistas Agendadas', icon: Clock },
  { id: 'fechada', label: 'Fechada', icon: CheckCircle }
];

export function VagaWorkflowManager({ vagaId, onWorkflowUpdate }: VagaWorkflowManagerProps) {
  const [vaga, setVaga] = useState<VagaWorkflow | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDescricaoModal, setShowDescricaoModal] = useState(false);
  const [showPriorizacaoModal, setShowPriorizacaoModal] = useState(false);
  const [showRedistribuicaoModal, setShowRedistribuicaoModal] = useState(false);

  useEffect(() => {
    carregarVaga();
  }, [vagaId]);

  const carregarVaga = async () => {
    // TODO: Implementar busca de vaga específica
    // Por enquanto, vamos simular
    console.log('Carregar vaga:', vagaId);
  };

  const handleMelhorarDescricao = async () => {
    setLoading(true);
    try {
      await vagaWorkflowService.melhorarDescricaoVaga(vagaId);
      await carregarVaga();
      onWorkflowUpdate?.();
    } catch (error) {
      console.error('Erro ao melhorar descrição:', error);
      alert('Erro ao melhorar descrição. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleAprovarDescricao = () => {
    setShowDescricaoModal(true);
  };

  const handleAprovarPriorizacao = () => {
    setShowPriorizacaoModal(true);
  };

  const handleRedistribuir = () => {
    setShowRedistribuicaoModal(true);
  };

  const getCurrentStepIndex = () => {
    if (!vaga) return 0;
    return WORKFLOW_STEPS.findIndex(step => step.id === vaga.status_workflow);
  };

  const currentStepIndex = getCurrentStepIndex();

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">
        Fluxo de Trabalho da Vaga
      </h3>

      {/* Timeline */}
      <div className="relative">
        {/* Linha de Progresso */}
        <div className="absolute left-0 top-5 w-full h-0.5 bg-gray-200">
          <div 
            className="h-full bg-blue-600 transition-all duration-500"
            style={{ 
              width: `${(currentStepIndex / (WORKFLOW_STEPS.length - 1)) * 100}%` 
            }}
          />
        </div>

        {/* Steps */}
        <div className="relative flex justify-between">
          {WORKFLOW_STEPS.map((step, index) => {
            const Icon = step.icon;
            const isCompleted = index < currentStepIndex;
            const isCurrent = index === currentStepIndex;
            const isPending = index > currentStepIndex;

            return (
              <div key={step.id} className="flex flex-col items-center" style={{ width: '10%' }}>
                {/* Círculo */}
                <div className={`
                  w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all
                  ${isCompleted ? 'bg-blue-600 border-blue-600 text-white' : ''}
                  ${isCurrent ? 'bg-white border-blue-600 text-blue-600 ring-4 ring-blue-100' : ''}
                  ${isPending ? 'bg-white border-gray-300 text-gray-400' : ''}
                `}>
                  <Icon className="w-5 h-5" />
                </div>

                {/* Label */}
                <div className={`
                  mt-2 text-xs text-center font-medium
                  ${isCurrent ? 'text-blue-600' : ''}
                  ${isCompleted ? 'text-gray-700' : ''}
                  ${isPending ? 'text-gray-400' : ''}
                `}>
                  {step.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Ações */}
      <div className="mt-8 flex gap-3">
        {vaga?.status_workflow === 'rascunho' && (
          <button
            onClick={handleMelhorarDescricao}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles className="w-4 h-4" />
            {loading ? 'Melhorando...' : 'Melhorar Descrição com IA'}
          </button>
        )}

        {vaga?.status_workflow === 'aguardando_aprovacao_descricao' && (
          <button
            onClick={handleAprovarDescricao}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <CheckCircle className="w-4 h-4" />
            Revisar e Aprovar Descrição
          </button>
        )}

        {vaga?.status_workflow === 'aguardando_aprovacao_priorizacao' && (
          <button
            onClick={handleAprovarPriorizacao}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <CheckCircle className="w-4 h-4" />
            Aprovar Priorização
          </button>
        )}

        {vaga?.status_workflow && ['priorizada_e_distribuida', 'em_andamento'].includes(vaga.status_workflow) && (
          <button
            onClick={handleRedistribuir}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
          >
            <RefreshCw className="w-4 h-4" />
            Redistribuir Vaga
          </button>
        )}
      </div>

      {/* Modais */}
      {showDescricaoModal && (
        <DescricaoAprovacaoModal
          vagaId={vagaId}
          onClose={() => setShowDescricaoModal(false)}
          onAprovado={() => {
            setShowDescricaoModal(false);
            carregarVaga();
            onWorkflowUpdate?.();
          }}
        />
      )}

      {showPriorizacaoModal && (
        <PriorizacaoAprovacaoModal
          vagaId={vagaId}
          onClose={() => setShowPriorizacaoModal(false)}
          onAprovado={() => {
            setShowPriorizacaoModal(false);
            carregarVaga();
            onWorkflowUpdate?.();
          }}
        />
      )}

      {showRedistribuicaoModal && (
        <RedistribuicaoModal
          vagaId={vagaId}
          onClose={() => setShowRedistribuicaoModal(false)}
          onRedistribuido={() => {
            setShowRedistribuicaoModal(false);
            carregarVaga();
            onWorkflowUpdate?.();
          }}
        />
      )}
    </div>
  );
}
