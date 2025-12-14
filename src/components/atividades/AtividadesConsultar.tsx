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
    const hasLoadedReports = useRef(false);

    const months = [
        { value: 1, label: 'Janeiro' },
        { value: 2, label: 'Fevereiro' },
        { value: 3, label: 'Março' },
        { value: 4, label: 'Abril' },
        { value: 5, label: 'Maio' },
        { value: 6, label: 'Junho' },
        { value: 7, label: 'Julho' },
        { value: 8, label: 'Agosto' },
        { value: 9, label: 'Setembro' },
        { value: 10, label: 'Outubro' },
        { value: 11, label: 'Novembro' },
        { value: 12, label: 'Dezembro' }
    ];

    // ✅ Carregar relatórios APENAS UMA VEZ quando o componente monta
    useEffect(() => {
        if (hasLoadedReports.current || !loadConsultantReports || consultants.length === 0) return;
        
        hasLoadedReports.current = true;
        const loadAllReports = async () => {
            setLoadingReports(true);
            try {
                console.log('📊 Carregando relatórios de todos os consultores...');
                
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
                console.log('✅ Relatórios carregados com sucesso!');
            } catch (error) {
                console.error('❌ Erro ao carregar relatórios:', error);
            } finally {
                setLoadingReports(false);
            }
        };

        loadAllReports();
    }, []); // ✅ Dependency array vazio para executar apenas uma vez

    // ✅ Filtrar consultores e relatórios usando dados carregados
    const filteredData = useMemo(() => {
        let filtered = consultantsWithReports.filter(c => c.consultant_reports && c.consultant_reports.length > 0);

        // Filtrar por cliente
        if (selectedClient !== 'all') {
            const client = clients.find(c => c.razao_social_cliente === selectedClient);
            if (client) {
                const clientManagers = usuariosCliente.filter(u => u.id_cliente === client.id);
                const managerIds = clientManagers.map(m => m.id);
                filtered = filtered.filter(c => c.gestor_imediato_id && managerIds.includes(c.gestor_imediato_id));
            }
        }

        // Filtrar por consultor
        if (selectedConsultant !== 'all') {
            filtered = filtered.filter(c => c.nome_consultores === selectedConsultant);
        }

        // Filtrar por ano
        filtered = filtered.filter(c => {
            if (!c.consultant_reports) return false;
            return c.consultant_reports.some(r => r.year === selectedYear);
        });

        return filtered;
    }, [consultantsWithReports, selectedClient, selectedConsultant, selectedYear, clients, usuariosCliente]);

    // ✅ Calcular estatísticas com base nos relatórios carregados
    const statistics = useMemo(() => {
        const stats = { total: 0, excellent: 0, good: 0, medium: 0, high: 0, critical: 0 };
        stats.total = filteredData.length;

        filteredData.forEach(consultant => {
            // Encontra o relatório mais recente do ano selecionado
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
        if (!score) return 'bg-gray-200 text-gray-600';
        switch (score) {
            case 1: return 'bg-green-500 text-white';
            case 2: return 'bg-blue-500 text-white';
            case 3: return 'bg-yellow-500 text-white';
            case 4: return 'bg-orange-600 text-white';
            case 5: return 'bg-red-500 text-white';
            default: return 'bg-gray-200 text-gray-600';
        }
    };

    const getRiskLabel = (score: number | null | undefined) => {
        if (!score) return 'Sem Relatório';
        switch (score) {
            case 1: return 'Excelente';
            case 2: return 'Bom';
            case 3: return 'Médio';
            case 4: return 'Alto';
            case 5: return 'Crítico';
            default: return 'N/A';
        }
    };

    const getReportForMonth = (consultant: Consultant, month: number) => {
        if (!consultant.consultant_reports) return null;
        const reports = consultant.consultant_reports.filter(r => r.month === month && r.year === selectedYear);
        return reports.length > 0 ? reports.sort((a, b) => new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime())[0] : null;
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">🔍 Consultar Relatórios de Atividades</h2>

            {loadingReports && (
                <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-700">⏳ Carregando relatórios de atividades...</p>
                </div>
            )}

            {/* Filtros */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Ano</label>
                    <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                        className="w-full border border-gray-300 rounded-lg p-2"
                    >
                        {[2024, 2025, 2026].map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Cliente</label>
                    <select
                        value={selectedClient}
                        onChange={(e) => {
                            setSelectedClient(e.target.value);
                            setSelectedConsultant('all');
                        }}
                        className="w-full border border-gray-300 rounded-lg p-2"
                    >
                        <option value="all">Todos os Clientes</option>
                        {clients
                            .filter(c => c.ativo_cliente)
                            .sort((a, b) => a.razao_social_cliente.localeCompare(b.razao_social_cliente))
                            .map(c => (
                                <option key={c.id} value={c.razao_social_cliente}>
                                    {c.razao_social_cliente}
                                </option>
                            ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Consultor</label>
                    <select
                        value={selectedConsultant}
                        onChange={(e) => setSelectedConsultant(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg p-2"
                    >
                        <option value="all">Todos os Consultores</option>
                        {filteredData
                            .map(c => c.nome_consultores)
                            .filter((v, i, a) => a.indexOf(v) === i)
                            .sort()
                            .map(name => (
                                <option key={name} value={name}>{name}</option>
                            ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Mês</label>
                    <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg p-2"
                    >
                        <option value="all">Todos os Meses</option>
                        {months.map(m => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* ✅ PAINEL DE ESTATÍSTICAS */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
                <div className="bg-gray-100 p-4 rounded-lg text-center">
                    <p className="text-2xl font-bold text-gray-800">{statistics.total}</p>
                    <p className="text-sm text-gray-600">Consultores</p>
                </div>
                <div className="bg-green-100 p-4 rounded-lg text-center">
                    <p className="text-2xl font-bold text-green-700">{statistics.excellent}</p>
                    <p className="text-sm text-green-700">Excelente</p>
                </div>
                <div className="bg-blue-100 p-4 rounded-lg text-center">
                    <p className="text-2xl font-bold text-blue-700">{statistics.good}</p>
                    <p className="text-sm text-blue-700">Bom</p>
                </div>
                <div className="bg-yellow-100 p-4 rounded-lg text-center">
                    <p className="text-2xl font-bold text-yellow-700">{statistics.medium}</p>
                    <p className="text-sm text-yellow-700">Médio</p>
                </div>
                <div className="bg-orange-100 p-4 rounded-lg text-center">
                    <p className="text-2xl font-bold text-orange-700">{statistics.high}</p>
                    <p className="text-sm text-orange-700">Alto</p>
                </div>
                <div className="bg-red-100 p-4 rounded-lg text-center">
                    <p className="text-2xl font-bold text-red-700">{statistics.critical}</p>
                    <p className="text-sm text-red-700">Crítico</p>
                </div>
            </div>

            {/* ✅ TABELA DE RELATÓRIOS COM CABEÇALHO COMPLETO */}
            {!loadingReports && filteredData.length > 0 ? (
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 border border-gray-300">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase border-r border-gray-300">Consultor</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase border-r border-gray-300">Cliente</th>
                                {months.map(m => (
                                    <th key={m.value} className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase border-r border-gray-300 whitespace-nowrap">
                                        {m.label.substring(0, 3).toUpperCase()}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredData.map(consultant => {
                                const client = clients.find(cli => usuariosCliente.some(u => u.id_cliente === cli.id && u.id === consultant.gestor_imediato_id));
                                return (
                                    <tr key={consultant.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-300">{consultant.nome_consultores}</td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600 border-r border-gray-300">{client?.razao_social_cliente || 'N/A'}</td>
                                        {months.map(m => {
                                            const report = getReportForMonth(consultant, m.value);
                                            return (
                                                <td key={m.value} className="px-4 py-4 text-center border-r border-gray-300">
                                                    {report ? (
                                                        <button 
                                                            onClick={() => setViewingReport(report)}
                                                            className={`w-8 h-8 rounded-full text-xs font-bold ${getRiskColor(report.riskScore)}`}
                                                            title={`Risco: ${getRiskLabel(report.riskScore)} - Clique para ver detalhes`}
                                                        >
                                                            {report.riskScore}
                                                        </button>
                                                    ) : (
                                                        <div className="w-8 h-8 rounded-full bg-gray-100 mx-auto"></div>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                !loadingReports && (
                    <div className="text-center py-10">
                        <p className="text-lg font-semibold text-gray-700">Nenhum relatório encontrado</p>
                        <p className="text-sm text-gray-500">Ajuste os filtros ou insira novos relatórios</p>
                    </div>
                )
            )}

            {/* Modal de Visualização de Relatório */}
            {viewingReport && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg shadow-xl max-w-2xl w-full mx-4">
                        <h3 className="text-xl font-bold mb-4">Detalhes do Relatório</h3>
                        <p><strong>Consultor:</strong> {filteredData.find(c => c.consultant_reports?.some(r => r.id === viewingReport.id))?.nome_consultores}</p>
                        <p><strong>Mês/Ano:</strong> {viewingReport.month}/{viewingReport.year}</p>
                        <p><strong>Score de Risco:</strong> <span className={`font-bold ${getRiskColor(viewingReport.riskScore)}`}>{getRiskLabel(viewingReport.riskScore)} ({viewingReport.riskScore})</span></p>
                        <div className="mt-4">
                            <h4 className="font-bold">Resumo da IA:</h4>
                            <p className="text-sm bg-gray-100 p-2 rounded">{viewingReport.summary}</p>
                        </div>
                        <div className="mt-2">
                            <h4 className="font-bold">Conteúdo Original:</h4>
                            <p className="text-xs bg-gray-100 p-2 rounded max-h-40 overflow-y-auto">{viewingReport.content}</p>
                        </div>
                        <button onClick={() => setViewingReport(null)} className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                            Fechar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AtividadesConsultar;
