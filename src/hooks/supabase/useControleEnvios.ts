/**
 * useControleEnvios.ts - Hook para gerenciar envios de CVs
 * 
 * Chama API Routes do backend (não acessa Supabase direto)
 * 
 * Data: 06/01/2026
 */

import { useState, useCallback } from 'react';

// ============================================
// TIPOS
// ============================================

export interface EnvioCV {
  id: number;
  candidatura_id: number;
  vaga_id: number;
  cliente_id: number;
  analista_id?: number;
  enviado_em: string;
  enviado_por?: number;
  meio_envio: 'email' | 'portal_cliente' | 'whatsapp' | 'outro';
  destinatario_email?: string;
  destinatario_nome?: string;
  cv_versao: 'original' | 'padronizado';
  status: 'enviado' | 'visualizado' | 'em_analise';
  visualizado_em?: string;
  email_message_id?: string;
  email_subject?: string;
  origem: 'manual' | 'webhook_resend' | 'manual_classificacao';
  observacoes?: string;
  // Dados enriquecidos
  candidato_nome?: string;
  candidato_email?: string;
  vaga_titulo?: string;
  cliente_nome?: string;
}

export interface AprovacaoCliente {
  id: number;
  candidatura_id: number;
  candidatura_envio_id?: number;
  decisao: 'aprovado' | 'reprovado' | 'agendado' | 'em_analise' | 'aguardando_resposta';
  decidido_em?: string;
  decidido_por?: string;
  data_agendamento?: string;
  motivo_reprovacao?: string;
  categoria_reprovacao?: string;
  feedback_cliente?: string;
  dias_para_resposta?: number;
  respondido_no_prazo?: boolean;
}

export interface EmailPendente {
  id: number;
  email_message_id: string;
  email_from: string;
  email_to: string;
  email_cc?: string;
  email_subject: string;
  email_body: string;
  email_received_at: string;
  classificacao_ia_tentativa?: any;
  motivo_pendencia: string;
  confianca_ia?: number;
  candidaturas_possiveis?: Array<{
    id: number;
    nome: string;
    vaga: string;
  }>;
  status: 'pendente' | 'resolvido' | 'ignorado';
  criado_em: string;
}

export interface MetricasEnvios {
  total_envios: number;
  total_visualizados: number;
  total_aprovados: number;
  total_reprovados: number;
  total_aguardando: number;
  taxa_aprovacao: number;
  taxa_visualizacao: number;
  tempo_medio_resposta_dias: number;
}

// ============================================
// HOOK
// ============================================

