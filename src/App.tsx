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
import DashboardVagas from './components/raisa/DashboardVagas';
import VagasCriar from './components/raisa/VagasCriar';
import VagasConsultar from './components/raisa/VagasConsultar';
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
  // ⚠️ Dependency array vazio: loadConsultantReports nunca muda, é sempre a mesma função
  const memoizedLoadConsultantReports = useCallback(loadConsultantReports, []);

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
        return <ManageUsers users={users} onAdd={addUser} onUpdate={updateUser} />;
      case 'clients':
        return <ManageClients clients={clients} onAdd={addClient} onUpdate={updateClient} onBatchAdd={batchAddClients} />;
      case 'consultants':
        return <ManageConsultants consultants={consultants} onAdd={addConsultant} onUpdate={updateConsultant} onBatchAdd={batchAddConsultants} />;
      case 'dashboard':
        return <Dashboard 
          consultants={consultants} 
          clients={clients} 
          onNavigateToAtividades={handleNavigateToAtividades} 
          loadConsultantReports={memoizedLoadConsultantReports} 
        />;
      case 'analytics':
        return <Analytics />;
      case 'recommendations':
        return <RecommendationModule />;
      case 'export':
        return <ExportModule />;
      case 'import':
        return <ImportModule onAnalysisComplete={handleAnalysisComplete} onManualAnalysis={handleManualAnalysis} />;
      case 'templates':
        return <TemplateLibrary templates={templates} onAdd={addTemplate} onUpdate={updateTemplate} onDelete={deleteTemplate} />;
      case 'campaigns':
        return <ComplianceCampaigns campaigns={campaigns} onAdd={addCampaign} onUpdate={updateCampaign} onSimulate={handleSimulateLink} />;
      case 'compliance_dashboard':
        return <ComplianceDashboard feedback={feedbackResponses} actions={rhActions} />;
      case 'quarantine':
        return <Quarentena consultants={consultants} />;

      // Atividades Views
      case 'atividades_inserir':
        return <AtividadesInserir onManualAnalysis={handleManualAnalysis} clientName={contextualClient} consultantName={contextualConsultant} />;
      case 'atividades_consultar':
        return <AtividadesConsultar />;
      case 'atividades_exportar':
        return <AtividadesExportar />;

      // RAISA Views
            case 'vagas_dashboard':
        return <DashboardVagas vagas={vagas} clientes={clients} users={users} />;
      case 'vagas_criar':
        return <VagasCriar addVaga={addVaga} clientes={clients} users={users} />;
      case 'vagas_consultar':
        return <VagasConsultar vagas={vagas} clientes={clients} users={users} updateVaga={updateVaga} deleteVaga={deleteVaga} />;
      case 'candidaturas':
        return <Candidaturas candidaturas={candidaturas} pessoas={pessoas} vagas={vagas} onUpdateStatus={updateCandidaturaStatus} />;
      case 'entrevista_tecnica':
        return <EntrevistaTecnica />;
      case 'controle_envios':
        return <ControleEnvios />;
      case 'analise_risco':
        return <AnaliseRisco />;
      case 'pipeline':
        return <Pipeline />;
      case 'talentos':
        return <BancoTalentos pessoas={pessoas} />;

      // RAISA Dashboards
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

      default:
        return <Dashboard 
          consultants={consultants} 
          clients={clients} 
          onNavigateToAtividades={handleNavigateToAtividades} 
          loadConsultantReports={memoizedLoadConsultantReports} 
        />;
    }
  };

  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <PermissionsProvider>
      <div className="flex h-screen bg-gray-100 font-sans">
        <Sidebar currentUser={currentUser} currentView={currentView} onNavigate={setCurrentView} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header user={currentUser} onLogout={handleLogout} />
          <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-200">
            <div className="container mx-auto px-6 py-8">
              {renderContent()}
            </div>
          </main>
        </div>
      </div>
    </PermissionsProvider>
  );
};

export default App;
