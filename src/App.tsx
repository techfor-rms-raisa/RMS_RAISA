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

// RAISA Imports
import Vagas from './components/raisa/Vagas';
import Candidaturas from './components/raisa/Candidaturas';
import AnaliseRisco from './components/raisa/AnaliseRisco';
import Pipeline from './components/raisa/Pipeline';
import BancoTalentos from './components/raisa/BancoTalentos';
import ControleEnvios from './components/raisa/ControleEnvios'; 
import EntrevistaTecnica from './components/raisa/EntrevistaTecnica';

// RAISA Dashboard Imports
import DashboardFunilConversao from './components/raisa/DashboardFunilConversao';
import DashboardAprovacaoReprovacao from './components/raisa/DashboardAprovacaoReprovacao';
import DashboardPerformanceAnalista from './components/raisa/DashboardPerformanceAnalista';
import DashboardPerformanceGeral from './components/raisa/DashboardPerformanceGeral';
import DashboardPerformanceCliente from './components/raisa/DashboardPerformanceCliente';
import DashboardAnaliseTempo from './components/raisa/DashboardAnaliseTempo';

// Atividades Imports
import AtividadesInserir from './components/atividades/AtividadesInserir';
import AtividadesConsultar from './components/atividades/AtividadesConsultar';
import AtividadesExportar from './components/atividades/AtividadesExportar';

// ============================================
// ✅ IMPORT DO PERMISSIONS PROVIDER
// ============================================
import { PermissionsProvider } from './hooks/usePermissions';

import { useSupabaseData } from './hooks/useSupabaseData';
import { AIAnalysisResult, User, View, FeedbackResponse, RHAction } from './types';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [simulatedToken, setSimulatedToken] = useState<string | null>(null);
  
  // Estados para navegação contextual
  const [contextualClient, setContextualClient] = useState<string>('');
  const [contextualConsultant, setContextualConsultant] = useState<string>('');

  useEffect(() => {
      console.log("ORBIT.ai V2.0 Loaded");
  }, []);
  
  const { 
    clients, consultants, users, usuariosCliente, coordenadoresCliente,
    templates, campaigns, feedbackResponses, rhActions,
    vagas, pessoas, candidaturas, // RAISA Data
    updateConsultantScore, processReportAnalysis, 
    loadConsultantReports, // 🔥 Lazy loading de relatórios
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
    reload: loadAllData  // ✅ Função para carregar dados
  } = useSupabaseData();

  // ✅ Memoizar loadConsultantReports para evitar loops infinitos
  const memoizedLoadConsultantReports = useCallback(loadConsultantReports, [loadConsultantReports]);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    setCurrentView('dashboard');
    // ✅ Carregar dados APÓS autenticação bem-sucedida
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

  const handleManualAnalysis = async (text: string, gestorName?: string) => {
      try {
          console.log('📊 Iniciando análise de relatórios...');
          const results = await processReportAnalysis(text, gestorName);
          
          if (results.length === 0) {
              alert('⚠️ Nenhum relatório válido encontrado. Verifique o formato do arquivo.');
              return;
          }
          
          console.log(`✅ ${results.length} relatório(s) analisado(s). Atualizando consultores...`);
          
          // Atualizar score de cada consultor
          for (const result of results) {
              await updateConsultantScore(result);
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
        return <Quarentena consultants={consultants} clients={clients} usuariosCliente={usuariosCliente} coordenadoresCliente={coordenadoresCliente} currentUser={currentUser!} loadConsultantReports={loadConsultantReports} onNavigateToAtividades={handleNavigateToAtividades} onNavigateToRecommendations={(consultant) => { setContextualConsultant(consultant.nome_consultores); setCurrentView('recommendations'); }} />;
      case 'recommendations':
        return <RecommendationModule consultants={consultants} clients={clients} usuariosCliente={usuariosCliente} coordenadoresCliente={coordenadoresCliente} loadConsultantReports={loadConsultantReports} onNavigateToAtividades={handleNavigateToAtividades} />;
      case 'analytics':
        return <Analytics consultants={consultants} clients={clients} usuariosCliente={usuariosCliente} users={users} />;
      case 'export': 
        return <ExportModule consultants={consultants} clients={clients} usuariosCliente={usuariosCliente} users={users} />;
      case 'import':
        return <ImportModule users={users} clients={clients} managers={usuariosCliente} coordinators={coordenadoresCliente} batchAddClients={batchAddClients} batchAddManagers={batchAddManagers} batchAddCoordinators={batchAddCoordinators} batchAddConsultants={batchAddConsultants} />;
      case 'templates':
          return <TemplateLibrary templates={templates} currentUser={currentUser!} addTemplate={addTemplate} updateTemplate={updateTemplate} deleteTemplate={deleteTemplate} />;
      case 'campaigns':
          return <ComplianceCampaigns campaigns={campaigns} templates={templates} consultants={consultants} addCampaign={addCampaign} onSimulateLink={handleSimulateLink} />;
      case 'compliance_dashboard':
          return <ComplianceDashboard rhActions={rhActions} feedbackResponses={feedbackResponses} />;
      
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
            preSelectedClient={contextualClient}
            preSelectedConsultant={contextualConsultant}
          />;
      case 'atividades_consultar':
          return <AtividadesConsultar clients={clients} consultants={consultants} usuariosCliente={usuariosCliente} loadConsultantReports={loadConsultantReports} />;
      case 'atividades_exportar':
          return <AtividadesExportar clients={clients} consultants={consultants} usuariosCliente={usuariosCliente} loadConsultantReports={loadConsultantReports} />;
      
      // RAISA Views
      case 'vagas':
          return <Vagas vagas={vagas} addVaga={addVaga} updateVaga={updateVaga} deleteVaga={deleteVaga} />;
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
          return <EntrevistaTecnica />;
      
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

  // ============================================
  // ✅ ENVOLVA TODO O RETURN COM <PermissionsProvider>
  // ============================================
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
      </div>
    </PermissionsProvider>
  );
};

export default App;