export const useControleEnvios = () => {
  const [envios, setEnvios] = useState<EnvioCV[]>([]);
  const [metricas, setMetricas] = useState<MetricasEnvios>({
    total_envios: 0,
    total_visualizados: 0,
    total_aprovados: 0,
    total_reprovados: 0,
    total_aguardando: 0,
    taxa_aprovacao: 0,
    taxa_visualizacao: 0,
    tempo_medio_resposta_dias: 0
  });
  const [pendentes, setPendentes] = useState<EmailPendente[]>([]);
  const [totalPendentes, setTotalPendentes] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================
  // CARREGAR ENVIOS
  // ============================================

  const carregarEnvios = useCallback(async (filtros?: {
    status?: string;
    cliente_id?: number;
    vaga_id?: number;
    data_inicio?: string;
    data_fim?: string;
  }) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filtros?.status) params.append('status', filtros.status);
      if (filtros?.cliente_id) params.append('cliente_id', filtros.cliente_id.toString());
      if (filtros?.vaga_id) params.append('vaga_id', filtros.vaga_id.toString());
      if (filtros?.data_inicio) params.append('data_inicio', filtros.data_inicio);
      if (filtros?.data_fim) params.append('data_fim', filtros.data_fim);

      const response = await fetch(`/api/envios/listar?${params.toString()}`);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Erro ao carregar envios');
      }

      setEnvios(result.data || []);
      setMetricas(result.metricas || metricas);

      return result.data;
    } catch (err: any) {
      console.error('Erro ao carregar envios:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // REGISTRAR ENVIO MANUAL
  // ============================================

  const registrarEnvio = useCallback(async (dados: {
    candidatura_id: number;
    vaga_id: number;
    cliente_id?: number;
    analista_id?: number;
    enviado_por?: number;
    meio_envio?: 'email' | 'portal_cliente' | 'whatsapp' | 'outro';
    destinatario_email?: string;
    destinatario_nome?: string;
    cv_anexado_url?: string;
    cv_versao?: 'original' | 'padronizado';
    observacoes?: string;
  }): Promise<EnvioCV | null> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/envios/registrar-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Erro ao registrar envio');
      }

      // Recarregar lista
      await carregarEnvios();

      return result.data;
    } catch (err: any) {
      console.error('Erro ao registrar envio:', err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [carregarEnvios]);

  // ============================================
  // REGISTRAR APROVAÇÃO/REPROVAÇÃO
  // ============================================

  const registrarAprovacao = useCallback(async (dados: {
    candidatura_id: number;
    candidatura_envio_id?: number;
    vaga_id?: number;
    cliente_id?: number;
    analista_id?: number;
    decisao: 'aprovado' | 'reprovado' | 'agendado' | 'em_analise';
    decidido_por?: string;
    data_agendamento?: string;
    local_entrevista?: string;
    motivo_reprovacao?: string;
    categoria_reprovacao?: string;
    feedback_cliente?: string;
  }): Promise<AprovacaoCliente | null> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/envios/aprovar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Erro ao registrar decisão');
      }

      // Recarregar lista
      await carregarEnvios();

      return result.data;
    } catch (err: any) {
      console.error('Erro ao registrar aprovação:', err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [carregarEnvios]);

  // ============================================
  // MARCAR COMO VISUALIZADO
  // ============================================

  const marcarVisualizado = useCallback(async (envioId: number): Promise<boolean> => {
    try {
      // Atualizar localmente primeiro (otimista)
      setEnvios(prev => prev.map(e => 
        e.id === envioId 
          ? { ...e, status: 'visualizado' as const, visualizado_em: new Date().toISOString() }
          : e
      ));

      // Chamar API para persistir
      const response = await fetch('/api/envios/aprovar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidatura_id: envios.find(e => e.id === envioId)?.candidatura_id,
          candidatura_envio_id: envioId,
          decisao: 'em_analise',
          decidido_por: 'Sistema (Marcar Visualizado)'
        })
      });

      return response.ok;
    } catch (err: any) {
      console.error('Erro ao marcar visualizado:', err);
      // Reverter em caso de erro
      await carregarEnvios();
      return false;
    }
  }, [envios, carregarEnvios]);

  // ============================================
  // CARREGAR EMAILS PENDENTES
  // ============================================

  const carregarPendentes = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/envios/pendentes');
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Erro ao carregar pendentes');
      }

      setPendentes(result.data || []);
      setTotalPendentes(result.total_pendentes || 0);

      return result.data;
    } catch (err: any) {
      console.error('Erro ao carregar pendentes:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // CLASSIFICAR EMAIL MANUALMENTE
  // ============================================

  const classificarManual = useCallback(async (dados: {
    pendente_id: number;
    tipo_email: 'envio_cv' | 'resposta_cliente' | 'outro' | 'ignorar';
    candidatura_id?: number;
    decisao?: 'visualizado' | 'em_analise' | 'agendamento' | 'aprovado' | 'reprovado';
    motivo_reprovacao?: string;
    categoria_reprovacao?: string;
    feedback_cliente?: string;
    data_agendamento?: string;
    observacao_resolucao?: string;
    resolvido_por?: number;
  }): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/envios/classificar-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Erro ao classificar email');
      }

      // Recarregar pendentes e envios
      await carregarPendentes();
      await carregarEnvios();

      return true;
    } catch (err: any) {
      console.error('Erro ao classificar email:', err);
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [carregarPendentes, carregarEnvios]);

  // ============================================
  // RETURN
  // ============================================

  return {
    // Estado
    envios,
    metricas,
    pendentes,
    totalPendentes,
    loading,
    error,

    // Ações
    carregarEnvios,
    registrarEnvio,
    registrarAprovacao,
    marcarVisualizado,
    carregarPendentes,
    classificarManual
  };
};

export default useControleEnvios;
