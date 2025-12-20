/**
 * useSupabaseData Hook - ORQUESTRADOR PRINCIPAL
 * Combina todos os hooks modulares para manter compatibilidade com o código existente
 * 
 * Versão: 3.0 - Modularizado
 * 
 * ESTRUTURA DE MÓDULOS:
 * - useUsers: Gerenciamento de usuários (app_users)
 * - useClients: Gerenciamento de clientes
 * - useGestoresCliente: Gestores de clientes (usuarios_cliente)
 * - useCoordenadoresCliente: Coordenadores de clientes
 * - useConsultants: Consultores + lazy loading de relatórios
 * - useTemplates: Templates de email
 * - useCampaigns: Campanhas de compliance
 * - useVagas: Vagas (RAISA)
 * - usePessoas: Banco de talentos (RAISA)
 * - useCandidaturas: Candidaturas (RAISA)
 * - useReportAnalysis: Análise de relatórios com IA
 */

import { useState, useEffect } from 'react';

// Importar todos os hooks modulares
import { useUsers } from './supabase/useUsers';
import { useClients } from './supabase/useClients';
import { useGestoresCliente } from './supabase/useGestoresCliente';
import { useCoordenadoresCliente } from './supabase/useCoordenadoresCliente';
import { useConsultants } from './supabase/useConsultants';
import { useTemplates } from './supabase/useTemplates';
import { useCampaigns } from './supabase/useCampaigns';
import { useVagas } from './supabase/useVagas';
import { usePessoas } from './supabase/usePessoas';
import { useCandidaturas } from './supabase/useCandidaturas';
import { useReportAnalysis } from './supabase/useReportAnalysis';

import { AIAnalysisResult } from '@/types';

