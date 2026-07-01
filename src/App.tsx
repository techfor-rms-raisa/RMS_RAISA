import React, { useState, useEffect, useCallback } from 'react';
import LoginScreen from './components/LoginScreen';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import ManageUsers from './components/ManageUsers';
import ManageClients from './components/ManageClients';
import ManageConsultants from './components/ManageConsultants';
import Analytics from './components/Analytics';
import RecommendationModule from './components/RecommendationModule';
import ExportModule from './components/ExportModule'; 
import ImportModule from './components/import/ImportModule'; 
import TemplateLibrary from './components/TemplateLibrary';
import ComplianceCampaigns from './components/ComplianceCampaigns';
import ComplianceDashboard from './components/ComplianceDashboard';
import FeedbackPortal from './components/FeedbackPortal';
import Quarentena from './components/Quarentena';
import AgendaAcompanhamento from './components/AgendaAcompanhamento';
import Sidebar from './components/layout/Sidebar'; 

// ✅ NOVO: Import do componente Movimentações
import MovimentacoesConsultores from './components/MovimentacoesConsultores';

// ✅ NOVO: Import do componente Posição Comercial
import PosicaoComercial from './components/PosicaoComercial';

// RAISA Imports
import Vagas from './components/raisa/Vagas';
import Candidaturas from './components/raisa/Candidaturas';
import AnaliseRisco from './components/raisa/AnaliseRisco';
import Pipeline from './components/raisa/Pipeline';
import BancoTalentos from './components/raisa/BancoTalentos_v3';
import ControleEnvios from './components/raisa/ControleEnvios'; 
import EntrevistaTecnica from './components/raisa/EntrevistaTecnica';
import EntrevistaTecnicaInteligente from './components/raisa/EntrevistaTecnicaInteligente';
// ✅ NOVO: Componente de Sugestões IA para Vagas
import VagaSugestoesIA from './components/raisa/VagaSugestoesIA';

// RAISA Dashboard Imports
import DashboardFunilConversao from './components/raisa/DashboardFunilConversao';
import DashboardAprovacaoReprovacao from './components/raisa/DashboardAprovacaoReprovacao';
import DashboardPerformanceAnalista from './components/raisa/DashboardPerformanceAnalista';
import DashboardPerformanceGeral from './components/raisa/DashboardPerformanceGeral';
import DashboardPerformanceCliente from './components/raisa/DashboardPerformanceCliente';
import DashboardAnaliseTempo from './components/raisa/DashboardAnaliseTempo';
import DashboardIndicacoes from './components/raisa/DashboardIndicacoes'; // 🆕 Dashboard de Indicações
// ✅ NOVO: Imports dos componentes faltantes (28/12/2024)
import LinkedInImportPanel from './components/linkedin/LinkedInImportPanel';
import DashboardMLLearning from './components/raisa/DashboardMLLearning';
import DashboardPerformanceIA from './components/raisa/DashboardPerformanceIA';
import DashboardRaisaMetrics from './components/raisa/DashboardRaisaMetrics';
// ✅ NOVO: Imports de Configuração e Distribuição (28/12/2024)
import { ConfiguracaoPriorizacaoDistribuicao } from './components/ConfiguracaoPriorizacaoDistribuicao';
import DistribuicaoIAPage from './components/raisa/DistribuicaoIAPage';
import ProspectSearchPage from './components/prospect/ProspectSearchPage';
import CreditosTab from './components/prospect/CreditosTab';
import CampanhaPrep from './components/prospect/CampanhaPrep';

// ============================================
// CRECI — Página de Corretores (BUGFIX 30/05/2026)
// O Sidebar navegava para 'creci_page' mas faltava o case
// no switch + import. Resultado: caía no default (Dashboard).
// ============================================
import CreciPage from './components/creci/CreciPage';

// ============================================
// CRM & CAMPANHAS (v60.0 — Fase 1A, 29/05/2026)
// Layout container com sub-navegação interna.
// Sub-páginas serão decompostas nas sub-fases 1B/1C/1D.
// ============================================
import CRMLayout from './components/crm/CRMLayout';
// 🆕 30/05/2026 — Sub-páginas promovidas a views próprias do menu lateral
import BaseLeadsPage from './components/crm/base-leads/BaseLeadsPage';
// 🆕 01/06/2026 — Fase 8 — Dashboard de Acompanhamento
import AcompanhamentoPage from './components/crm/acompanhamento/AcompanhamentoPage';
// 🆕 01/06/2026 — Configurações CRM (Tipos + Opt-out + placeholders Fase 5/6/7)
import ConfiguracoesPage from './components/crm/configuracoes/ConfiguracoesPage';
// 🆕 01/07/2026 — CRM E-mail (separação vs Base de Leads)
//   Container das 3 abas de comunicação por e-mail (CRM E-mail /
//   E-mails Inválidos / Opt-Out) que antes viviam dentro do BaseLeadsPage.
import CRMEmailPage from './components/crm/crm-email/CRMEmailPage';

