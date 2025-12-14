import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Client, Consultant, UsuarioCliente, ConsultantReport, RiskScore } from '../../src/components/types';

interface AtividadesConsultarProps {
    clients: Client[];
    consultants: Consultant[];
    usuariosCliente: UsuarioCliente[];
    loadConsultantReports?: (consultantId: number) => Promise<ConsultantReport[]>;
    onNavigateToAtividades?: (clientName?: string, consultantName?: string) => void;
}

const AtividadesConsultar: React.FC<AtividadesConsultarProps> = ({
    clients,
    consultants,
    usuariosCliente,
    loadConsultantReports,
    onNavigateToAtividades
}) => {
    const [selectedClient, setSelectedClient] = useState<string>('all');
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
    const [loadingReports, setLoadingReports] = useState(false);
    const [consultantsWithReports, setConsultantsWithReports] = useState<Consultant[]>([]);
    
    const hasLoadedRef = useRef(false);

    const months = [
        { value: 1, label: 'JAN' }, { value: 2, label: 'FEV' }, { value: 3, label: 'MAR' },
        { value: 4, label: 'ABR' }, { value: 5, label: 'MAI' }, { value: 6, label: 'JUN' },
        { value: 7, label: 'JUL' }, { value: 8, label: 'AGO' }, { value: 9, label: 'SET' },
        { value: 10, label: 'OUT' }, { value: 11, label: 'NOV' }, { value: 12, label: 'DEZ' }
    ];

    useEffect(() => {
        if (hasLoadedRef.current || !loadConsultantReports || !consultants?.length) {
            setConsultantsWithReports(consultants || []);
            if(!hasLoadedRef.current) hasLoadedRef.current = true;
            return;
        }
        
        const loadAllReports = async () => {
            setLoadingReports(true);
            try {
                const updatedConsultants = await Promise.all(
                    consultants.map(async (c) => {
                        const reports = await loadConsultantReports(c.id);
                        return { ...c, consultant_reports: reports };
                    })
                );
                setConsultantsWithReports(updatedConsultants);
            } catch (error) {
                console.error('❌ Erro ao carregar relatórios:', error);
            } finally {
                setLoadingReports(false);
                hasLoadedRef.current = true;
            }
        };

        loadAllReports();
    }, [loadConsultantReports, consultants]);

    const getRiskColor = (score: RiskScore | null | undefined, type: 'bg' | 'text' | 'border' = 'bg') => {
        const colorMap: { [key in RiskScore]: string } = {
            1: 'green-500',
            2: 'blue-500',
            3: 'yellow-500',
            4: 'orange-500',
            5: 'red-500',
        };
        const color = score ? colorMap[score] : 'gray-300';
        if (type === 'bg') return `bg-${color}`;
        if (type === 'text') return `text-${color}`;
        return `border-${color}`;
    };

    const dataGroupedByClient = useMemo(() => {
        const activeConsultants = consultantsWithReports.filter(c => c.status === 'Ativo');
        const clientMap = new Map<string, Consultant[]>();

        activeConsultants.forEach(consultant => {
            const manager = usuariosCliente.find(u => u.id === consultant.gestor_imediato_id);
            const client = clients.find(c => c.id === manager?.id_cliente);
            const clientName = client?.razao_social_cliente || 'Cliente não identificado';

            if (!clientMap.has(clientName)) {
                clientMap.set(clientName, []);
            }
            clientMap.get(clientName)!.push(consultant);
        });

        let clientEntries = Array.from(clientMap.entries());

        if (selectedClient !== 'all') {
            clientEntries = clientEntries.filter(([clientName]) => clientName === selectedClient);
        }

        return clientEntries.sort((a, b) => a[0].localeCompare(b[0]));

    }, [consultantsWithReports, clients, usuariosCliente, selectedClient]);

    const getReportInfoForMonth = (consultant: Consultant, month: number): { score: RiskScore | null, count: number } => {
        const reports = consultant.consultant_reports || consultant.reports || [];
        const monthReports = reports.filter(r => r.year === selectedYear && r.month === month);
        
        if (monthReports.length > 0) {
            const latestReport = monthReports.sort((a, b) => new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime())[0];
            return { score: latestReport.riskScore, count: monthReports.length };
        }

        const oldField = `parecer_${month}_consultor` as keyof Consultant;
        const oldScore = consultant[oldField] as RiskScore | null;
        if(oldScore) return { score: oldScore, count: 1 };

        return { score: null, count: 0 };
    };

    const getFinalReportInfo = (consultant: Consultant): { score: RiskScore | null, totalCount: number } => {
        const reports = consultant.consultant_reports || consultant.reports || [];
        const yearReports = reports.filter(r => r.year === selectedYear);
        const latestReport = [...yearReports].sort((a, b) => new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime())[0];

        let finalScore = latestReport?.riskScore || consultant.parecer_final_consultor || null;
        
        // If no reports, check old parecer fields for a score
        if(yearReports.length === 0) {
            for(let i = 12; i >= 1; i--) {
                const oldField = `parecer_${i}_consultor` as keyof Consultant;
                const oldScore = consultant[oldField] as RiskScore | null;
                if(oldScore) {
                    finalScore = oldScore;
                    break;
                }
            }
        }

        return { score: finalScore, totalCount: yearReports.length };
    }

    return (
        <div className="w-full mx-auto">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">🔍 Consultar Relatórios de Atividades</h2>

            {/* Filtros */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-lg shadow-sm">
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
                        onChange={(e) => setSelectedClient(e.target.value)}
                        className="mt-1 w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2"
                    >
                        <option value="all">Todos os Clientes</option>
                        {clients.filter(c => c.ativo_cliente).sort((a, b) => a.razao_social_cliente.localeCompare(b.razao_social_cliente)).map(c => (
                            <option key={c.id} value={c.razao_social_cliente}>{c.razao_social_cliente}</option>
                        ))}
                    </select>
                </div>
            </div>

            {loadingReports && <div className="text-center p-10">⏳ Carregando relatórios...</div>}

            {!loadingReports && (
                <div className="space-y-6">
                    {dataGroupedByClient.map(([clientName, clientConsultants]) => (
                        <div key={clientName} className="bg-white rounded-lg shadow-md border border-gray-200">
                            <div className="p-4 border-b border-gray-200">
                                <h3 className="font-bold text-lg text-gray-700">{clientName}</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="min-w-full">
                                    <thead>
                                        <tr className="border-b border-gray-200">
                                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Consultor</th>
                                            {months.map(m => <th key={m.value} className="px-2 py-3 text-center text-xs font-semibold text-gray-500 uppercase">{m.label}</th>)}
                                            <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {clientConsultants.map(consultant => {
                                            const finalReportInfo = getFinalReportInfo(consultant);
                                            return (
                                                <tr key={consultant.id}>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="flex items-center">
                                                            <div className="text-sm font-medium text-gray-900">{consultant.nome_consultores}</div>
                                                            <button 
                                                                onClick={() => onNavigateToAtividades?.(clientName, consultant.nome_consultores)}
                                                                className="ml-4 px-2 py-1 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                                                            >
                                                                + Atividade
                                                            </button>
                                                        </div>
                                                    </td>
                                                    {months.map(m => {
                                                        const reportInfo = getReportInfoForMonth(consultant, m.value);
                                                        return (
                                                            <td key={m.value} className="px-2 py-4 text-center">
                                                                <div className={`mx-auto h-6 w-6 rounded-full flex items-center justify-center font-bold text-white text-xs ${getRiskColor(reportInfo.score)}`}>
                                                                    {reportInfo.count > 0 ? reportInfo.count : ''}
                                                                </div>
                                                            </td>
                                                        );
                                                    })}
                                                    <td className="px-6 py-4 text-center whitespace-nowrap">
                                                        <div className={`mx-auto h-7 w-7 rounded-full flex items-center justify-center font-bold text-white ${getRiskColor(finalReportInfo.score)}`}>
                                                            {finalReportInfo.totalCount}
                                                        </div>
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
            )}
        </div>
    );
};

export default AtividadesConsultar;
