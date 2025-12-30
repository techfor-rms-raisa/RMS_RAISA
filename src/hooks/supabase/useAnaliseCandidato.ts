/**
 * useAnaliseCandidato.ts - Hook para Análise de Candidatos
 * 
 * Orquestra todo o fluxo de:
 * - Importação de CV
 * - Extração de dados via IA
 * - Análise de GAPs
 * - Cálculo de compatibilidade
 * - Salvamento no Banco de Talentos
 * - Criação de Candidatura
 * 
 * Versão: 1.0
 * Data: 30/12/2025
 */

import { useState, useCallback } from 'react';
import { supabase } from '../../config/supabase';
import { Vaga, Candidatura } from '@/types';
import { 
  extrairDadosCV, 
  calcularCompatibilidade, 
  salvarNoBancoTalentos,
  verificarCPFExistente,
  DadosExtraidosCV,
  ScoreCompatibilidade,
  ResultadoAnaliseCV
} from '../../services/cvExtractionService';
import { 
  analisarGapsApenas, 
  verificarDesqualificacao,
  AnaliseGapsCompleta 
} from '../../services/claudeService';

// ============================================
// TIPOS
// ============================================

export type EtapaAnalise = 
  | 'inicial'           // Aguardando input
  | 'extraindo'         // Extraindo dados do CV
  | 'calculando_score'  // Calculando compatibilidade
  | 'analisando_gaps'   // Analisando GAPs
  | 'salvando'          // Salvando no banco
  | 'concluido'         // Análise concluída
  | 'erro';             // Erro no processo

export interface EstadoAnalise {
  etapa: EtapaAnalise;
  progresso: number;
  mensagem: string;
  dados_extraidos?: DadosExtraidosCV;
  score_compatibilidade?: ScoreCompatibilidade;
  analise_gaps?: AnaliseGapsCompleta;
  pessoa_id?: number;
  cpf_existente?: boolean;
  pessoa_atualizada?: boolean;
  erro?: string;
}

export interface ResultadoFinal {
  sucesso: boolean;
  dados_extraidos: DadosExtraidosCV;
  score_compatibilidade?: ScoreCompatibilidade;
  analise_gaps?: AnaliseGapsCompleta;
  pessoa_id: number;
  cpf_existente: boolean;
  pessoa_atualizada: boolean;
  candidatura_id?: number;
  desqualificado?: boolean;
  motivos_desqualificacao?: string[];
}

// ============================================
// HOOK PRINCIPAL
// ============================================