// Atividades Imports
import AtividadesInserir from './components/atividades/AtividadesInserir';
import AtividadesConsultar from './components/atividades/AtividadesConsultar';
import AtividadesExportar from './components/atividades/AtividadesExportar';

// ============================================
// ✅ IMPORT DO PERMISSIONS PROVIDER
// ============================================
import { PermissionsProvider } from './hooks/usePermissions';

// ============================================
// ✅ IMPORT DO AUTH PROVIDER (28/12/2024)
// ============================================
import { AuthProvider } from './contexts/AuthContext';

import { useSupabaseData } from './hooks/useSupabaseData';
import { AIAnalysisResult, User, View, FeedbackResponse, RHAction, Vaga } from '@/types';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [simulatedToken, setSimulatedToken] = useState<string | null>(null);
  
  // Estados para navegação contextual
  const [contextualClient, setContextualClient] = useState<string>('');
  const [contextualConsultant, setContextualConsultant] = useState<string>('');

  // 🆕 v1.1: Menu mobile (drawer)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Fechar drawer ao navegar
  const handleMobileNavigate = (view: View) => {
    setCurrentView(view);
    setMobileMenuOpen(false);
  };

  // ✅ NOVO: Estado para modal de sugestões IA
  const [vagaParaSugestao, setVagaParaSugestao] = useState<Vaga | null>(null);

  // 🆕 v60.4 (Fase 7-MVP — 03/06/2026) — Deep link para abrir ficha de lead
  // diretamente a partir de URL com `?view=crm_base_leads&lead_id=N`.
  // Usado pelo e-mail de alerta de resposta (api/crm-webhook.ts) para levar
  // o gestor da campanha direto à ficha do lead que respondeu.
  //
  // Comportamento:
  //   1. Na montagem do App, lemos window.location.search uma única vez.
  //   2. Se houver `view` válida, setCurrentView para essa view.
  //   3. Se houver `lead_id` numérico, gravamos em deepLinkLeadId — passado
  //      como prop para BaseLeadsPage, que abre o drawer automaticamente.
  //   4. Limpamos a query string da URL com history.replaceState para
  //      evitar que o drawer reabra ao remontar/recarregar o componente.
  const [deepLinkLeadId, setDeepLinkLeadId] = useState<number | null>(null);

  useEffect(() => {
      console.log("ORBIT.ai V2.0 + RAISA Integrado Loaded");
  }, []);

  // 🆕 v60.4 — Parser de deep link (roda 1x na montagem)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const viewParam = params.get('view');
      const leadIdParam = params.get('lead_id');

      let alterouUrl = false;

      // Lista de views válidas que aceitamos via deep link. Mantemos restritiva
      // para evitar abertura de views internas via URL externa.
      const VIEWS_VALIDAS_DEEPLINK: View[] = [
        'crm_base_leads',
        'crm_acompanhamento',
        'crm_config',
        'crm',
        // 🆕 01/07/2026 — CRM E-mail (separação vs Base de Leads)
        'crm_email',
      ];

      if (viewParam && (VIEWS_VALIDAS_DEEPLINK as string[]).includes(viewParam)) {
        setCurrentView(viewParam as View);
        alterouUrl = true;
      }

      if (leadIdParam) {
        const lid = parseInt(leadIdParam, 10);
        if (!Number.isNaN(lid) && lid > 0) {
          setDeepLinkLeadId(lid);
          alterouUrl = true;
        }
      }

      // Limpa a query string sem disparar refresh (preserva pathname e hash).
      // Importante: sem isso, recarregar a página reabriria o drawer.
      if (alterouUrl) {
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname + window.location.hash,
        );
      }
    } catch (err) {
      console.warn('[App] Falha ao parsear deep link:', err);
    }
  }, []);

  // 🆕 Expor userId no window para o Plugin LinkedIn Chrome
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (currentUser) {
        (window as any).__RMS_USER_ID__ = currentUser.id;
        (window as any).__RMS_USER_NAME__ = currentUser.nome_usuario;
        console.log('🔗 [Plugin Support] User ID exposed:', currentUser.id);
      } else {
        // Tentar recuperar do localStorage
        const storedUserId = localStorage.getItem('userId');
        if (storedUserId) {
          (window as any).__RMS_USER_ID__ = parseInt(storedUserId);
          console.log('🔗 [Plugin Support] User ID recovered from localStorage:', storedUserId);
        }
      }
    }
  }, [currentUser]);
  
  const { 
    clients, consultants, users, usuariosCliente, coordenadoresCliente,
    templates, campaigns, feedbackResponses, rhActions,
    vagas, pessoas, candidaturas, // RAISA Data
    updateConsultantScore, processReportAnalysis, 
    loadConsultantReports, // 🔥 Lazy loading de relatórios
    deleteConsultantReport, // 🆕 v2.5: Exclusão de relatórios
    addClient, updateClient, batchAddClients,
    addConsultant, updateConsultant, batchAddConsultants,
    addUser, updateUser,
    addUsuarioCliente, updateUsuarioCliente, batchAddManagers,
    addCoordenadorCliente, updateCoordenadorCliente, batchAddCoordinators,
    migrateYearlyData,
    addTemplate, updateTemplate, deleteTemplate,
    addCampaign, updateCampaign,
    addFeedbackResponse, addRHAction, updateRHActionStatus, getRHActionsByConsultant,
    addVaga, updateVaga, deleteVaga, 
    addPessoa, updatePessoa, deletePessoa,
    addCandidatura, updateCandidaturaStatus,
    reload: loadAllData  // ✅ Função para carregar dados
  } = useSupabaseData();

  // ✅ Memoizar loadConsultantReports para evitar loops infinitos
  // ⚠️ Dependency array vazio: loadConsultantReports nunca muda, é sempre a mesma função
  const memoizedLoadConsultantReports = useCallback(loadConsultantReports, []);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    // 🆕 v58.4: SDR vai direto para Prospect — não tem acesso ao Dashboard RMS
    setCurrentView(user.tipo_usuario === 'SDR' ? 'prospect_search' : 'dashboard');
    // ✅ Carregar dados APÓS autenticação bem-sucedida
    loadAllData();
    
    // 🆕 Expor userId no window para o Plugin LinkedIn Chrome
    if (typeof window !== 'undefined') {
      (window as any).__RMS_USER_ID__ = user.id;
      (window as any).__RMS_USER_NAME__ = user.nome_usuario;
      console.log('🔗 [Plugin Support] User ID exposed:', user.id);
    }
  };
  
  const handleLogout = () => {
    setCurrentUser(null);
    setSimulatedToken(null);
    
    // 🆕 Limpar userId do window ao fazer logout
    if (typeof window !== 'undefined') {
      delete (window as any).__RMS_USER_ID__;
      delete (window as any).__RMS_USER_NAME__;
      console.log('🔗 [Plugin Support] User ID cleared');
    }
  };

  const handleNavigateToAtividades = (clientName?: string, consultantName?: string) => {
    if (clientName) setContextualClient(clientName);
    if (consultantName) setContextualConsultant(consultantName);
    setCurrentView('atividades_inserir');
  };

  const handleAnalysisComplete = (results: AIAnalysisResult[]) => {
      // 🆕 v2.4: Passa nome do usuário logado para rastreamento
      results.forEach(result => updateConsultantScore(result, undefined, currentUser?.nome_usuario));
  };

  // ============================================
  // ✅ CORREÇÃO DO BUG: Agora recebe e passa extractedMonth e extractedYear
  // ✅ v2.1: Salva texto original do relatório em 'content'
  // 🔧 v2.6: Aceita selectedConsultantName para digitação manual
  // ============================================
  const handleManualAnalysis = async (
    text: string, 
    gestorName?: string,
    extractedMonth?: number,  // ✅ NOVO PARÂMETRO
    extractedYear?: number,   // ✅ NOVO PARÂMETRO
    selectedConsultantName?: string // 🔧 v2.6: Nome do consultor selecionado via dropdown
  ) => {
      try {
          console.log('📊 Iniciando análise de relatórios...');
          
          // ✅ CORREÇÃO: Passa extractedMonth e extractedYear para processReportAnalysis
          if (extractedMonth) {
              console.log(`📅 Mês extraído recebido no App.tsx: ${extractedMonth}`);
          }
          if (extractedYear) {
              console.log(`📅 Ano extraído recebido no App.tsx: ${extractedYear}`);
          }
          
          // 🔧 v2.6: Se consultor foi selecionado via dropdown, usar nome direto
          if (selectedConsultantName) {
              console.log(`👤 Consultor selecionado manualmente: ${selectedConsultantName}`);
              
              // Chama a API para análise do texto
              const results = await processReportAnalysis(text, gestorName, extractedMonth, extractedYear);
              
              // Se a API não retornou resultados, perguntar ao usuário
              if (results.length === 0) {
                  const confirmar = window.confirm(
                      `⚠️ A IA não conseguiu gerar uma análise automática do texto.\n\n` +
                      `Deseja salvar o relatório com Score 3 (Médio) como padrão?\n\n` +
                      `Clique "OK" para salvar ou "Cancelar" para revisar o texto.`
                  );
                  
                  if (!confirmar) {
                      console.log('❌ Usuário cancelou - texto será revisado');
                      return; // Usuário vai revisar o texto
                  }
                  
                  console.log(`⚠️ Usuário confirmou score padrão 3 (Médio)`);
              }
              
              // Cria resultado com nome do consultor selecionado
              const finalResult: AIAnalysisResult = results.length > 0 
                  ? {
                      ...results[0],
                      consultantName: selectedConsultantName // 🔧 Usa nome selecionado
                  }
                  : {
                      // Resultado padrão quando usuário confirma
                      consultantName: selectedConsultantName,
                      managerName: gestorName || 'Não especificado',
                      reportMonth: extractedMonth || new Date().getMonth() + 1,
                      reportYear: extractedYear || new Date().getFullYear(),
                      riskScore: 3, // Score padrão "Médio" - mais conservador
                      summary: `Relatório manual: ${text.substring(0, 150)}${text.length > 150 ? '...' : ''}`,
                      negativePattern: null,
                      predictiveAlert: null,
                      recommendations: [],
                      details: text
                  };
              
              if (results.length > 0) {
                  console.log(`✅ Análise IA concluída. Score: ${finalResult.riskScore}`);
              }
              
              await updateConsultantScore(finalResult, text, currentUser?.nome_usuario);
              alert(`✅ Análise concluída com sucesso!\n\n1 consultor(es) atualizado(s).\n\nVerifique o Dashboard para ver os resultados.`);
              return;
          }
          
          const results = await processReportAnalysis(text, gestorName, extractedMonth, extractedYear);
          
          if (results.length === 0) {
              alert('⚠️ Nenhum relatório válido encontrado. Verifique o formato do arquivo.');
              return;
          }
          
          console.log(`✅ ${results.length} relatório(s) analisado(s). Atualizando consultores...`);
          
          // ✅ CORREÇÃO v2.1: Atualizar score de cada consultor passando o texto original
          // 🆕 v2.4: Passa nome do usuário logado para rastreamento
          for (const result of results) {
              await updateConsultantScore(result, text, currentUser?.nome_usuario);
          }
          
          alert(`✅ Análise concluída com sucesso!\n\n${results.length} consultor(es) atualizado(s).\n\nVerifique o Dashboard para ver os resultados.`);
      } catch (error) {
          console.error("❌ Erro na análise manual:", error);
          throw error; 
      }
  };
  
  // ============================================
  // 🆕 v3.0 (11/04/2026): DirectSave — salva com risco eleito pelo analista
  // Chamado pelo AtividadesInserir após o analista confirmar a análise bifásica
  // ============================================
  const handleDirectSave = async (
    aiResult: Record<string, any>,
    rawText: string,
    confidencial: boolean,
    riscoAnalista: number,
    consultantName: string,
    gestorName: string,
    month: number,
    year: number
  ) => {
    try {
      console.log(
        `💾 [DirectSave] ${consultantName} | Risco analista: ${riscoAnalista} | Confidencial: ${confidencial}`
      );

      // Montar AIAnalysisResult com risco eleito pelo analista (sobrescreve a IA)
      const finalResult: AIAnalysisResult = {
        consultantName,
        managerName: gestorName,
        reportMonth: month,
        reportYear: year,
        riskScore: riscoAnalista, // ← Risco do analista, não da IA
        summary:
          aiResult.summary ||
          `Relatório manual: ${rawText.substring(0, 150)}${rawText.length > 150 ? '...' : ''}`,
        negativePattern: aiResult.negativePattern || null,
        predictiveAlert: aiResult.predictiveAlert || null,
        recommendations: aiResult.recommendations || [],
        details: rawText,
      };

      // Salvar via mecanismo existente (updateConsultantScore)
      await updateConsultantScore(finalResult, rawText, currentUser?.nome_usuario);

      // Atualizar campos meta (confidencial + risco_analista) via endpoint dedicado
      // Não-bloqueante: falha aqui não impede o save principal
      const consultant = consultants.find(c => c.nome_consultores === consultantName);
      if (consultant?.id) {
        try {
          const metaRes = await fetch('/api/update-report-meta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              consultant_id: consultant.id,
              month,
              year,
              confidencial,
              risco_analista: riscoAnalista,
            }),
          });
          if (metaRes.ok) {
            console.log(`[DirectSave] ✅ Meta atualizada para ${consultantName}`);
          }
        } catch (metaErr) {
          console.warn('[DirectSave] Meta update não-crítica falhou:', metaErr);
        }
      }

      console.log(`✅ [DirectSave] Concluído — ${consultantName}`);
    } catch (error) {
      console.error('❌ [DirectSave] Erro ao salvar:', error);
      throw error;
    }
  };

  const handleSimulateLink = (token: string) => {
      setSimulatedToken(token);
      setCurrentView('feedback_portal');
  };

  const handleFeedbackSubmit = (response: FeedbackResponse, action?: RHAction) => {
      addFeedbackResponse(response);
      if (action) addRHAction(action);
  };

  // ✅ NOVO: Handler para entrevista completa
  const handleEntrevistaCompleta = (candidaturaId: number, resultado: 'aprovado' | 'reprovado') => {
    console.log(`✅ Entrevista finalizada: Candidatura ${candidaturaId} - ${resultado}`);
    // Atualizar status da candidatura no estado local
    updateCandidaturaStatus(String(candidaturaId), resultado === 'aprovado' ? 'aprovado_interno' : 'reprovado_interno');
  };

  // ✅ NOVO: Handler para aplicar sugestões da IA na vaga
  const handleAplicarSugestoes = (vagaAtualizada: Partial<Vaga>) => {
    if (vagaParaSugestao) {
      updateVaga({ ...vagaParaSugestao, ...vagaAtualizada } as Vaga);
      setVagaParaSugestao(null);
    }
  };

  const renderContent = () => {
    if (currentView === 'feedback_portal' && simulatedToken) {
        return <FeedbackPortal token={simulatedToken} onSubmit={handleFeedbackSubmit} onClose={() => { setSimulatedToken(null); setCurrentView('campaigns'); }} />;
    }

    switch (currentView) {
      // RMS Views
      case 'users':
        return <ManageUsers users={users} addUser={addUser} updateUser={updateUser} currentUser={currentUser!} migrateYearlyData={migrateYearlyData} />;
      case 'clients':
        return <ManageClients clients={clients} users={users} usuariosCliente={usuariosCliente} coordenadoresCliente={coordenadoresCliente} consultants={consultants} addClient={addClient} updateClient={updateClient} addUsuarioCliente={addUsuarioCliente} updateUsuarioCliente={updateUsuarioCliente} addCoordenadorCliente={addCoordenadorCliente} updateCoordenadorCliente={updateCoordenadorCliente} currentUser={currentUser!} />;
      case 'consultants':
        return <ManageConsultants consultants={consultants} usuariosCliente={usuariosCliente} clients={clients} coordenadoresCliente={coordenadoresCliente} users={users} addConsultant={addConsultant} updateConsultant={updateConsultant} currentUser={currentUser!} onNavigateToAtividades={handleNavigateToAtividades} />;
      case 'quarantine':
        return <Quarentena consultants={consultants} clients={clients} usuariosCliente={usuariosCliente} coordenadoresCliente={coordenadoresCliente} currentUser={currentUser!} users={users} loadConsultantReports={loadConsultantReports} onNavigateToAtividades={handleNavigateToAtividades} onNavigateToRecommendations={(consultant) => { setContextualConsultant(consultant.nome_consultores); setCurrentView('recommendations'); }} />;
      case 'recommendations':
        return <RecommendationModule consultants={consultants} clients={clients} usuariosCliente={usuariosCliente} coordenadoresCliente={coordenadoresCliente} users={users} loadConsultantReports={loadConsultantReports} onNavigateToAtividades={handleNavigateToAtividades} />;
      case 'agenda_acompanhamento':
        return <AgendaAcompanhamento
          consultants={consultants}
          clients={clients}
          users={users}
          usuariosCliente={usuariosCliente}
          coordenadoresCliente={coordenadoresCliente}
          currentUser={currentUser!}
          loadConsultantReports={loadConsultantReports}
          onNavigateToAtividades={handleNavigateToAtividades}
        />;
      case 'analytics':
        return <Analytics consultants={consultants} clients={clients} usuariosCliente={usuariosCliente} users={users} />;
      
      // ✅ NOVO: Movimentações de Consultores
      case 'movimentacoes':
        return <MovimentacoesConsultores />;
      
      // ✅ NOVO: Posição Comercial
      case 'posicao_comercial':
        return <PosicaoComercial />;
      
      case 'export': 
        return <ExportModule consultants={consultants} clients={clients} usuariosCliente={usuariosCliente} users={users} />;
      case 'import':
        return <ImportModule users={users} clients={clients} managers={usuariosCliente} coordinators={coordenadoresCliente} batchAddClients={batchAddClients} batchAddManagers={batchAddManagers} batchAddCoordinators={batchAddCoordinators} batchAddConsultants={batchAddConsultants} />;
      case 'templates':
          return <TemplateLibrary templates={templates} currentUser={currentUser!} addTemplate={addTemplate} updateTemplate={updateTemplate} deleteTemplate={deleteTemplate} />;
      case 'campaigns':
          return <ComplianceCampaigns campaigns={campaigns} templates={templates} consultants={consultants} addCampaign={addCampaign} onSimulateLink={handleSimulateLink} />;
      
      // ✅ CORRIGIDO: Apenas um return com consultants como prop
      case 'compliance_dashboard':
          return <ComplianceDashboard 
              rhActions={rhActions} 
              feedbackResponses={feedbackResponses} 
              consultants={consultants}
              onUpdateRHActionStatus={updateRHActionStatus}
          />;
      
      // Atividades Views
      case 'atividades_inserir':
          return <AtividadesInserir 
            clients={clients} 
            consultants={consultants} 
            usuariosCliente={usuariosCliente}
            coordenadoresCliente={coordenadoresCliente}
            allReports={consultants.flatMap(c => c.consultant_reports || [])}
            loadConsultantReports={loadConsultantReports}
            onManualReport={handleManualAnalysis}
            onDirectSave={handleDirectSave}
            preSelectedClient={contextualClient}
            preSelectedConsultant={contextualConsultant}
            usuariosRMS={users}
            currentUserName={currentUser?.nome_usuario}
          />;
      case 'atividades_consultar':
          return <AtividadesConsultar 
            clients={clients} 
            consultants={consultants} 
            usuariosCliente={usuariosCliente} 
            loadConsultantReports={memoizedLoadConsultantReports}
            deleteConsultantReport={deleteConsultantReport}
            currentUserTipo={currentUser?.tipo_usuario}
          />;
      case 'atividades_exportar':
          return <AtividadesExportar clients={clients} consultants={consultants} usuariosCliente={usuariosCliente} users={users} loadConsultantReports={memoizedLoadConsultantReports} />;
      
      // ============================================
      // RAISA Views - ✅ INTEGRADO COM SUPABASE
      // ============================================
      case 'vagas':
          // ✅ v56.0: Adicionado users para select de Gestão Comercial
          return <Vagas 
            vagas={vagas} 
            clients={clients} 
            usuariosCliente={usuariosCliente}
            users={users}
            addVaga={addVaga} 
            updateVaga={updateVaga} 
            deleteVaga={deleteVaga} 
          />;
      case 'candidaturas':
          // ✅ v55.0: Adicionado filtro por cliente + análise de adequação
          return <Candidaturas 
            candidaturas={candidaturas} 
            vagas={vagas} 
            pessoas={pessoas}
            clientes={clients} // 🆕 Lista de clientes para filtro
            updateStatus={updateCandidaturaStatus}
            onReload={loadAllData}
            currentUserId={currentUser?.id || 1}
            currentUserName={currentUser?.nome_usuario}
          />;
      case 'analise_risco':
          return <AnaliseRisco />;
      case 'pipeline':
          return <Pipeline candidaturas={candidaturas} vagas={vagas} pessoas={pessoas} />;
      case 'talentos':
          return <BancoTalentos pessoas={pessoas} addPessoa={addPessoa} updatePessoa={updatePessoa} deletePessoa={deletePessoa} onRefresh={loadAllData} />;
      
      // ✅ ATUALIZADO: ControleEnvios com props corretas (integrado Supabase)
      case 'controle_envios':
          return <ControleEnvios currentUser={currentUser!} />;
      
      // ✅ ATUALIZADO: EntrevistaTecnicaInteligente com upload de áudio e transcrição IA
      case 'entrevista_tecnica':
          return <EntrevistaTecnicaInteligente 
            candidaturas={candidaturas}
            vagas={vagas}
            currentUserId={currentUser?.id || 1}
            onEntrevistaCompleta={handleEntrevistaCompleta}
          />;
      
      // RAISA Dashboard Views
      case 'dashboard_funil':
          return <DashboardFunilConversao />;
      case 'dashboard_aprovacao':
          return <DashboardAprovacaoReprovacao />;
      case 'dashboard_analistas':
          return <DashboardPerformanceAnalista />;
      case 'dashboard_geral':
          return <DashboardPerformanceGeral />;
      case 'dashboard_clientes':
          return <DashboardPerformanceCliente />;
      case 'dashboard_tempo':
          return <DashboardAnaliseTempo />;
      case 'dashboard_indicacoes':  // 🆕 Dashboard de Indicações
          return <DashboardIndicacoes />;
      
      // ✅ NOVO (28/12/2024): Rotas que faltavam
      case 'linkedin_import':
          return <LinkedInImportPanel userId={currentUser?.id || 1} />;
      case 'dashboard_ml':
          return <DashboardMLLearning />;
      case 'dashboard_performance_ia':
          return <DashboardPerformanceIA />;
      case 'dashboard_raisa_metrics':
          return <DashboardRaisaMetrics />;
      
      // ✅ NOVO: Rotas de Configuração e Distribuição (28/12/2024)
      case 'configuracao_priorizacao':
          return <ConfiguracaoPriorizacaoDistribuicao />;
      case 'distribuicao_ia':
          return <DistribuicaoIAPage />;

      // ============================================
      // PROSPECT Views — Prospecção B2B
      // ============================================
      case 'prospect_search':
          return <ProspectSearchPage />;
      case 'prospect_list':
          return <ProspectSearchPage initialTab="salvos" />;
      case 'prospect_campaign':
          return <CampanhaPrep currentUser={currentUser!} />;
      case 'prospect_credits':
          return <CreditosTab />;

      // ============================================
      // CRM & CAMPANHAS — v60.0 (Fase 1A)
      // Layout container com sub-navegação interna
      // ============================================
      case 'crm':
          return <CRMLayout currentUser={currentUser!} />;

      // ============================================
      // 🆕 30/05/2026 — Sub-páginas do CRM promovidas a views próprias
      // ============================================
      case 'crm_base_leads':
          // 🆕 v60.4 (Fase 7-MVP) — deepLinkLeadId vem do parser de URL no topo
          // do App.tsx. Quando presente, BaseLeadsPage seta a aba 'leads' e
          // abre o drawer de detalhe automaticamente. onDeepLinkConsumed limpa
          // o state após a consumação, evitando reabertura ao re-render.
          return (
            <div className="space-y-6">
              <BaseLeadsPage
                currentUser={currentUser!}
                deepLinkLeadId={deepLinkLeadId}
                onDeepLinkConsumed={() => setDeepLinkLeadId(null)}
              />
            </div>
          );

      case 'crm_acompanhamento':
          // 🆕 01/06/2026 — Fase 8: substitui o placeholder pela página real.
          return (
            <div className="space-y-6">
              <AcompanhamentoPage currentUser={currentUser!} />
            </div>
          );

      case 'crm_config':
          // 🆕 01/06/2026 — substitui o placeholder pela página real.
          return (
            <div className="space-y-6">
              <ConfiguracoesPage currentUser={currentUser!} />
            </div>
          );

      // ============================================
      // 🆕 01/07/2026 — CRM E-mail (separação vs Base de Leads)
      // ============================================
      // Container das 3 abas de comunicação por e-mail (CRM E-mail,
      // E-mails Inválidos, Opt-Out). Recebe callback para abrir lead
      // no BaseLeadsPage via deep link (Opção A — 01/07/2026).
      case 'crm_email':
          return (
            <div className="space-y-6">
              <CRMEmailPage
                currentUser={currentUser!}
                onAbrirLeadEmBase={(leadId: number) => {
                  setDeepLinkLeadId(leadId);
                  setCurrentView('crm_base_leads');
                }}
              />
            </div>
          );

      // ============================================
      // CRECI — Corretores de Imóveis (BUGFIX 30/05/2026)
      // ============================================
      case 'creci_page':
          return <CreciPage currentUser={currentUser ?? undefined} />;

      case 'dashboard':
      default:
        // 🆕 v58.4: SDR não tem acesso ao Dashboard RMS — redireciona para Prospect
        if (currentUser?.tipo_usuario === 'SDR') {
          return <ProspectSearchPage />;
        }
        return <Dashboard 
          consultants={consultants} 
          clients={clients} 
          usuariosCliente={usuariosCliente} 
          coordenadoresCliente={coordenadoresCliente} 
          users={users} 
          currentUser={currentUser!} 
          loadConsultantReports={loadConsultantReports}
          deleteConsultantReport={deleteConsultantReport} // 🆕 v2.5
          onNavigateToAtividades={handleNavigateToAtividades}
          getRHActionsByConsultant={getRHActionsByConsultant}
          rhActions={rhActions}
        />;
    }
  };

  if (!currentUser && currentView !== 'feedback_portal') {
    return <LoginScreen onLogin={handleLogin} users={users} updateUser={updateUser} />;
  }

  if (currentView === 'feedback_portal') {
      return renderContent();
  }

  // ============================================
  // ✅ ENVOLVA TODO O RETURN COM <PermissionsProvider>
  // ✅ NOVO (28/12/2024): Adicionado AuthProvider
  // ============================================
  return (
    <AuthProvider initialUser={currentUser}>
      <PermissionsProvider>
        <div className="min-h-screen bg-gray-100 flex flex-col overflow-hidden">
          
          {/* ── HEADER com botão hamburguer mobile */}
          <div className="flex-shrink-0">
            {/* Botão hamburguer — visível apenas em mobile (md:hidden) */}
            <div className="md:hidden flex items-center bg-[#2D2D2D] px-3 py-2 gap-3">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="text-white p-2 rounded-lg hover:bg-gray-700 transition"
                aria-label="Abrir menu"
              >
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <rect y="3" width="22" height="2.5" rx="1.25" fill="white"/>
                  <rect y="9.75" width="22" height="2.5" rx="1.25" fill="white"/>
                  <rect y="16.5" width="22" height="2.5" rx="1.25" fill="white"/>
                </svg>
              </button>
              <span className="text-white font-bold text-sm tracking-wider">
                <span className="text-orange-500 mr-1">⭕</span> RMS-RAISA.ai
              </span>
            </div>
            <Header currentUser={currentUser!} onLogout={handleLogout} />
          </div>

          {/* ── DRAWER MOBILE — overlay + sidebar deslizante */}
          {mobileMenuOpen && (
            <div className="fixed inset-0 z-50 md:hidden flex">
              {/* Overlay escuro */}
              <div
                className="fixed inset-0 bg-black/60"
                onClick={() => setMobileMenuOpen(false)}
              />
              {/* Painel do menu */}
              <div className="relative z-10 w-[260px] h-full bg-[#2D2D2D] flex flex-col overflow-y-auto shadow-2xl">
                {/* Cabeçalho do drawer */}
                <div className="flex items-center justify-between px-4 py-4 border-b border-gray-700">
                  <span className="text-white font-bold tracking-widest text-sm">
                    <span className="text-orange-500 mr-1">⭕</span> RMS-RAISA.ai
                  </span>
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-gray-400 hover:text-white transition p-1"
                    aria-label="Fechar menu"
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M1 1L17 17M17 1L1 17" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
                {/* Sidebar reutilizada — modo drawer, passa handleMobileNavigate */}
                <div className="flex-1">
                  <Sidebar
                    currentUser={currentUser!}
                    currentView={currentView}
                    onNavigate={handleMobileNavigate}
                    isMobileDrawer={true}
                  />
                </div>
                {/* Info do usuário no rodapé */}
                <div className="px-4 py-3 border-t border-gray-700 text-xs text-gray-400">
                  <p className="font-medium text-gray-300 truncate">{currentUser!.nome_usuario}</p>
                  <p className="truncate">{currentUser!.tipo_usuario}</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-1 overflow-hidden">
            <Sidebar 
                currentUser={currentUser!}
                currentView={currentView}
                onNavigate={setCurrentView}
            />
            <main className="flex-1 p-4 md:p-8 overflow-auto bg-gray-100 relative">
                {renderContent()}
            </main>
          </div>

          {/* ✅ NOVO: Modal de Sugestões IA para Vagas */}
          {vagaParaSugestao && currentUser && (
            <VagaSugestoesIA
              vaga={vagaParaSugestao}
              onClose={() => setVagaParaSugestao(null)}
              onAplicarSugestoes={handleAplicarSugestoes}
              currentUserId={currentUser.id}
            />
          )}
        </div>
      </PermissionsProvider>
    </AuthProvider>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// 🆕 30/05/2026 — CrmPlaceholderPage
// Componente standalone reutilizado pelas sub-páginas do CRM que ainda
// estão em backlog (Acompanhamento, Configurações). Mesmo visual do
// placeholder antigo do CRMLayout, mas como página independente.
// ════════════════════════════════════════════════════════════════════════════

interface CrmPlaceholderPageProps {
  titulo: string;
  descricao: string;
  icon: string;
  fase: string;
  previsao: string;
}

const CrmPlaceholderPage: React.FC<CrmPlaceholderPageProps> = ({
  titulo,
  descricao,
  icon,
  fase,
  previsao,
}) => (
  <div className="space-y-6">
    <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
          <i className={`${icon} text-blue-600 text-xl`}></i>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{titulo}</h1>
          <p className="text-sm text-gray-500">{descricao}</p>
        </div>
      </div>
    </div>

    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
        <i className={`${icon} text-gray-400 text-2xl`}></i>
      </div>
      <h2 className="text-lg font-semibold text-gray-700 mb-1">{titulo}</h2>
      <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">{descricao}</p>

      <div className="inline-block px-4 py-3 rounded-lg bg-blue-50 border border-blue-100 text-left max-w-md">
        <div className="flex items-center gap-2 mb-1">
          <i className="fa-solid fa-clock-rotate-left text-blue-500 text-sm"></i>
          <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
            Entrega prevista — {fase}
          </span>
        </div>
        <p className="text-sm text-blue-900">{previsao}</p>
      </div>
    </div>
  </div>
);

export default App;
