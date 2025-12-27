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
import Sidebar from './components/layout/Sidebar'; 

// ✅ Componentes RMS Novos
import MovimentacoesConsultores from './components/MovimentacoesConsultores';
import PosicaoComercial from './components/PosicaoComercial';

// RAISA Imports
import Vagas from './components/raisa/Vagas';
import Candidaturas from './components/raisa/Candidaturas';
import AnaliseRisco from './components/raisa/AnaliseRisco';
import Pipeline from './components/raisa/Pipeline';
import BancoTalentos from './components/raisa/BancoTalentos';
import ControleEnvios from './components/raisa/ControleEnvios'; 
import EntrevistaTecnica from './components/raisa/EntrevistaTecnica';
import VagaSugestoesIA from './components/raisa/VagaSugestoesIA';

// ✅ NOVO: LinkedIn Import Panel (Fase 7)
import LinkedInImportPanel from './components/raisa/LinkedInImportPanel';

// RAISA Dashboard Imports
import DashboardFunilConversao from './components/raisa/DashboardFunilConversao';
import DashboardAprovacaoReprovacao from './components/raisa/DashboardAprovacaoReprovacao';
import DashboardPerformanceAnalista from './components/raisa/DashboardPerformanceAnalista';
import DashboardPerformanceGeral from './components/raisa/DashboardPerformanceGeral';
import DashboardPerformanceCliente from './components/raisa/DashboardPerformanceCliente';
import DashboardAnaliseTempo from './components/raisa/DashboardAnaliseTempo';

// ✅ NOVO: Dashboards IA (Fases 6 e 7)
import DashboardMLLearning from './components/raisa/DashboardMLLearning';
import DashboardPerformanceIA from './components/raisa/DashboardPerformanceIA';
import DashboardRaisaMetrics from './components/raisa/DashboardRaisaMetrics';

// Atividades Imports
import AtividadesInserir from './components/atividades/AtividadesInserir';
import AtividadesConsultar from './components/atividades/AtividadesConsultar';
import AtividadesExportar from './components/atividades/AtividadesExportar';

// ============================================
// ✅ IMPORT DO PERMISSIONS PROVIDER
// ============================================
import { PermissionsProvider } from './hooks/usePermissions';

