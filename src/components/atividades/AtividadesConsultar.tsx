import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Client, Consultant, UsuarioCliente, ConsultantReport } from '../../src/components/types';

interface AtividadesConsultarProps {
    clients: Client[];
    consultants: Consultant[];
    usuariosCliente: UsuarioCliente[];
    loadConsultantReports?: (consultantId: number) => Promise<ConsultantReport[]>;
}

const AtividadesConsultar: React.FC<AtividadesConsultarProps> = ({
    clients,
    consultants,
    usuariosCliente,
    loadConsultantReports
}) => {
    const [selectedClient, setSelectedClient] = useState<string>('all');
    const [selectedConsultant, setSelectedConsultant] = useState<string>('all');
    const [selectedMonth, setSelectedMonth] = useState<string>('all');
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
    const [viewingReport, setViewingReport] = useState<ConsultantReport | null>(null);
    const [loadingReports, setLoadingReports] = useState(false);
    const [consultantsWithReports, setConsultantsWithReports] = useState<Consultant[]>([]);
    
    const hasLoadedRef = useRef(false);

    const months = [
        { value: 1, label: 'JAN' },
        { value: 2, label: 'FEV' },
        { value: 3, label: 'MAR' },
        { value: 4, label: 'ABR' },
        { value: 5, label: 'MAI' },
        { value: 6, label: 'JUN' },
        { value: 7, label: 'JUL' },
        { value: 8, label: 'AGO' },
        { value: 9, label: 'SET' },
        { value: 10, label: 'OUT' },
        { value: 11, label: 'NOV' },
        { value: 12, label: 'DEZ' }
    ];

    useEffect(() => {
        if (hasLoadedRef.current) {
            return;
        }
        
        if (!loadConsultantReports || !consultants || consultants.length === 0) {
            setConsultantsWithReports(consultants || []);
            hasLoadedRef.current = true;
            return;
        }
        
        const loadAllReports = async () => {
            setLoadingReports(true);
            try {
                const updatedConsultants = await Promise.all(
                    consultants.map(async (consultant) => {
                        try {
                            const reports = await loadConsultantReports(consultant.id);
                            return { ...consultant, consultant_reports: reports };
                        } catch (error) {
                            console.warn(`⚠️ Erro ao carregar relatórios do consultor ${consultant.id}:`, error);
                            return consultant;
                        }
                    })
                );
                
                setConsultantsWithReports(updatedConsultants);
                hasLoadedRef.current = true;
            } catch (error) {
                console.error('❌ Erro ao carregar relatórios:', error);
                hasLoadedRef.current = true;
            } finally {
                setLoadingReports(false);
            }
        };

        loadAllReports();
    }, [loadConsultantReports, consultants]);

    const filteredData = useMemo(() => {
        let filtered = consultantsWithReports.filter(c => c.consultant_reports && c.consultant_reports.length > 0);

        if (selectedClient !== 'all') {
            const client = clients.find(c => c.razao_social_cliente === selectedClient);
            if (client) {
                const clientManagers = usuariosCliente.filter(u => u.id_cliente === client.id);
                const managerIds = clientManagers.map(m => m.id);
                filtered = filtered.filter(c => c.gestor_imediato_id && managerIds.includes(c.gestor_imediato_id));
            }
        }

        if (selectedConsultant !== 'all') {
            filtered = filtered.filter(c => c.nome_consultores === selectedConsultant);
        }

        filtered = filtered.filter(c => {
            if (!c.consultant_reports) return false;
            return c.consultant_reports.some(r => r.year === selectedYear);
        });

        return filtered;
    }, [consultantsWithReports, selectedClient, selectedConsultant, selectedYear, clients, usuariosCliente]);

    const statistics = useMemo(() => {
        const stats = { total: 0, excellent: 0, good: 0, medium: 0, high: 0, critical: 0 };
        stats.total = filteredData.length;

        filteredData.forEach(consultant => {
            const latestReport = consultant.consultant_reports
                ?.filter(r => r.year === selectedYear)
                .sort((a, b) => new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime())[0];

            if (latestReport) {
                switch (latestReport.riskScore) {
                    case 1: stats.excellent++; break;
                    case 2: stats.good++; break;
                    case 3: stats.medium++; break;
                    case 4: stats.high++; break;
                    case 5: stats.critical++; break;
                }
            }
        });

        return stats;
    }, [filteredData, selectedYear]);

    const getRiskColor = (score: number | null | undefined) => {
        if (!score) return 'bg-gray-200';
        switch (score) {
            case 1: return 'bg-green-500';
            case 2: return 'bg-blue-500';
            case 3: return 'bg-yellow-500';
            case 4: return 'bg-orange-600';
            case 5: return 'bg-red-500';
            default: return 'bg-gray-200';
        }
    };

    const getReportForMonth = (consultant: Consultant, month: number) => {
        if (!consultant.consultant_reports) return null;
        const reports = consultant.consultant_reports.filter(r => r.month === month && r.year === selectedYear);
        return reports.length > 0 ? reports.sort((a, b) => new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime())[0] : null;
    };

    return (
        <div className="p-4 sm:p-6 bg-white rounded-lg shadow-lg w-full max-w-7xl mx-auto">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-6 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V7a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Consultar Relatórios de Atividades
            </h2>

            {/* Filtros */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div>
                    <label className="text-sm font-medium text-gray-600">Ano</label>
                    <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                        className="mt-1 w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2"
                    >
                        {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-sm font-medium text-gray-600">Cliente</label>
                    <select
                        value={selectedClient}
                        onChange={(e) => { setSelectedClient(e.target.value); setSelectedConsultant('all'); }}
                        className="mt-1 w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2"
                    >
                        <option value="all">Todos os Clientes</option>
                        {clients.filter(c => c.ativo_cliente).sort((a, b) => a.razao_social_cliente.localeCompare(b.razao_social_cliente)).map(c => (
                            <option key={c.id} value={c.razao_social_cliente}>{c.razao_social_cliente}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-sm font-medium text-gray-600">Consultor</label>
                    <select
                        value={selectedConsultant}
                        onChange={(e) => setSelectedConsultant(e.target.value)}
                        className="mt-1 w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2"
                    >
                        <option value="all">Todos os Consultores</option>
                        {filteredData.map(c => c.nome_consultores).filter((v, i, a) => a.indexOf(v) === i).sort().map(name => (
                            <option key={name} value={name}>{name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-sm font-medium text-gray-600">Mês</label>
                    <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="mt-1 w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2"
                    >
                        <option value="all">Todos os Meses</option>
                        {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                </div>
            </div>

            {/* Painel de Estatísticas */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 mb-8">
                <div className="bg-gray-100 p-3 rounded-lg text-center shadow">
                    <p className="text-2xl font-bold text-gray-800">{statistics.total}</p>
                    <p className="text-xs text-gray-600">Consultores</p>
                </div>
                <div className="bg-green-100 p-3 rounded-lg text-center shadow">
                    <p className="text-2xl font-bold text-green-700">{statistics.excellent}</p>
                    <p className="text-xs text-green-700">Excelente</p>
                </div>
                <div className="bg-blue-100 p-3 rounded-lg text-center shadow">
                    <p className="text-2xl font-bold text-blue-700">{statistics.good}</p>
                    <p className="text-xs text-blue-700">Bom</p>
                </div>
                <div className="bg-yellow-100 p-3 rounded-lg text-center shadow">
                    <p className="text-2xl font-bold text-yellow-700">{statistics.medium}</p>
                    <p className="text-xs text-yellow-700">Médio</p>
                </div>
                <div className="bg-orange-100 p-3 rounded-lg text-center shadow">
                    <p className="text-2xl font-bold text-orange-700">{statistics.high}</p>
                    <p className="text-xs text-orange-700">Alto</p>
                </div>
                <div className="bg-red-100 p-3 rounded-lg text-center shadow">
                    <p className="text-2xl font-bold text-red-700">{statistics.critical}</p>
                    <p className="text-xs text-red-700">Crítico</p>
                </div>
            </div>

            {/* Tabela de Dados */}
            <div className="overflow-x-auto bg-white rounded-lg shadow">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-20">Consultor</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                            {months.map(m => (
                                <th key={m.value} scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{m.label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loadingReports ? (
                            <tr><td colSpan={14} className="text-center py-10 text-gray-500">⏳ Carregando relatórios...</td></tr>
                        ) : filteredData.length > 0 ? (
                            filteredData.map(consultant => (
                                <tr key={consultant.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-white hover:bg-gray-50 z-10">{consultant.nome_consultores}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{clients.find(c => c.id === usuariosCliente.find(uc => uc.id === consultant.gestor_imediato_id)?.id_cliente)?.razao_social_cliente || 'N/A'}</td>
                                    {months.map(m => {
                                        const report = getReportForMonth(consultant, m.value);
                                        return (
                                            <td key={m.value} className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                                                <span 
                                                    className={`h-5 w-5 rounded-full inline-block cursor-pointer ${getRiskColor(report?.riskScore)}`}
                                                    onClick={() => report && setViewingReport(report)}
                                                    title={report ? `Score: ${report.riskScore}` : 'Sem relatório'}
                                                ></span>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))
                        ) : (
                            <tr><td colSpan={14} className="text-center py-10 text-gray-500">Nenhum relatório encontrado para os filtros selecionados.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal de Visualização de Relatório */}
            {viewingReport && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-lg font-bold text-gray-800">Detalhes do Relatório</h3>
                            <button onClick={() => setViewingReport(null)} className="text-gray-400 hover:text-gray-600">&times;</button>
                        </div>
                        <div className="space-y-4 text-sm">
                            <p><strong>Consultor:</strong> {consultants.find(c => c.id === viewingReport.consultant_id)?.nome_consultores}</p>
                            <p><strong>Mês/Ano:</strong> {months.find(m => m.value === viewingReport.month)?.label}/{viewingReport.year}</p>
                            <p><strong>Score de Risco:</strong> <span className={`px-2 py-1 rounded-full text-white text-xs ${getRiskColor(viewingReport.riskScore)}`}>{viewingReport.riskScore}</span></p>
                            <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: viewingReport.content || '' }}></div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AtividadesConsultar;