export const useSupabaseData = () => {
  // ============================================
  // ESTADO GLOBAL
  // ============================================
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ============================================
  // HOOKS MODULARES
  // ============================================
  
  const usersHook = useUsers();
  const clientsHook = useClients();
  const gestoresHook = useGestoresCliente();
  const coordenadoresHook = useCoordenadoresCliente();
  const consultantsHook = useConsultants();
  const templatesHook = useTemplates();
  const campaignsHook = useCampaigns();
  const vagasHook = useVagas();
  const pessoasHook = usePessoas();
  const candidaturasHook = useCandidaturas();
  const reportAnalysisHook = useReportAnalysis();

  // ============================================
  // CARREGAR DADOS INICIAIS
  // ============================================

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('🔄 Carregando TODOS os dados do Supabase...');
      
      // Usar Promise.allSettled para continuar mesmo se algumas tabelas falharem
      const results = await Promise.allSettled([
        usersHook.loadUsers(),
        clientsHook.loadClients(),
        consultantsHook.loadConsultants(),
        gestoresHook.loadUsuariosCliente(),
        coordenadoresHook.loadCoordenadoresCliente(),
        templatesHook.loadTemplates(),
        campaignsHook.loadCampaigns(),
        vagasHook.loadVagas(),
        pessoasHook.loadPessoas(),
        candidaturasHook.loadCandidaturas()
      ]);
      
      // Verificar quais carregamentos falharam
      const names = [
        'Users', 'Clients', 'Consultants', 'UsuariosCliente', 
        'CoordenadoresCliente', 'Templates', 'Campaigns', 
        'Vagas', 'Pessoas', 'Candidaturas'
      ];
      
      const failures = results
        .map((result, index) => {
          if (result.status === 'rejected') {
            console.warn(`⚠️ Falha ao carregar ${names[index]}:`, result.reason);
            return names[index];
          }
          return null;
        })
        .filter(Boolean);
      
      if (failures.length > 0) {
        console.warn(`⚠️ ${failures.length} tabela(s) falharam ao carregar: ${failures.join(', ')}`);
        if (failures.length < 10) {
          setError(null); // Continuar mesmo com falhas parciais
        }
      }
      
      console.log('✅ Carregamento de dados concluído!');
      setLoading(false);
    } catch (err: any) {
      console.error('❌ Erro crítico ao carregar dados:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  // ============================================
  // WRAPPER PARA updateConsultantScore
  // ============================================
  
  const updateConsultantScore = async (result: AIAnalysisResult) => {
    return reportAnalysisHook.updateConsultantScore(
      result,
      consultantsHook.consultants,
      consultantsHook.setConsultants,
      usersHook.users,
      gestoresHook.usuariosCliente,
      clientsHook.clients
    );
  };

  // ============================================
  // RETURN - COMPATIBILIDADE TOTAL COM VERSÃO ANTERIOR
  // ============================================

  return {
    // Estado Global
    loading,
    error,

    // Usuários (✅ Completo)
    users: usersHook.users,
    addUser: usersHook.addUser,
    updateUser: usersHook.updateUser,

    // Clientes (✅ Completo)
    clients: clientsHook.clients,
    addClient: clientsHook.addClient,
    updateClient: clientsHook.updateClient,
    batchAddClients: clientsHook.batchAddClients,

    // Consultores (✅ Completo)
    consultants: consultantsHook.consultants,
    addConsultant: consultantsHook.addConsultant,
    updateConsultant: consultantsHook.updateConsultant,
    batchAddConsultants: consultantsHook.batchAddConsultants,
    inactivateConsultant: consultantsHook.inactivateConsultant,
    loadConsultantReports: consultantsHook.loadConsultantReports,

    // Gestores de Clientes (✅ Completo)
    usuariosCliente: gestoresHook.usuariosCliente,
    loadUsuariosCliente: gestoresHook.loadUsuariosCliente,
    addUsuarioCliente: gestoresHook.addUsuarioCliente,
    updateUsuarioCliente: gestoresHook.updateUsuarioCliente,
    batchAddManagers: gestoresHook.batchAddManagers,
    inactivateGestor: gestoresHook.inactivateGestor,

    // Coordenadores de Clientes (✅ Completo)
    coordenadoresCliente: coordenadoresHook.coordenadoresCliente,
    loadCoordenadoresCliente: coordenadoresHook.loadCoordenadoresCliente,
    addCoordenadorCliente: coordenadoresHook.addCoordenadorCliente,
    updateCoordenadorCliente: coordenadoresHook.updateCoordenadorCliente,
    batchAddCoordinators: coordenadoresHook.batchAddCoordinators,
    inactivateCoordenador: coordenadoresHook.inactivateCoordenador,

    // Templates (✅ Completo)
    templates: templatesHook.templates,
    addTemplate: templatesHook.addTemplate,
    updateTemplate: templatesHook.updateTemplate,
    deleteTemplate: templatesHook.deleteTemplate,

    // Campanhas (✅ Completo)
    campaigns: campaignsHook.campaigns,
    addCampaign: campaignsHook.addCampaign,
    updateCampaign: campaignsHook.updateCampaign,
    feedbackResponses: campaignsHook.feedbackResponses,
    addFeedbackResponse: campaignsHook.addFeedbackResponse,
    rhActions: campaignsHook.rhActions,
    addRHAction: campaignsHook.addRHAction,

    // RAISA - Vagas (✅ Completo)
    vagas: vagasHook.vagas,
    addVaga: vagasHook.addVaga,
    updateVaga: vagasHook.updateVaga,
    deleteVaga: vagasHook.deleteVaga,

    // RAISA - Pessoas (✅ Completo)
    pessoas: pessoasHook.pessoas,
    addPessoa: pessoasHook.addPessoa,
    updatePessoa: pessoasHook.updatePessoa,

    // RAISA - Candidaturas (✅ Completo)
    candidaturas: candidaturasHook.candidaturas,
    addCandidatura: candidaturasHook.addCandidatura,
    updateCandidaturaStatus: candidaturasHook.updateCandidaturaStatus,

    // Análise de Relatórios (✅ Completo)
    processReportAnalysis: reportAnalysisHook.processReportAnalysis,
    updateConsultantScore,
    migrateYearlyData: reportAnalysisHook.migrateYearlyData,

    // Função para recarregar dados
    reload: loadAllData
  };
};
