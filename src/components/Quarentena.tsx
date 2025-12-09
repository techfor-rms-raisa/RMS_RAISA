import React, { useMemo, useState, useEffect } from 'react';
import { Consultant, Client, User, UsuarioCliente, CoordenadorCliente, ConsultantReport } from '../components/types';
import ReportDetailsModal from './ReportDetailsModal';

interface QuarentenaProps {
  consultants: Consultant[];
  clients: Client[];
  usuariosCliente: UsuarioCliente[];
  coordenadoresCliente: CoordenadorCliente[];
  currentUser: User;
}

const Quarentena: React.FC<QuarentenaProps> = ({ 
  consultants = [], 
  clients = [], 
  usuariosCliente = [], 
  coordenadoresCliente = [],
  currentUser 
}) => {
  
  const [selectedClient, setSelectedClient] = useState<string>('all');
  const [selectedScore, setSelectedScore] = useState<string>('all');
  const [viewingReport, setViewingReport] = useState<ConsultantReport | null>(null);

  // ============================================================================
  // FUNÇÕES AUXILIARES
  // ============================================================================

  const getDaysSinceHiring = (hireDate: string | null | undefined): number | null => {
    if (!hireDate) return null;
    try {
      const hire = new Date(hireDate);
      const today = new Date();
      const diffTime = Math.abs(today.getTime() - hire.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays;
    } catch {
      return null;
    }
  };

  const isNewConsultant = (consultant: Consultant): boolean => {
    const daysSinceHiring = getDaysSinceHiring(consultant.data_inclusao_consultores);
    return daysSinceHiring !== null && daysSinceHiring < 45;
  };

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

  const isInQuarantine = (consultant: Consultant): boolean => {
    const finalScore = getValidFinalScore(consultant);
    const isNew = isNewConsultant(consultant);
    const hasRiskScore = finalScore !== null && [5, 4, 3].includes(finalScore);
    return hasRiskScore || isNew;
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
      const clientManagers = usuariosCliente.filter(uc => uc.id_cliente === client.id);
      
      const managers = clientManagers.map(manager => {
        let managerConsultants = consultants.filter(c => c.gestor_imediato_id === manager.id && c.status === 'Ativo');
        
        // Filtrar apenas consultores em quarentena
        managerConsultants = managerConsultants.filter(c => isInQuarantine(c));

        // Aplicar filtro de score selecionado
        if (selectedScore !== 'all') {
          if (selectedScore === 'new') {
            managerConsultants = managerConsultants.filter(c => isNewConsultant(c));
          } else {
            const scoreNum = parseInt(selectedScore, 10);
            managerConsultants = managerConsultants.filter(c => getValidFinalScore(c) === scoreNum);
          }
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
  }, [clients, consultants, usuariosCliente, coordenadoresCliente, selectedClient, selectedScore]);

  const getReportForMonth = (c: Consultant, m: number) => {
    if (!c.reports) return undefined;
    return c.reports.filter(r => r.month === m).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (consultants.length === 0 || clients.length === 0) {
    return <div className="p-6 text-center text-gray-500">Carregando dados do Supabase...</div>;
  }

  return (
    <div className="p-6 rounded-lg shadow-md border-t-4 bg-red-50 border-red-500">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-red-800">
          🚨 Quarentena de Consultores
        </h2>
      </div>
      
      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">Filtrar por Cliente:</label>
          <select 
            value={selectedClient} 
            onChange={e => setSelectedClient(e.target.value)} 
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
          >
            <option value="all">Todos os Clientes</option>
            {[...new Set(clients.map(c => c.razao_social_cliente))].sort().map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">Filtrar por Score:</label>
          <select 
            value={selectedScore} 
            onChange={e => setSelectedScore(e.target.value)} 
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
          >
            <option value="all">Todos os Scores</option>
            <option value="5">Score 5 - CRÍTICO</option>
            <option value="4">Score 4 - ALTO</option>
            <option value="3">Score 3 - MODERADO</option>
            <option value="new">Novo Consultor (&lt; 45 dias)</option>
          </select>
        </div>
      </div>

      {/* Resultados */}
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
                          <th className="px-4 py-2 text-left text-xs font-bold text-gray-500 uppercase">Cargo</th>
                          <th className="px-4 py-2 text-left text-xs font-bold text-gray-500 uppercase">Email</th>
                          <th className="px-4 py-2 text-center text-xs font-bold text-gray-500 uppercase">Score Final</th>
                          <th className="px-4 py-2 text-center text-xs font-bold text-gray-500 uppercase">Status</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {manager.consultants.map(consultant => {
                          const finalScore = getValidFinalScore(consultant);
                          const isNew = isNewConsultant(consultant);
                          const daysSinceHiring = getDaysSinceHiring(consultant.data_inclusao_consultores);

                          return (
                            <tr key={consultant.id} className="hover:bg-yellow-50">
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-gray-900">{consultant.nome_consultores}</span>
                                  {isNew && (
                                    <span 
                                      className="px-2 py-1 text-xs font-bold text-white bg-green-500 rounded-full whitespace-nowrap"
                                      title={`Contratado há ${daysSinceHiring} dias`}
                                    >
                                      🆕 Novo
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700">{consultant.cargo_consultores}</td>
                              <td className="px-4 py-3 text-sm text-gray-700">{consultant.email_consultor || 'N/A'}</td>
                              <td className="px-4 py-3 text-center">
                                {finalScore !== null ? (
                                  <div 
                                    className="inline-flex flex-col items-center justify-center w-12 h-12 rounded-full text-white font-bold text-sm"
                                    style={{ backgroundColor: getScoreColor(finalScore) }}
                                    title={getScoreLabel(finalScore)}
                                  >
                                    <span>{finalScore}</span>
                                    <span className="text-xs">{getScoreLabel(finalScore).substring(0, 3)}</span>
                                  </div>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {isNew && daysSinceHiring && daysSinceHiring < 30 && (
                                  <span className="px-2 py-1 text-xs font-bold text-white bg-orange-500 rounded-full">
                                    ⚠️ &lt; 30 dias
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )
        ))}
      </div>

      {structuredData.every(c => c.managers.length === 0) && (
        <div className="p-8 text-center bg-white rounded-lg border-2 border-dashed border-gray-300">
          <p className="text-gray-500 text-lg">✅ Nenhum consultor em quarentena com os filtros selecionados</p>
        </div>
      )}

      <ReportDetailsModal report={viewingReport} onClose={() => setViewingReport(null)} isQuarantineView={true} />
    </div>
  );
};

export default Quarentena;
