
import React, { useState, useEffect } from 'react';
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

import { PermissionsProvider } from './hooks/usePermissions';
import { useSupabaseData } from './hooks/useSupabaseData';
import { AIAnalysisResult, User, View, FeedbackResponse, RHAction } from './types';
import { analyzeReport as processReportAnalysis } from './services/geminiService'; // Importa a função real

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [simulatedToken, setSimulatedToken] = useState<string | null>(null);

  useEffect(() => {
      console.log("ORBIT.ai V2.0 Loaded");
  }, []);
  
  const { 
    clients, consultants, users, usuariosCliente, coordenadoresCliente,
    templates, campaigns, feedbackResponses, rhActions,
    vagas, pessoas, candidaturas, // RAISA Data
    updateConsultantScore, 
    addClient, 
    addConsultant, 
    addUser, updateUser,
    addUsuarioCliente, updateUsuarioCliente, 
    addCoordenadorCliente, updateCoordenadorCliente, 
    // migrateYearlyData, // Mock function, remover se não existir no Supabase
    addTemplate, updateTemplate, deleteTemplate,
    addCampaign, updateCampaign,
    // addFeedbackResponse, addRHAction, // Mock functions
    addVaga, updateVaga, deleteVaga, 
    addPessoa, updatePessoa,
    addCandidatura, updateCandidaturaStatus
  } = useSupabaseData();

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    setCurrentView('dashboard');
  };
  
  const handleLogout = () => {
    setCurrentUser(null);
    setSimulatedToken(null);
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
          
          const processed = [];
          const ignored = [];

          // Atualizar score de cada consultor
          for (const result of results) {
              const updateResult = await updateConsultantScore(result, text);
              if (updateResult.success) {
                  processed.push(result.consultantName);
              } else {
                  ignored.push({ name: result.consultantName, error: updateResult.error });
              }
          }
          
          let alertMessage = `✅ Análise concluída!\n\n${processed.length} consultor(es) atualizado(s) com sucesso:\n- ${processed.join("\n- ")}`;

          if (ignored.length > 0) {
              const ignoredText = ignored.map(item => `${item.name} (Motivo: ${item.error})`).join("\n- ");
              alertMessage += `\n\n⚠️ ${ignored.length} consultor(es) foram ignorados:\n- ${ignoredText}\n\nPor favor, verifique os nomes e faça a inserção manual se necessário.`;
          }

          alert(alertMessage);
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
      // addFeedbackResponse(response);
      // if (action) addRHAction(action);
  };

  const renderContent = () => {
    if (currentView === 'feedback_portal' && simulatedToken) {
        return <FeedbackPortal token={simulatedToken} onSubmit={handleFeedbackSubmit} onClose={() => { setSimulatedToken(null); setCurrentView('campaigns'); }} />;
    }

    switch (currentView) {
      // RMS Views
      case 'users':
        return <ManageUsers users={users} addUser={addUser} updateUser={updateUser} currentUser={currentUser!} migrateYearlyData={() => {}} />;
      case 'clients':
        return <ManageClients clients={clients} users={users} usuariosCliente={usuariosCliente} coordenadoresCliente={coordenadoresCliente} consultants={consultants} addClient={addClient} updateClient={() => {}} addUsuarioCliente={addUsuarioCliente} updateUsuarioCliente={() => {}} addCoordenadorCliente={addCoordenadorCliente} updateCoordenadorCliente={() => {}} currentUser={currentUser!} />;
      case 'consultants':
        return <ManageConsultants consultants={consultants} usuariosCliente={usuariosCliente} clients={clients} coordenadoresCliente={coordenadoresCliente} users={users} addConsultant={addConsultant} updateConsultant={() => {}} currentUser={currentUser!} />;
      case 'quarantine':
        return <Dashboard consultants={consultants} clients={clients} usuariosCliente={usuariosCliente} coordenadoresCliente={coordenadoresCliente} users={users} currentUser={currentUser!} isQuarantineView={true} />;
      case 'recommendations':
        return <RecommendationModule consultants={consultants} clients={clients} usuariosCliente={usuariosCliente} />;
      case 'analytics':
        return <Analytics consultants={consultants} clients={clients} usuariosCliente={usuariosCliente} users={users} />;
      case 'export': 
        return <ExportModule consultants={consultants} clients={clients} usuariosCliente={usuariosCliente} users={users} />;
      case 'import':
        return <ImportModule users={users} clients={clients} managers={usuariosCliente} coordinators={coordenadoresCliente} batchAddClients={() => {}} batchAddManagers={() => {}} batchAddCoordinators={() => {}} batchAddConsultants={() => {}} />;
      case 'templates':
          return <TemplateLibrary templates={templates} currentUser={currentUser!} addTemplate={addTemplate} updateTemplate={updateTemplate} deleteTemplate={deleteTemplate} />;
      case 'campaigns':
          return <ComplianceCampaigns campaigns={campaigns} templates={templates} consultants={consultants} addCampaign={addCampaign} onSimulateLink={handleSimulateLink} />;
      case 'compliance_dashboard':
          return <ComplianceDashboard rhActions={rhActions} feedbackResponses={feedbackResponses} />;
      
      // Atividades Views
      case 'atividades_inserir':
          return <AtividadesInserir clients={clients} consultants={consultants} usuariosCliente={usuariosCliente} onManualReport={handleManualAnalysis} />;
      case 'atividades_consultar':
          return <AtividadesConsultar clients={clients} consultants={consultants} usuariosCliente={usuariosCliente} />;
      case 'atividades_exportar':
          return <AtividadesExportar clients={clients} consultants={consultants} usuariosCliente={usuariosCliente} />;
      
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
        return <Dashboard consultants={consultants} clients={clients} usuariosCliente={usuariosCliente} coordenadoresCliente={coordenadoresCliente} users={users} currentUser={currentUser!} isQuarantineView={false} />;
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
      </div>
    </PermissionsProvider>
  );
};

export default App;
