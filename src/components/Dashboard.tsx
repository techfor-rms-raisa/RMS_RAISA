import React, { useMemo, useState, useEffect } from 'react';
import { Consultant, Client, User, UsuarioCliente, CoordenadorCliente, ConsultantReport, RiskScore } from '../components/types';
import StatusCircle from './StatusCircle';

interface DashboardProps {
  consultants: Consultant[];
  clients: Client[];
  usuariosCliente: UsuarioCliente[];
  coordenadoresCliente: CoordenadorCliente[];
  currentUser: User;
  users: User[];
  isQuarantineView?: boolean;
}

const Dashboard: React.FC<DashboardProps> = ({ consultants = [], clients = [], usuariosCliente = [], coordenadoresCliente = [], currentUser, users, isQuarantineView = false }) => {
  // TESTE DE ALTERAÇÃO PARA FORÇAR COMMIT
  const [selectedClient, setSelectedClient] = useState<string>('all');
  const [selectedManager, setSelectedManager] = useState<string>('all');
  const [selectedConsultant, setSelectedConsultant] = useState<string>('all');
  const [viewingReport, setViewingReport] = useState<ConsultantReport | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  const availableYears = useMemo(() => [...new Set(consultants.map(c => c.ano_vigencia))].sort((a: number, b: number) => b - a), [consultants]);

  useEffect(() => {
    if (availableYears.length > 0 && availableYears[0] > selectedYear) setSelectedYear(availableYears[0]);
  }, [availableYears, selectedYear]);

  useEffect(() => { setSelectedManager('all'); setSelectedConsultant('all'); }, [selectedClient]);
  useEffect(() => { setSelectedConsultant('all'); }, [selectedManager]);

  const getReferenceDates = () => {
      const today = new Date(); 
      const cutoff = new Date(today);
      cutoff.setDate(today.getDate() - 45);
      return { todayStr: today.toISOString().split('T')[0], cutoffStr: cutoff.toISOString().split('T')[0], today };
  };

  const structuredData = useMemo(() => {
    let relevantClients = clients.filter(c => c.ativo_cliente);
    if (selectedClient !== 'all') relevantClients = relevantClients.filter(c => c.razao_social_cliente === selectedClient);
    const { todayStr, cutoffStr } = getReferenceDates();

    return relevantClients.map(client => {
        let clientManagers = usuariosCliente.filter(uc => uc.id_cliente === client.id);
        if (selectedManager !== 'all') clientManagers = clientManagers.filter(uc => uc.id === parseInt(selectedManager));
        
        const managers = clientManagers.map(manager => {
            let managerConsultants = consultants.filter(c => c.gestor_imediato_id === manager.id && c.status === 'Ativo');
            if (!isQuarantineView) managerConsultants = managerConsultants.filter(c => c.ano_vigencia === selectedYear);
            else managerConsultants = managerConsultants.filter(c => {
                const isRecent = c.data_inclusao_consultores >= cutoffStr && c.data_inclusao_consultores <= todayStr;
                const isRisk = c.parecer_final_consultor === 1 || c.parecer_final_consultor === 2;
                return isRecent || isRisk;
            });

            if (selectedConsultant !== 'all') managerConsultants = managerConsultants.filter(c => c.nome_consultores === selectedConsultant);
            
            if (managerConsultants.length === 0) return null;
            
            return {
              ...manager,
              consultants: managerConsultants.sort((a, b) => a.nome_consultores.localeCompare(b.nome_consultores)),
              coordenadores: coordenadoresCliente.filter(cc => cc.id_gestor_cliente === manager.id && cc.ativo),
            };
        }).filter((m): m is Exclude<typeof m, null> => m !== null);

        return { ...client, managers };
    }).sort((a, b) => a.razao_social_cliente.localeCompare(b.razao_social_cliente));
  }, [clients, consultants, usuariosCliente, selectedClient, selectedManager, selectedConsultant, isQuarantineView, selectedYear]);

  const getReportForMonth = (c: Consultant, m: number) => {
      if (!c.reports) return undefined;
      return c.reports.filter(r => r.month === m).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  };

  return (
    <div className={`p-6 rounded-lg shadow-md border-t-4 ${isQuarantineView ? 'bg-yellow-50 border-yellow-500' : 'bg-white border-transparent'}`}>
      <div className="flex justify-between items-center mb-4">
        <h2 className={`text-2xl font-bold ${isQuarantineView ? 'text-yellow-800' : 'text-[#4D5253]'}`}>
            {isQuarantineView ? '⚠️ Quarentena' : 'Dashboard de Acompanhamento'}
        </h2>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
        {!isQuarantineView && (
             <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))} className="p-2 border rounded">
                 {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
             </select>
        )}
        <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)} className="p-2 border rounded">
            <option value="all">Todos os Clientes</option>
            {[...new Set(clients.map(c => c.razao_social_cliente))].sort().map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      <div className="space-y-8">
        {structuredData.map(client => (
            (client.managers.length > 0) && (
              <div key={client.id} className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                <h2 className="text-xl font-bold text-[#533738] mb-4">{client.razao_social_cliente}</h2>
                {client.managers.map(manager => (
                    <div key={manager.id} className="mb-6 border rounded bg-white">
                        <div className="bg-gray-100 p-3 font-bold">{manager.nome_gestor_cliente}</div>
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
                                                        <StatusCircle score={consultant[`parecer_${month}_consultor` as keyof Consultant] as RiskScore | null} onClick={report ? () => setViewingReport(report) : undefined} />
                                                    </td>
                                                );
                                            })}
                                            <td className="px-4 py-2 text-center"><StatusCircle score={consultant.parecer_final_consultor} /></td>
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

      {viewingReport && (
          <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6">
                  <div className="flex justify-between mb-4">
                      <h3 className="text-xl font-bold">Detalhes do Relatório ({viewingReport.month}/{viewingReport.year})</h3>
                      <button onClick={() => setViewingReport(null)} className="text-2xl">&times;</button>
                  </div>
                  <div className="space-y-4">
                      <div className="p-4 bg-blue-50 rounded border-l-4 border-blue-500">
                          <h4 className="font-bold text-blue-800">Resumo</h4>
                          <p>{viewingReport.summary}</p>
                      </div>
                      {viewingReport.negativePattern && (
                          <div className="p-4 bg-red-50 rounded border-l-4 border-red-500">
                              <h4 className="font-bold text-red-800">Padrão Negativo</h4>
                              <p>{viewingReport.negativePattern}</p>
                          </div>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {viewingReport.recommendations?.map((rec, i) => (
                              <div key={i} className="p-3 border rounded shadow-sm">
                                  <span className="text-xs font-bold uppercase bg-gray-200 px-2 py-1 rounded">{rec.tipo}</span>
                                  <p className="mt-2 text-sm">{rec.descricao}</p>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default Dashboard;
