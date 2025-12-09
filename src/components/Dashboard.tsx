import React, { useMemo, useState, useEffect } from 'react';
import { Consultant, Client, User, UsuarioCliente, CoordenadorCliente, ConsultantReport, RiskScore } from '../components/types';
import StatusCircle from './StatusCircle';
import ReportDetailsModal from './ReportDetailsModal';

interface DashboardProps {
  consultants: Consultant[];
  clients: Client[];
  usuariosCliente: UsuarioCliente[];
  coordenadoresCliente: CoordenadorCliente[];
  currentUser: User;
  users: User[];
}

const Dashboard: React.FC<DashboardProps> = ({ 
  consultants = [], 
  clients = [], 
  usuariosCliente = [], 
  coordenadoresCliente = [], 
  currentUser, 
  users 
}) => {
  
  const [selectedClient, setSelectedClient] = useState<string>('all');
  const [selectedManager, setSelectedManager] = useState<string>('all');
  const [selectedConsultant, setSelectedConsultant] = useState<string>('all');
  const [selectedScore, setSelectedScore] = useState<string>('all'); // NOVO: filtro de score
  const [viewingReport, setViewingReport] = useState<ConsultantReport | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  const availableYears = useMemo(() => [...new Set(consultants.map(c => c.ano_vigencia))].sort((a: number, b: number) => b - a), [consultants]);

  if (consultants.length === 0 || clients.length === 0) {
    return <div className="p-6 text-center text-gray-500">Carregando dados do Supabase...</div>;
  }

  useEffect(() => {
    if (availableYears.length > 0 && availableYears[0] > selectedYear) setSelectedYear(availableYears[0]);
  }, [availableYears, selectedYear]);

  useEffect(() => { setSelectedManager('all'); setSelectedConsultant('all'); }, [selectedClient]);
  useEffect(() => { setSelectedConsultant('all'); }, [selectedManager]);

  // ============================================================================
  // FUNÇÕES AUXILIARES
  // ============================================================================

  const getValidFinalScore = (consultant: Consultant): number | null => {
    const score = consultant.parecer_final_consultor;
    if (score === null || score === undefined || score === '#FFFF') {
      return null;
    }
    const numScore = typeof score === 'string' ? parseInt(score, 10) : score;
    if (isNaN(numScore) || numScore < 1 || numScore > 5) {
      return null;
    }
    return numScore;
  };

  const getScoreColor = (score: number | null): string => {
    if (score === null || score === undefined) return '#757575';
    const colors: { [key: number]: string } = {
      5: '#d32f2f',
      4: '#f57c00',
      3: '#fbc02d',
      2: '#388e3c',
      1: '#1976d2'
    };
    return colors[score] || '#757575';
  };

  const getScoreLabel = (score: number | null): string => {
    if (score === null || score === undefined) return '';
    const labels: { [key: number]: string } = {
      5: 'CRÍTICO',
      4: 'ALTO',
      3: 'MODERADO',
      2: 'BAIXO',
      1: 'MÍNIMO'
    };
    return labels[score] || 'DESCONHECIDO';
  };

  // ============================================================================
  // LÓGICA DE ESTRUTURA DE DADOS
  // ============================================================================

  const structuredData = useMemo(() => {
    let relevantClients = clients.filter(c => c.ativo_cliente);
    if (selectedClient !== 'all') {
      relevantClients = relevantClients.filter(c => c.razao_social_cliente === selectedClient);
    }

    return relevantClients.map(client => {
      let clientManagers = usuariosCliente.filter(uc => uc.id_cliente === client.id);
      if (selectedManager !== 'all') {
        clientManagers = clientManagers.filter(uc => uc.id === parseInt(selectedManager));
      }
      
      const managers = clientManagers.map(manager => {
        let managerConsultants = consultants.filter(c => c.gestor_imediato_id === manager.id && c.status === 'Ativo');
        
        // Filtrar por ano
        if (selectedYear !== new Date().getFullYear()) {
          managerConsultants = managerConsultants.filter(c => c.ano_vigencia === selectedYear);
        }

        // NOVO: Aplicar filtro de score selecionado
        if (selectedScore !== 'all') {
          const scoreNum = parseInt(selectedScore, 10);
          managerConsultants = managerConsultants.filter(c => getValidFinalScore(c) === scoreNum);
        }

        if (selectedConsultant !== 'all') {
          managerConsultants = managerConsultants.filter(c => c.nome_consultores === selectedConsultant);
        }
        
        if (managerConsultants.length === 0) return null;
        
        return {
          ...manager,
          consultants: managerConsultants.sort((a, b) => a.nome_consultores.localeCompare(b.nome_consultores)),
          coordenadores: coordenadoresCliente.filter(cc => cc.id_gestor_cliente === manager.id && cc.ativo),
        };
      }).filter((m): m is Exclude<typeof m, null> => m !== null);

      return { ...client, managers };
    }).sort((a, b) => a.razao_social_cliente.localeCompare(b.razao_social_cliente));
  }, [clients, consultants, usuariosCliente, coordenadoresCliente, selectedClient, selectedManager, selectedConsultant, selectedYear, selectedScore]);

  const getReportForMonth = (c: Consultant, m: number) => {
    if (!c.reports) return undefined;
    return c.reports.filter(r => r.month === m).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  };

  return (
    <div className="p-6 rounded-lg shadow-md border-t-4 bg-white border-transparent">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-[#4D5253]">
          Dashboard de Acompanhamento
        </h2>
      </div>
      
      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Ano:</label>
          <select 
            value={selectedYear} 
            onChange={e => setSelectedYear(parseInt(e.target.value))} 
            className="w-full p-2 border border-gray-300 rounded-lg"
          >
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Cliente:</label>
          <select 
            value={selectedClient} 
            onChange={e => setSelectedClient(e.target.value)} 
            className="w-full p-2 border border-gray-300 rounded-lg"
          >
            <option value="all">Todos os Clientes</option>
            {[...new Set(clients.map(c => c.razao_social_cliente))].sort().map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Gestor:</label>
          <select 
            value={selectedManager} 
            onChange={e => setSelectedManager(e.target.value)} 
            className="w-full p-2 border border-gray-300 rounded-lg"
          >
            <option value="all">Todos os Gestores</option>
            {selectedClient !== 'all' && (
              usuariosCliente
                .filter(uc => clients.find(c => c.id === uc.id_cliente && c.razao_social_cliente === selectedClient))
                .map(uc => <option key={uc.id} value={uc.id}>{uc.nome_gestor_cliente}</option>)
            )}
          </select>
        </div>

        {/* NOVO: Filtro de Score */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Score:</label>
          <select 
            value={selectedScore} 
            onChange={e => setSelectedScore(e.target.value)} 
            className="w-full p-2 border border-gray-300 rounded-lg"
          >
            <option value="all">Todos os Scores</option>
            <option value="5">Score 5 - CRÍTICO</option>
            <option value="4">Score 4 - ALTO</option>
            <option value="3">Score 3 - MODERADO</option>
            <option value="2">Score 2 - BAIXO</option>
            <option value="1">Score 1 - MÍNIMO</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Consultor:</label>
          <select 
            value={selectedConsultant} 
            onChange={e => setSelectedConsultant(e.target.value)} 
            className="w-full p-2 border border-gray-300 rounded-lg"
          >
            <option value="all">Todos os Consultores</option>
            {selectedManager !== 'all' && (
              consultants
                .filter(c => c.gestor_imediato_id === parseInt(selectedManager) && c.status === 'Ativo')
                .map(c => <option key={c.id} value={c.nome_consultores}>{c.nome_consultores}</option>)
            )}
          </select>
        </div>
      </div>

      {/* Dados */}
      <div className="space-y-8">
        {structuredData.map(client => (
          (client.managers.length > 0) && (
            <div key={client.id} className="p-4 bg-gray-50 rounded-xl border border-gray-200">
              <h2 className="text-xl font-bold text-[#533738] mb-4">{client.razao_social_cliente}</h2>
              {client.managers.map(manager => (
                <div key={manager.id} className="mb-6 border rounded bg-white overflow-hidden">
                  <div className="bg-gray-100 p-3 font-bold text-gray-800">{manager.nome_gestor_cliente}</div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-bold text-gray-500 uppercase">Consultor</th>
                          {[...Array(12)].map((_, i) => <th key={i} className="px-2 py-2 text-center text-xs font-bold text-gray-500">P{i+1}</th>)}
                          <th className="px-4 py-2 text-center text-xs font-bold text-gray-500 uppercase">Final</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {manager.consultants.map(consultant => (
                          <tr key={consultant.id}>
                            <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">{consultant.nome_consultores}</td>
                            {[...Array(12)].map((_, i) => {
                              const month = i + 1;
                              const report = getReportForMonth(consultant, month);
                              return (
                                <td key={i} className="px-2 py-2 text-center">
                                  <StatusCircle 
                                    score={consultant[`parecer_${month}_consultor` as keyof Consultant] as RiskScore | null} 
                                    onClick={report ? () => setViewingReport(report) : undefined} 
                                  />
                                </td>
                              );
                            })}
                            <td className="px-4 py-2 text-center">
                              {getValidFinalScore(consultant) !== null ? (
                                <div 
                                  className="inline-flex flex-col items-center justify-center w-10 h-10 rounded-full text-white font-bold text-sm"
                                  style={{ backgroundColor: getScoreColor(consultant.parecer_final_consultor) }}
                                  title={getScoreLabel(consultant.parecer_final_consultor)}
                                >
                                  <span>{consultant.parecer_final_consultor}</span>
                                  <span className="text-xs">{getScoreLabel(consultant.parecer_final_consultor).substring(0, 3)}</span>
                                </div>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )
        ))}
      </div>

      <ReportDetailsModal report={viewingReport} onClose={() => setViewingReport(null)} isQuarantineView={false} />
    </div>
  );
};

export default Dashboard;
