/**
 * EmailsPendentesPanel.tsx - Painel de emails pendentes de classificação
 * 
 * Exibe emails que a IA não conseguiu classificar automaticamente
 * e permite classificação manual pelo analista
 * 
 * Data: 06/01/2026
 */

import React, { useState, useEffect } from 'react';
import {
  Mail, AlertTriangle, CheckCircle, XCircle, 
  Clock, User, Briefcase, ChevronDown, ChevronUp,
  Send, Eye, Calendar, ThumbsUp, ThumbsDown,
  Loader2, RefreshCw, HelpCircle
} from 'lucide-react';
import { useControleEnvios, EmailPendente } from '../../hooks/supabase/useControleEnvios';

interface EmailsPendentessPanelProps {
  currentUserId?: number;
  onClassificado?: () => void;
}

const EmailsPendentesPanel: React.FC<EmailsPendentessPanelProps> = ({
  currentUserId,
  onClassificado
}) => {
  const {
    pendentes,
    totalPendentes,
    loading,
    error,
    carregarPendentes,
    classificarManual
  } = useControleEnvios();

  const [emailExpandido, setEmailExpandido] = useState<number | null>(null);
  const [modalClassificar, setModalClassificar] = useState<EmailPendente | null>(null);
  const [classificando, setClassificando] = useState(false);

  // Form de classificação
  const [formClassificar, setFormClassificar] = useState({
    tipo_email: '' as '' | 'envio_cv' | 'resposta_cliente' | 'outro' | 'ignorar',
    candidatura_id: '' as string | number,
    decisao: '' as '' | 'visualizado' | 'em_analise' | 'agendamento' | 'aprovado' | 'reprovado',
    motivo_reprovacao: '',
    categoria_reprovacao: '',
    feedback_cliente: '',
    data_agendamento: '',
    observacao: ''
  });

  // Carregar ao montar
  useEffect(() => {
    carregarPendentes();
  }, [carregarPendentes]);

  // Handlers
  const handleExpandir = (id: number) => {
    setEmailExpandido(emailExpandido === id ? null : id);
  };

  const handleAbrirModal = (email: EmailPendente) => {
    setModalClassificar(email);
    setFormClassificar({
      tipo_email: email.classificacao_ia_tentativa?.tipo_email || '',
      candidatura_id: email.candidaturas_possiveis?.[0]?.id || '',
      decisao: '',
      motivo_reprovacao: '',
      categoria_reprovacao: '',
      feedback_cliente: '',
      data_agendamento: '',
      observacao: ''
    });
  };

  const handleFecharModal = () => {
    setModalClassificar(null);
    setFormClassificar({
      tipo_email: '',
      candidatura_id: '',
      decisao: '',
      motivo_reprovacao: '',
      categoria_reprovacao: '',
      feedback_cliente: '',
      data_agendamento: '',
      observacao: ''
    });
  };

  const handleClassificar = async () => {
    if (!modalClassificar || !formClassificar.tipo_email) return;

    setClassificando(true);

    try {
      const sucesso = await classificarManual({
        pendente_id: modalClassificar.id,
        tipo_email: formClassificar.tipo_email,
        candidatura_id: formClassificar.candidatura_id ? parseInt(formClassificar.candidatura_id.toString()) : undefined,
        decisao: formClassificar.decisao || undefined,
        motivo_reprovacao: formClassificar.motivo_reprovacao || undefined,
        categoria_reprovacao: formClassificar.categoria_reprovacao || undefined,
        feedback_cliente: formClassificar.feedback_cliente || undefined,
        data_agendamento: formClassificar.data_agendamento || undefined,
        observacao_resolucao: formClassificar.observacao || undefined,
        resolvido_por: currentUserId
      });

      if (sucesso) {
        handleFecharModal();
        onClassificado?.();
      }
    } finally {
      setClassificando(false);
    }
  };

  const getMotivoIcon = (motivo: string) => {
    switch (motivo) {
      case 'baixa_confianca': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'candidatura_nao_encontrada': return <HelpCircle className="w-4 h-4 text-orange-500" />;
      case 'multiplas_candidaturas': return <User className="w-4 h-4 text-blue-500" />;
      default: return <Mail className="w-4 h-4 text-gray-500" />;
    }
  };

  const getMotivoLabel = (motivo: string) => {
    switch (motivo) {
      case 'baixa_confianca': return 'Confiança baixa';
      case 'candidatura_nao_encontrada': return 'Candidatura não encontrada';
      case 'multiplas_candidaturas': return 'Múltiplas candidaturas';
      case 'erro_ia': return 'Erro na IA';
      default: return motivo;
    }
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-100 rounded-lg">
            <Mail className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-800">
              Emails Pendentes de Classificação
            </h2>
            <p className="text-sm text-gray-500">
              {totalPendentes} email(s) aguardando classificação manual
            </p>
          </div>
        </div>
        <button
          onClick={() => carregarPendentes()}
          disabled={loading}
          className="p-2 hover:bg-gray-100 rounded-lg transition"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Erro */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Lista de Pendentes */}
      {loading && pendentes.length === 0 ? (
        <div className="text-center py-8">
          <Loader2 className="w-8 h-8 mx-auto text-orange-600 animate-spin" />
          <p className="text-gray-500 mt-2">Carregando...</p>
        </div>
      ) : pendentes.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
          <p className="font-medium text-gray-600">Nenhum email pendente</p>
          <p className="text-sm">Todos os emails foram classificados automaticamente</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendentes.map((email) => (
            <div
              key={email.id}
              className="border rounded-lg overflow-hidden hover:border-orange-300 transition"
            >
              {/* Header do Email */}
              <div
                className="p-4 cursor-pointer hover:bg-gray-50"
                onClick={() => handleExpandir(email.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {getMotivoIcon(email.motivo_pendencia)}
                      <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded">
                        {getMotivoLabel(email.motivo_pendencia)}
                      </span>
                      {email.confianca_ia && (
                        <span className="text-xs text-gray-400">
                          Confiança: {email.confianca_ia}%
                        </span>
                      )}
                    </div>
                    <h3 className="font-medium text-gray-800 line-clamp-1">
                      {email.email_subject || '(Sem assunto)'}
                    </h3>
                    <p className="text-sm text-gray-500">
                      De: {email.email_from}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">
                      {new Date(email.criado_em).toLocaleDateString('pt-BR')}
                    </span>
                    {emailExpandido === email.id ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>
              </div>

              {/* Conteúdo Expandido */}
              {emailExpandido === email.id && (
                <div className="px-4 pb-4 border-t bg-gray-50">
                  {/* Corpo do Email */}
                  <div className="mt-3">
                    <p className="text-xs text-gray-500 mb-1">Conteúdo:</p>
                    <div className="p-3 bg-white rounded border text-sm text-gray-700 max-h-40 overflow-y-auto">
                      {email.email_body?.substring(0, 1000) || '(Sem conteúdo)'}
                      {email.email_body?.length > 1000 && '...'}
                    </div>
                  </div>

                  {/* Candidaturas Possíveis */}
                  {email.candidaturas_possiveis && email.candidaturas_possiveis.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs text-gray-500 mb-1">Candidaturas possíveis:</p>
                      <div className="flex flex-wrap gap-2">
                        {email.candidaturas_possiveis.map((c) => (
                          <span
                            key={c.id}
                            className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded"
                          >
                            {c.nome} - {c.vaga}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tentativa da IA */}
                  {email.classificacao_ia_tentativa && (
                    <div className="mt-3">
                      <p className="text-xs text-gray-500 mb-1">Classificação tentada pela IA:</p>
                      <div className="text-xs text-gray-600">
                        Tipo: {email.classificacao_ia_tentativa.tipo_email || 'N/A'} | 
                        Candidato: {email.classificacao_ia_tentativa.candidato_nome || 'N/A'} |
                        Vaga: {email.classificacao_ia_tentativa.vaga_titulo || 'N/A'}
                      </div>
                    </div>
                  )}

                  {/* Botão Classificar */}
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => handleAbrirModal(email)}
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 flex items-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Classificar Manualmente
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal de Classificação */}
      {modalClassificar && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="p-4 border-b bg-orange-50">
              <h3 className="text-lg font-bold text-gray-800">Classificar Email</h3>
              <p className="text-sm text-gray-600 line-clamp-1">
                {modalClassificar.email_subject}
              </p>
            </div>

            {/* Form */}
            <div className="p-6 space-y-4">
              {/* Tipo de Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de Email *
                </label>
                <select
                  value={formClassificar.tipo_email}
                  onChange={(e) => setFormClassificar({
                    ...formClassificar,
                    tipo_email: e.target.value as any,
                    decisao: ''
                  })}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="">Selecione...</option>
                  <option value="envio_cv">📤 Envio de CV para cliente</option>
                  <option value="resposta_cliente">📬 Resposta do cliente</option>
                  <option value="outro">❓ Outro (não relacionado)</option>
                  <option value="ignorar">🚫 Ignorar este email</option>
                </select>
              </div>

              {/* Candidatura */}
              {formClassificar.tipo_email && formClassificar.tipo_email !== 'ignorar' && formClassificar.tipo_email !== 'outro' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Candidatura *
                  </label>
                  <select
                    value={formClassificar.candidatura_id}
                    onChange={(e) => setFormClassificar({
                      ...formClassificar,
                      candidatura_id: e.target.value
                    })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="">Selecione a candidatura...</option>
                    {modalClassificar.candidaturas_possiveis?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome} - {c.vaga}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    Ou digite o ID manualmente
                  </p>
                  <input
                    type="number"
                    value={formClassificar.candidatura_id}
                    onChange={(e) => setFormClassificar({
                      ...formClassificar,
                      candidatura_id: e.target.value
                    })}
                    placeholder="ID da candidatura"
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              )}

              {/* Decisão (para resposta do cliente) */}
              {formClassificar.tipo_email === 'resposta_cliente' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Decisão do Cliente *
                  </label>
                  <select
                    value={formClassificar.decisao}
                    onChange={(e) => setFormClassificar({
                      ...formClassificar,
                      decisao: e.target.value as any
                    })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="">Selecione...</option>
                    <option value="visualizado">👁️ Visualizado (confirmou recebimento)</option>
                    <option value="em_analise">🔍 Em análise (vai avaliar)</option>
                    <option value="agendamento">📅 Agendamento de entrevista</option>
                    <option value="aprovado">✅ Aprovado</option>
                    <option value="reprovado">❌ Reprovado</option>
                  </select>
                </div>
              )}

              {/* Campos de Reprovação */}
              {formClassificar.decisao === 'reprovado' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Categoria da Reprovação
                    </label>
                    <select
                      value={formClassificar.categoria_reprovacao}
                      onChange={(e) => setFormClassificar({
                        ...formClassificar,
                        categoria_reprovacao: e.target.value
                      })}
                      className="w-full border rounded-lg px-3 py-2"
                    >
                      <option value="">Selecione...</option>
                      <option value="tecnico">Técnico</option>
                      <option value="comportamental">Comportamental</option>
                      <option value="salario">Pretensão Salarial</option>
                      <option value="disponibilidade">Disponibilidade</option>
                      <option value="outro">Outro</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Motivo da Reprovação
                    </label>
                    <textarea
                      value={formClassificar.motivo_reprovacao}
                      onChange={(e) => setFormClassificar({
                        ...formClassificar,
                        motivo_reprovacao: e.target.value
                      })}
                      className="w-full border rounded-lg px-3 py-2 h-20"
                      placeholder="Descreva o motivo..."
                    />
                  </div>
                </>
              )}

              {/* Campo de Agendamento */}
              {formClassificar.decisao === 'agendamento' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data/Hora do Agendamento
                  </label>
                  <input
                    type="datetime-local"
                    value={formClassificar.data_agendamento}
                    onChange={(e) => setFormClassificar({
                      ...formClassificar,
                      data_agendamento: e.target.value
                    })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
              )}

              {/* Feedback */}
              {formClassificar.tipo_email === 'resposta_cliente' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Feedback do Cliente
                  </label>
                  <textarea
                    value={formClassificar.feedback_cliente}
                    onChange={(e) => setFormClassificar({
                      ...formClassificar,
                      feedback_cliente: e.target.value
                    })}
                    className="w-full border rounded-lg px-3 py-2 h-20"
                    placeholder="Resumo do feedback..."
                  />
                </div>
              )}

              {/* Observação */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Observação (opcional)
                </label>
                <textarea
                  value={formClassificar.observacao}
                  onChange={(e) => setFormClassificar({
                    ...formClassificar,
                    observacao: e.target.value
                  })}
                  className="w-full border rounded-lg px-3 py-2 h-16"
                  placeholder="Anotações sobre a classificação..."
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
              <button
                onClick={handleFecharModal}
                className="px-4 py-2 border rounded-lg hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                onClick={handleClassificar}
                disabled={
                  classificando || 
                  !formClassificar.tipo_email ||
                  (formClassificar.tipo_email === 'resposta_cliente' && !formClassificar.decisao) ||
                  (formClassificar.tipo_email !== 'ignorar' && formClassificar.tipo_email !== 'outro' && !formClassificar.candidatura_id)
                }
                className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2"
              >
                {classificando ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Classificando...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Confirmar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailsPendentesPanel;