import { useSupabaseData } from './hooks/useSupabaseData';
import { AIAnalysisResult, User, View, FeedbackResponse, RHAction, Vaga } from './types/types_index';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [simulatedToken, setSimulatedToken] = useState<string | null>(null);
  
  // Estados para navegação contextual
  const [contextualClient, setContextualClient] = useState<string>('');
  const [contextualConsultant, setContextualConsultant] = useState<string>('');

  // Estado para modal de sugestões IA
  const [vagaParaSugestao, setVagaParaSugestao] = useState<Vaga | null>(null);

  useEffect(() => {
      console.log("ORBIT.ai V2.0 + RAISA Integrado Loaded");
  }, []);
  
  const { 
    clients, consultants, users, usuariosCliente, coordenadoresCliente,
    templates, campaigns, feedbackResponses, rhActions,
    vagas, pessoas, candidaturas,
    updateConsultantScore, processReportAnalysis, 
    loadConsultantReports,
    addClient, updateClient, batchAddClients,
    addConsultant, updateConsultant, batchAddConsultants,
    addUser, updateUser,
    addUsuarioCliente, updateUsuarioCliente, batchAddManagers,
    addCoordenadorCliente, updateCoordenadorCliente, batchAddCoordinators,
    migrateYearlyData,
    addTemplate, updateTemplate, deleteTemplate,
    addCampaign, updateCampaign,
    addFeedbackResponse, addRHAction,
    addVaga, updateVaga, deleteVaga, 
    addPessoa, updatePessoa,
    addCandidatura, updateCandidaturaStatus,
    reload: loadAllData
  } = useSupabaseData();

  const memoizedLoadConsultantReports = useCallback(loadConsultantReports, []);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    setCurrentView('dashboard');
    loadAllData();
  };
  
  const handleLogout = () => {
    setCurrentUser(null);
    setSimulatedToken(null);
  };

  const handleNavigateToAtividades = (clientName?: string, consultantName?: string) => {
    if (clientName) setContextualClient(clientName);
    if (consultantName) setContextualConsultant(consultantName);
    setCurrentView('atividades_inserir');
  };

  const handleAnalysisComplete = (results: AIAnalysisResult[]) => {
      results.forEach(result => updateConsultantScore(result));
  };

  const handleManualAnalysis = async (
    text: string, 
    gestorName?: string,
    extractedMonth?: number,
    extractedYear?: number
  ) => {
      try {
          console.log('📊 Iniciando análise de relatórios...');
          
          if (extractedMonth) {
              console.log(`📅 Mês extraído recebido no App.tsx: ${extractedMonth}`);
          }
          if (extractedYear) {
              console.log(`📅 Ano extraído recebido no App.tsx: ${extractedYear}`);
          }
          
          const results = await processReportAnalysis(text, gestorName, extractedMonth, extractedYear);
          
          if (results.length === 0) {
              alert('⚠️ Nenhum relatório válido encontrado. Verifique o formato do arquivo.');
              return;
          }
          
          console.log(`✅ ${results.length} relatório(s) analisado(s). Atualizando consultores...`);
          
          for (const result of results) {
              await updateConsultantScore(result, text);
          }
          
          alert(`✅ Análise concluída com sucesso!\n\n${results.length} consultor(es) atualizado(s).\n\nVerifique o Dashboard para ver os resultados.`);
      } catch (error) {
          console.error("❌ Erro na análise manual:", error);
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

  const handleEntrevistaCompleta = (candidaturaId: number, resultado: 'aprovado' | 'reprovado') => {
    console.log(`✅ Entrevista finalizada: Candidatura ${candidaturaId} - ${resultado}`);
    updateCandidaturaStatus(String(candidaturaId), resultado === 'aprovado' ? 'aprovado_interno' : 'reprovado_interno');
  };

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
      // ============================================
      // RMS Views
      // ============================================
      case 'users':
        return <ManageUsers users={users} addUser={addUser} updateUser={updateUser} currentUser={currentUser!} migrateYearlyData={migrateYearlyData} />;
      case 'clients':
        return <ManageClients clients={clients} users={users} usuariosCliente={usuariosCliente} coordenadoresCliente={coordenadoresCliente} consultants={consultants} addClient={addClient} updateClient={updateClient} addUsuarioCliente={addUsuarioCliente} updateUsuarioCliente={updateUsuarioCliente} addCoordenadorCliente={addCoordenadorCliente} updateCoordenadorCliente={updateCoordenadorCliente} currentUser={currentUser!} />;
      case 'consultants':
        return <ManageConsultants consultants={consultants} usuariosCliente={usuariosCliente} clients={clients} coordenadoresCliente={coordenadoresCliente} users={users} addConsultant={addConsultant} updateConsultant={updateConsultant} currentUser={currentUser!} onNavigateToAtividades={handleNavigateToAtividades} />;
      case 'quarantine':
        return <Quarentena consultants={consultants} clients={clients} usuariosCliente={usuariosCliente} coordenadoresCliente={coordenadoresCliente} currentUser={currentUser!} loadConsultantReports={loadConsultantReports} onNavigateToAtividades={handleNavigateToAtividades} onNavigateToRecommendations={(consultant) => { setContextualConsultant(consultant.nome_consultores); setCurrentView('recommendations'); }} />;
      case 'recommendations':
        return <RecommendationModule consultants={consultants} clients={clients} usuariosCliente={usuariosCliente} coordenadoresCliente={coordenadoresCliente} loadConsultantReports={loadConsultantReports} onNavigateToAtividades={handleNavigateToAtividades} />;
      case 'analytics':
        return <Analytics consultants={consultants} clients={clients} usuariosCliente={usuariosCliente} users={users} />;
      
      // ✅ Movimentações de Consultores
      case 'movimentacoes':
        return <MovimentacoesConsultores />;
      
      // ✅ Posição Comercial
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
      case 'compliance_dashboard':
          return <ComplianceDashboard 
              rhActions={rhActions} 
              feedbackResponses={feedbackResponses} 
              consultants={consultants} 
          />;
      
      // ============================================
      // Atividades Views
      // ============================================
      case 'atividades_inserir':
          return <AtividadesInserir 
            clients={clients} 
            consultants={consultants} 
            usuariosCliente={usuariosCliente}
            coordenadoresCliente={coordenadoresCliente}
            allReports={consultants.flatMap(c => c.consultant_reports || [])}
            loadConsultantReports={loadConsultantReports}
            onManualReport={handleManualAnalysis}
            preSelectedClient={contextualClient}
            preSelectedConsultant={contextualConsultant}
          />;
      case 'atividades_consultar':
          return <AtividadesConsultar clients={clients} consultants={consultants} usuariosCliente={usuariosCliente} loadConsultantReports={memoizedLoadConsultantReports} />;
      case 'atividades_exportar':
          return <AtividadesExportar clients={clients} consultants={consultants} usuariosCliente={usuariosCliente} users={users} loadConsultantReports={memoizedLoadConsultantReports} />;
      
      // ============================================
      // RAISA Views
      // ============================================
      case 'vagas':
          return <Vagas 
            vagas={vagas} 
            clients={clients} 
            usuariosCliente={usuariosCliente}
            addVaga={addVaga} 
            updateVaga={updateVaga} 
            deleteVaga={deleteVaga} 
          />;
      case 'candidaturas':
          return <Candidaturas candidaturas={candidaturas} vagas={vagas} pessoas={pessoas} updateStatus={updateCandidaturaStatus} />;
      case 'analise_risco':
          return <AnaliseRisco />;
      case 'pipeline':
          return <Pipeline candidaturas={candidaturas} vagas={vagas} pessoas={pessoas} />;
      case 'talentos':
          return <BancoTalentos pessoas={pessoas} addPessoa={addPessoa} updatePessoa={updatePessoa} />;
      case 'controle_envios':
          return <ControleEnvios currentUser={currentUser!} />;
      case 'entrevista_tecnica':
          return <EntrevistaTecnica 
            candidaturas={candidaturas}
            vagas={vagas}
            currentUserId={currentUser?.id || 1}
            onEntrevistaCompleta={handleEntrevistaCompleta}
          />;
      
      // ✅ NOVO: LinkedIn Import (Fase 7)
      case 'linkedin_import':
          return <LinkedInImportPanel />;
      
      // ============================================
      // RAISA Dashboard Views
      // ============================================
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
      
      // ✅ NOVO: Dashboard ML Learning (Fase 7)
      case 'dashboard_ml':
          return <DashboardMLLearning />;
      
      // ✅ NOVO: Dashboard Performance IA (Fase 6)
      case 'dashboard_performance_ia':
          return <DashboardPerformanceIA />;
      
      // ✅ NOVO: Dashboard RAISA Metrics (Fase 6)
      case 'dashboard_raisa_metrics':
          return <DashboardRaisaMetrics />;

      case 'dashboard':
      default:
        return <Dashboard consultants={consultants} clients={clients} usuariosCliente={usuariosCliente} coordenadoresCliente={coordenadoresCliente} users={users} currentUser={currentUser!} loadConsultantReports={loadConsultantReports} onNavigateToAtividades={handleNavigateToAtividades} />;
    }
  };

  if (!currentUser && currentView !== 'feedback_portal') {
    return <LoginScreen onLogin={handleLogin} users={users} updateUser={updateUser} />;
  }

  if (currentView === 'feedback_portal') {
      return renderContent();
  }

  return (
    <PermissionsProvider>
      <div className="min-h-screen bg-gray-100 flex flex-col overflow-hidden">
        <Header currentUser={currentUser!} onLogout={handleLogout} />
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
  );
};

export default App;