export const useAnaliseCandidato = () => {
  const [estado, setEstado] = useState<EstadoAnalise>({
    etapa: 'inicial',
    progresso: 0,
    mensagem: 'Aguardando CV...'
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================
  // ATUALIZAR ESTADO
  // ============================================
  
  const atualizarEstado = useCallback((
    etapa: EtapaAnalise, 
    progresso: number, 
    mensagem: string,
    dados?: Partial<EstadoAnalise>
  ) => {
    setEstado(prev => ({
      ...prev,
      etapa,
      progresso,
      mensagem,
      ...dados
    }));
  }, []);

  // ============================================
  // RESETAR ESTADO
  // ============================================

  const resetar = useCallback(() => {
    setEstado({
      etapa: 'inicial',
      progresso: 0,
      mensagem: 'Aguardando CV...'
    });
    setLoading(false);
    setError(null);
  }, []);

  // ============================================
  // FUNÇÃO PRINCIPAL: ANALISAR CV
  // ============================================

  const analisarCV = useCallback(async (
    textoCV: string,
    vaga?: Vaga
  ): Promise<ResultadoFinal | null> => {
    setLoading(true);
    setError(null);

    try {
      // ETAPA 1: Extrair dados do CV
      atualizarEstado('extraindo', 10, '🔍 Extraindo dados do currículo...');
      
      const dados_extraidos = await extrairDadosCV(textoCV);
      
      atualizarEstado('extraindo', 30, `✅ Dados extraídos: ${dados_extraidos.nome}`, {
        dados_extraidos
      });

      // ETAPA 2: Verificar CPF existente
      const verificacaoCPF = await verificarCPFExistente(dados_extraidos.cpf || '');

      // ETAPA 3: Calcular Score de Compatibilidade (se vaga informada)
      let score_compatibilidade: ScoreCompatibilidade | undefined;
      
      if (vaga) {
        atualizarEstado('calculando_score', 40, '📊 Calculando compatibilidade com a vaga...');
        
        score_compatibilidade = await calcularCompatibilidade(dados_extraidos, vaga);
        
        atualizarEstado('calculando_score', 55, `📊 Score: ${score_compatibilidade.score_total}%`, {
          score_compatibilidade
        });
      }

      // ETAPA 4: Analisar GAPs (se vaga informada)
      let analise_gaps: AnaliseGapsCompleta | undefined;
      let desqualificado = false;
      let motivos_desqualificacao: string[] = [];

      if (vaga) {
        atualizarEstado('analisando_gaps', 65, '🎯 Analisando GAPs de requisitos...');
        
        try {
          // Preparar dados para análise de GAPs
          const dadosCandidato = {
            nome: dados_extraidos.nome,
            senioridade: dados_extraidos.senioridade,
            skills: dados_extraidos.skills.map(s => s.nome),
            experiencia_anos: calcularAnosExperiencia(dados_extraidos.experiencias),
            pretensao_salarial: dados_extraidos.pretensao_salarial,
            disponibilidade: dados_extraidos.disponibilidade,
            formacao: dados_extraidos.formacoes.map(f => `${f.curso} - ${f.instituicao}`).join(', ')
          };

          const dadosVaga = {
            titulo: vaga.titulo,
            senioridade: vaga.senioridade,
            stack_tecnologica: Array.isArray(vaga.stack_tecnologica) ? vaga.stack_tecnologica : [],
            requisitos_obrigatorios: vaga.requisitos_obrigatorios || [],
            requisitos_desejaveis: vaga.requisitos_desejaveis || [],
            salario_min: vaga.salario_min,
            salario_max: vaga.salario_max
          };

          analise_gaps = await analisarGapsApenas(dadosCandidato, dadosVaga);
          
          // Verificar desqualificação
          const verificacao = verificarDesqualificacao(analise_gaps);
          desqualificado = verificacao.desqualificado;
          motivos_desqualificacao = verificacao.motivos;

          atualizarEstado('analisando_gaps', 75, 
            `🎯 ${analise_gaps.total_gaps} GAP(s) identificado(s)`, {
            analise_gaps
          });

        } catch (err) {
          console.warn('Aviso: Análise de GAPs não disponível:', err);
          // Continua sem análise de GAPs
        }
      }

      // ETAPA 5: Salvar no Banco de Talentos (SEMPRE)
      atualizarEstado('salvando', 85, '💾 Salvando no Banco de Talentos...');
      
      const { pessoa_id, atualizado } = await salvarNoBancoTalentos(dados_extraidos, textoCV);

      // ETAPA 6: Concluído
      atualizarEstado('concluido', 100, 
        atualizado 
          ? `✅ Candidato atualizado: ${dados_extraidos.nome}` 
          : `✅ Novo candidato cadastrado: ${dados_extraidos.nome}`,
        {
          pessoa_id,
          cpf_existente: verificacaoCPF.existe,
          pessoa_atualizada: atualizado
        }
      );

      setLoading(false);

      return {
        sucesso: true,
        dados_extraidos,
        score_compatibilidade,
        analise_gaps,
        pessoa_id,
        cpf_existente: verificacaoCPF.existe,
        pessoa_atualizada: atualizado,
        desqualificado,
        motivos_desqualificacao
      };

    } catch (err: any) {
      console.error('❌ Erro na análise do CV:', err);
      
      atualizarEstado('erro', 0, `❌ Erro: ${err.message}`, {
        erro: err.message
      });
      
      setError(err.message);
      setLoading(false);
      
      return null;
    }
  }, [atualizarEstado]);

  // ============================================
  // CRIAR CANDIDATURA
  // ============================================

  const criarCandidatura = useCallback(async (
    vaga_id: string,
    pessoa_id: number,
    analista_id: number,
    dados_extraidos: DadosExtraidosCV,
    textoCV: string,
    observacoes?: string
  ): Promise<Candidatura | null> => {
    try {
      console.log('📝 Criando candidatura...');

      const candidaturaData = {
        vaga_id: parseInt(vaga_id),
        pessoa_id,
        candidato_nome: dados_extraidos.nome,
        candidato_email: dados_extraidos.email,
        candidato_cpf: dados_extraidos.cpf,
        analista_id,
        status: 'triagem',
        curriculo_texto: textoCV,
        observacoes: observacoes || 'Candidatura criada via importação de CV',
        criado_em: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('candidaturas')
        .insert(candidaturaData)
        .select()
        .single();

      if (error) throw error;

      console.log(`✅ Candidatura criada: ID ${data.id}`);

      return {
        id: String(data.id),
        vaga_id: String(data.vaga_id),
        pessoa_id: String(data.pessoa_id),
        candidato_nome: data.candidato_nome,
        candidato_email: data.candidato_email,
        candidato_cpf: data.candidato_cpf,
        analista_id: data.analista_id,
        status: data.status,
        curriculo_texto: data.curriculo_texto,
        observacoes: data.observacoes,
        criado_em: data.criado_em
      };

    } catch (err: any) {
      console.error('❌ Erro ao criar candidatura:', err);
      setError(`Erro ao criar candidatura: ${err.message}`);
      return null;
    }
  }, []);

  // ============================================
  // FUNÇÃO COMPLETA: ANALISAR E CRIAR CANDIDATURA
  // ============================================

  const analisarECriarCandidatura = useCallback(async (
    textoCV: string,
    vaga: Vaga,
    analista_id: number,
    observacoes?: string
  ): Promise<{
    resultado: ResultadoFinal;
    candidatura?: Candidatura;
  } | null> => {
    // 1. Analisar CV
    const resultado = await analisarCV(textoCV, vaga);
    
    if (!resultado || !resultado.sucesso) {
      return null;
    }

    // 2. Criar candidatura
    const candidatura = await criarCandidatura(
      vaga.id,
      resultado.pessoa_id,
      analista_id,
      resultado.dados_extraidos,
      textoCV,
      observacoes
    );

    if (candidatura) {
      resultado.candidatura_id = parseInt(candidatura.id);
    }

    return { resultado, candidatura: candidatura || undefined };
  }, [analisarCV, criarCandidatura]);

  // ============================================
  // HELPERS
  // ============================================

  function calcularAnosExperiencia(experiencias: any[]): number {
    if (!experiencias || experiencias.length === 0) return 0;

    let totalMeses = 0;
    const hoje = new Date();

    for (const exp of experiencias) {
      const inicio = exp.data_inicio ? new Date(exp.data_inicio) : null;
      const fim = exp.atual ? hoje : (exp.data_fim ? new Date(exp.data_fim) : hoje);

      if (inicio) {
        const meses = (fim.getFullYear() - inicio.getFullYear()) * 12 + (fim.getMonth() - inicio.getMonth());
        totalMeses += Math.max(0, meses);
      }
    }

    return Math.round(totalMeses / 12);
  }

  // ============================================
  // RETORNO DO HOOK
  // ============================================

  return {
    // Estado
    estado,
    loading,
    error,
    
    // Funções
    analisarCV,
    criarCandidatura,
    analisarECriarCandidatura,
    resetar,

    // Dados de conveniência
    dadosExtraidos: estado.dados_extraidos,
    scoreCompatibilidade: estado.score_compatibilidade,
    analiseGaps: estado.analise_gaps,
    pessoaId: estado.pessoa_id,
    cpfExistente: estado.cpf_existente,
    pessoaAtualizada: estado.pessoa_atualizada
  };
};

// ============================================
// EXPORT DEFAULT
// ============================================

export default useAnaliseCandidato;
