'''
import React, { useState, useMemo, useEffect } from 'react';
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

    const months = [
        { value: 1, label: 'Janeiro' }, { value: 2, label: 'Fevereiro' }, { value: 3, label: 'Março' },
        { value: 4, label: 'Abril' }, { value: 5, label: 'Maio' }, { value: 6, label: 'Junho' },
        { value: 7, label: 'Julho' }, { value: 8, label: 'Agosto' }, { value: 9, label: 'Setembro' },
        { value: 10, label: 'Outubro' }, { value: 11, label: 'Novembro' }, { value: 12, label: 'Dezembro' }
    ];

    useEffect(() => {
        const loadAllReports = async () => {
            if (!loadConsultantReports || consultants.length === 0) return;
            
            setLoadingReports(true);
            try {
                const updatedConsultants = await Promise.all(
                    consultants.map(async (consultant) => {
                        try {
                            const reports = await loadConsultantReports(consultant.id);
                            return { ...consultant, consultant_reports: reports };
                        } catch (error) {
                            return consultant; // Retorna o consultor original em caso de erro
                        }
                    })
                );
                setConsultantsWithReports(updatedConsultants);
            } catch (error) {
                console.error('❌ Erro ao carregar relatórios:', error);
            } finally {
                setLoadingReports(false);
            }
        };

        loadAllReports();
    }, [loadConsultantReports, consultants]);

    const filteredData = useMemo(() => {
        let filtered = consultantsWithReports;

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

        // Filtra para garantir que o consultor tenha relatórios no ano selecionado
        return filtered.filter(c => 
            c.consultant_reports && c.consultant_reports.some(r => r.year === selectedYear)
        );

    }, [consultantsWithReports, selectedClient, selectedConsultant, selectedYear, clients, usuariosCliente]);

    // ✅ NOVO: Lógica para calcular estatísticas com base nos relatórios carregados
    const statistics = useMemo(() => {
        const stats = { total: 0, excellent: 0, good: 0, medium: 0, high: 0, critical: 0 };
        stats.total = filteredData.length;

        filteredData.forEach(consultant => {
            // Encontra o relatório mais recente do ano selecionado
            const latestReport = consultant.consultant_reports
                ?.filter(r => r.year === selectedYear)
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

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
        return reports.length > 0 ? reports.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] : null;
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
                {/* ... Filtros de Ano, Cliente, Consultor, Mês ... */}
            </div>

            {/* ✅ PAINEL DE ESTATÍSTICAS RESTAURADO */}
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

            {/* Tabela de Relatórios */}
            {!loadingReports && filteredData.length > 0 ? (
                <div className="overflow-x-auto">
                    {/* ... Tabela de Relatórios ... */}
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
                    {/* ... Modal ... */}
                </div>
            )}
        </div>
    );
};

export default AtividadesConsultar;
'''
