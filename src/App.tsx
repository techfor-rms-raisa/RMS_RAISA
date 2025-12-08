
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
import { analyzeReport } from './services/geminiService'; // Importar a função

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
    vagas, pessoas, candidaturas,
    updateConsultantScore, 
    addClient, addConsultant, addUser,
    loadAllData
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
          const results = await analyzeReport(text, gestorName);
          
          if (results.length === 0) {
              alert('⚠️ Nenhum relatório válido encontrado. Verifique o formato do arquivo.');
              return;
          }
          
          console.log(`✅ ${results.length} relatório(s) analisado(s). Atualizando consultores...`);
          
          const processed = [];
          const ignored = [];

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
          alert("Ocorreu um erro inesperado durante a análise. Verifique o console para mais detalhes.");
      }
  };
  
  const handleSimulateLink = (token: string) => {
      setSimulatedToken(token);
      setCurrentView('feedback_portal');
  };

  const handleFeedbackSubmit = (response: FeedbackResponse, action?: RHAction) => {
      console.log('Feedback recebido:', response);
  };

  const renderContent = () => {
    // RMS Views
    if (currentView === 'dashboard') {
      return <Dashboard consultants={consultants} />;
    }
    if (currentView === 'quarantine') {
      return <div className="p-4"><h2 className="text-2xl font-bold">Quarentena</h2><p>Módulo de Quarentena em desenvolvimento...</p></div>;
    }
    if (currentView === 'recommendations') {
      return <RecommendationModule consultants={consultants} />;
    }
    if (currentView === 'users') {
      return <ManageUsers users={users} onAddUser={addUser} />;
    }
    if (currentView === 'clients') {
      return <ManageClients clients={clients} onAddClient={addClient} />;
    }
    if (currentView === 'consultants') {
      return <ManageConsultants consultants={consultants} onAddConsultant={addConsultant} />;
    }
    if (currentView === 'analytics') {
      return <Analytics consultants={consultants} />;
    }
    if (currentView === 'import') {
      return <AtividadesInserir onAnalyze={handleManualAnalysis} />;
    }
    if (currentView === 'export') {
      return <ExportModule consultants={consultants} />;
    }
    if (currentView === 'templates') {
      return <TemplateLibrary templates={templates} />;
    }
    if (currentView === 'campaigns') {
      return <ComplianceCampaigns campaigns={campaigns} />;
    }
    if (currentView === 'compliance_dashboard') {
      return <ComplianceDashboard />;
    }
    if (currentView === 'feedback_portal') {
      return <FeedbackPortal token={simulatedToken} onSubmit={handleFeedbackSubmit} />;
    }

    // RAISA Views
    if (currentView === 'vagas') {
      return <Vagas vagas={vagas} />;
    }
    if (currentView === 'candidaturas') {
      return <Candidaturas candidaturas={candidaturas} />;
    }
    if (currentView === 'analise_risco') {
      return <AnaliseRisco candidaturas={candidaturas} />;
    }
    if (currentView === 'pipeline') {
      return <Pipeline candidaturas={candidaturas} />;
    }
    if (currentView === 'talentos') {
      return <BancoTalentos pessoas={pessoas} />;
    }
    if (currentView === 'controle_envios') {
      return <ControleEnvios />;
    }
    if (currentView === 'entrevista_tecnica') {
      return <EntrevistaTecnica />;
    }

    // Default fallback
    return <Dashboard consultants={consultants} />;
  };

  if (!currentUser && currentView !== 'feedback_portal') {
    return <LoginScreen onLogin={handleLogin} />;
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
