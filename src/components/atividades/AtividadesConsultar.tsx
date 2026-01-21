/**
 * AtividadesConsultar.tsx - Consulta de Relatórios de Atividades
 * 
 * 🆕 v2.4: Ordenação por data mais recente (21/01/2026)
 * - Relatórios ordenados por data de criação (descendente)
 * - Suporte a edição de relatórios via onEdit callback
 */

import React, { useState, useMemo } from 'react';
import { Client, Consultant, UsuarioCliente, ConsultantReport, RiskScore } from '@/types';
import MonthlyReportsModal from '../MonthlyReportsModal'; // 🆕 v2.4: Usar versão do diretório pai

interface AtividadesConsultarProps {
    clients: Client[];
    consultants: Consultant[];
    usuariosCliente: UsuarioCliente[];
    loadConsultantReports?: (consultantId: number) => Promise<ConsultantReport[]>;
    onEditReport?: (report: ConsultantReport) => void; // 🆕 v2.4: Callback para edição
    currentUserName?: string; // 🆕 v2.4: Nome do usuário atual
}

const AtividadesConsultar: React.FC<AtividadesConsultarProps> = ({
    clients,
    consultants,
    usuariosCliente,
    loadConsultantReports,
    onEditReport, // 🆕 v2.4
    currentUserName, // 🆕 v2.4
}) => {
    const [selectedClient, setSelectedClient] = useState<string>('all');
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState<string>('all');
    
    // Estados para o modal
    const [showModal, setShowModal] = useState(false);
    const [modalData, setModalData] = useState<{ consultant: Consultant; month: number; reports: ConsultantReport[] } | null>(null);
    const [loadingModal, setLoadingModal] = useState(false);

    const months = [
        { value: 1, label: 'JAN' }, { value: 2, label: 'FEV' }, { value: 3, label: 'MAR' },
        { value: 4, label: 'ABR' }, { value: 5, label: 'MAI' }, { value: 6, label: 'JUN' },
        { value: 7, label: 'JUL' }, { value: 8, label: 'AGO' }, { value: 9, label: 'SET' },
        { value: 10, label: 'OUT' }, { value: 11, label: 'NOV' }, { value: 12, label: 'DEZ' }
    ];

    // ============================================================================
    // ✅ CORREÇÃO: Buscar anos REAIS do Supabase (consultores + relatórios)
    // ============================================================================
    const availableYears = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const uniqueYears = new Set<number>();
        
        // 1. Extrair anos do campo ano_vigencia dos consultores
        consultants.forEach(c => {
            if (c.ano_vigencia !== null && c.ano_vigencia !== undefined && !isNaN(c.ano_vigencia)) {
                uniqueYears.add(c.ano_vigencia);
            }
        });
        
        // 2. Extrair anos dos relatórios (consultant_reports)
        consultants.forEach(c => {
            const reports = c.consultant_reports || c.reports || [];
            reports.forEach((r: any) => {
                const reportYear = r.year || r.reportYear;
                if (reportYear !== null && reportYear !== undefined && !isNaN(reportYear)) {
                    uniqueYears.add(reportYear);
                }
            });
        });
        
        // 3. Se não encontrou nenhum ano, adicionar apenas o ano atual como fallback
        if (uniqueYears.size === 0) {
            uniqueYears.add(currentYear);
        }
        
        // Converter para array e ordenar (mais recente primeiro)
        return [...uniqueYears].sort((a, b) => b - a);
    }, [consultants]);

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
        // ✅ v2.4: Filtrar por status E ano_vigencia (tratando NULL)
        const activeConsultants = consultants.filter(c => 
            c.status === 'Ativo' && 
            (c.ano_vigencia === selectedYear || c.ano_vigencia === null || c.ano_vigencia === undefined)
        );
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

        // ✅ CORREÇÃO: Ordenar consultores por nome dentro de cada cliente
        clientMap.forEach((consultantsList, clientName) => {
            consultantsList.sort((a, b) => 
                (a.nome_consultores || '').localeCompare(b.nome_consultores || '', 'pt-BR')
            );
        });

        let clientEntries = Array.from(clientMap.entries());

        if (selectedClient !== 'all') {
            clientEntries = clientEntries.filter(([clientName]) => clientName === selectedClient);
        }

        // Ordenar clientes por nome
        return clientEntries.sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));

    }, [consultants, clients, usuariosCliente, selectedClient, selectedYear]);

    const statistics = useMemo(() => {
        const stats = { total: 0, excellent: 0, good: 0, medium: 0, high: 0, critical: 0 };
        const consultantsInFilter = dataGroupedByClient.flatMap(([, consultants]) => consultants);
        stats.total = consultantsInFilter.length;

        consultantsInFilter.forEach(consultant => {
            let score: RiskScore | null = null;
            
            // Primeiro: tentar usar relatórios
            const reports = consultant.consultant_reports || consultant.reports || [];
            
            if (selectedMonth !== 'all') {
                const monthNum = parseInt(selectedMonth);
                const monthReports = reports.filter((r: any) => 
                    r.year === selectedYear && r.month === monthNum
                );
                
                if (monthReports.length > 0) {
                    const latestReport = [...monthReports].sort((a: any, b: any) => 
                        new Date(b.created_at || b.createdAt || 0).getTime() - 
                        new Date(a.created_at || a.createdAt || 0).getTime()
                    )[0];
                    score = (latestReport as any).risk_score || (latestReport as any).riskScore || null;
                }
                
                // Fallback para campo parecer_X_consultor
                if (!score) {
                    const monthField = `parecer_${selectedMonth}_consultor` as keyof Consultant;
                    score = consultant[monthField] as RiskScore | null;
                }
            } else {
                // Todos os meses - usar parecer_final ou último relatório
                const yearReports = reports.filter((r: any) => r.year === selectedYear);
                
                if (yearReports.length > 0) {
                    const latestReport = [...yearReports].sort((a: any, b: any) => 
                        new Date(b.created_at || b.createdAt || 0).getTime() - 
                        new Date(a.created_at || a.createdAt || 0).getTime()
                    )[0];
                    score = (latestReport as any).risk_score || (latestReport as any).riskScore || null;
                }
                
                if (!score) {
                    score = consultant.parecer_final_consultor || null;
                }
            }

            if (score && String(score) !== '#FFFF') {
                switch (score) {
                    case 1: stats.excellent++; break;
                    case 2: stats.good++; break;
                    case 3: stats.medium++; break;
                    case 4: stats.high++; break;
                    case 5: stats.critical++; break;
                }
            }
        });

        return stats;
    }, [dataGroupedByClient, selectedMonth, selectedYear]);

    // ✅ CORRIGIDO: Usar relatórios que já vêm com o consultant + campos parecer_X_consultor
    const getReportInfoForMonth = (consultant: Consultant, month: number): { score: RiskScore | null, count: number, hasData: boolean } => {
        // Primeiro: tentar usar relatórios que já vieram com o consultant
        const reports = consultant.consultant_reports || consultant.reports || [];
        const monthReports = reports.filter((r: any) => 
            r.year === selectedYear && r.month === month
        );
        
        if (monthReports.length > 0) {
            // Ordenar para pegar o mais recente
            const latestReport = [...monthReports].sort((a: any, b: any) => 
                new Date(b.created_at || b.createdAt || 0).getTime() - 
                new Date(a.created_at || a.createdAt || 0).getTime()
            )[0];
            
            const score = (latestReport as any).risk_score || (latestReport as any).riskScore || null;
            return { score, count: monthReports.length, hasData: true };
        }

        // Fallback: usar campo parecer_X_consultor
        const oldField = `parecer_${month}_consultor` as keyof Consultant;
        const oldScore = consultant[oldField] as RiskScore | null;
        
        if (oldScore && oldScore !== null && String(oldScore) !== '#FFFF') {
            return { score: oldScore, count: 1, hasData: true };
        }

        return { score: null, count: 0, hasData: false };
    };

    const getFinalReportInfo = (consultant: Consultant): { score: RiskScore | null, totalCount: number } => {
        // Contar relatórios do ano
        const reports = consultant.consultant_reports || consultant.reports || [];
        const yearReports = reports.filter((r: any) => r.year === selectedYear);
        
        // Pegar score do relatório mais recente ou do parecer_final
        let finalScore: RiskScore | null = null;
        
        if (yearReports.length > 0) {
            const latestReport = [...yearReports].sort((a: any, b: any) => 
                new Date(b.created_at || b.createdAt || 0).getTime() - 
                new Date(a.created_at || a.createdAt || 0).getTime()
            )[0];
            finalScore = (latestReport as any).risk_score || (latestReport as any).riskScore || null;
        }
        
        // Fallback para parecer_final_consultor
        if (!finalScore || String(finalScore) === '#FFFF') {
            finalScore = consultant.parecer_final_consultor || null;
        }
        
        // Fallback: buscar o último mês com score
        if (!finalScore || String(finalScore) === '#FFFF') {
            for (let i = 12; i >= 1; i--) {
                const oldField = `parecer_${i}_consultor` as keyof Consultant;
                const oldScore = consultant[oldField] as RiskScore | null;
                if (oldScore && String(oldScore) !== '#FFFF') {
                    finalScore = oldScore;
                    break;
                }
            }
        }

        return { score: finalScore, totalCount: yearReports.length };
    };

    // ✅ LAZY LOADING: Carrega relatórios apenas quando o usuário clica
    // 🆕 v2.4: Ordenação por data mais recente
    const handleCircleClick = async (consultant: Consultant, month: number) => {
        if (!loadConsultantReports) {
            console.warn('loadConsultantReports não disponível');
            return;
        }

        setLoadingModal(true);
        
        try {
            console.log(`📊 Carregando relatórios para ${consultant.nome_consultores}, mês ${month}...`);
            
            // Carregar relatórios APENAS deste consultor
            const allReports = await loadConsultantReports(consultant.id);
            
            // Filtrar pelo mês e ano selecionado
            const monthReports = allReports.filter(r => 
                (r as any).month === month && (r as any).year === selectedYear
            );
            
            // 🆕 v2.4: Ordenar por data mais recente (descendente)
            const sortedReports = [...monthReports].sort((a: any, b: any) => 
                new Date(b.created_at || b.createdAt || 0).getTime() - 
                new Date(a.created_at || a.createdAt || 0).getTime()
            );
            
            console.log(`✅ ${sortedReports.length} relatório(s) encontrado(s)`);
            
            if (sortedReports.length > 0) {
                setModalData({ consultant, month, reports: sortedReports });
                setShowModal(true);
            } else {
                // Mostrar modal vazio ou alerta
                setModalData({ consultant, month, reports: [] });
                setShowModal(true);
            }
        } catch (error) {
            console.error('❌ Erro ao carregar relatórios:', error);
            alert('Erro ao carregar relatórios. Tente novamente.');
        } finally {
            setLoadingModal(false);
        }
    };

    return (
        <>
            <div className="w-full mx-auto">
                <h2 className="text-2xl font-bold text-gray-800 mb-6">🔍 Consultar Relatórios de Atividades</h2>

                {/* Filtros */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6 p-4 bg-gray-50 rounded-lg shadow-sm">
                    <div>
                        <label className="text-sm font-medium text-gray-600">Ano</label>
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                            className="mt-1 w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2"
                        >
                            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
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
                <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
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

                {/* Loading indicator */}
                {loadingModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-40">
                        <div className="bg-white p-4 rounded-lg shadow-lg">
                            <p className="text-gray-700">⏳ Carregando relatórios...</p>
                        </div>
                    </div>
                )}

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
                                            <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Final</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {clientConsultants.map(consultant => {
                                            const finalReportInfo = getFinalReportInfo(consultant);
                                            return (
                                                <tr key={consultant.id}>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="text-sm font-medium text-gray-900">{consultant.nome_consultores}</div>
                                                    </td>
                                                    {months.map(m => {
                                                        const reportInfo = getReportInfoForMonth(consultant, m.value);
                                                        return (
                                                            <td key={m.value} className="px-2 py-4 text-center">
                                                                <div 
                                                                    className={`mx-auto h-6 w-6 rounded-full flex items-center justify-center font-bold text-white text-xs ${
                                                                        reportInfo.hasData ? 'cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-indigo-400' : ''
                                                                    } ${getRiskColor(reportInfo.score)}`}
                                                                    onClick={() => reportInfo.hasData && handleCircleClick(consultant, m.value)}
                                                                    title={reportInfo.hasData ? `${reportInfo.count} relatório(s) - Clique para ver detalhes` : 'Sem dados'}
                                                                >
                                                                    {reportInfo.count > 0 ? reportInfo.count : ''}
                                                                </div>
                                                            </td>
                                                        );
                                                    })}
                                                    <td className="px-6 py-4 text-center whitespace-nowrap">
                                                        <div className={`mx-auto h-7 w-7 rounded-full flex items-center justify-center font-bold text-white ${getRiskColor(finalReportInfo.score)}`}>
                                                            {finalReportInfo.totalCount > 0 ? finalReportInfo.totalCount : (finalReportInfo.score || '-')}
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

                {dataGroupedByClient.length === 0 && (
                    <div className="text-center py-10 text-gray-500">
                        Nenhum consultor encontrado com os filtros selecionados.
                    </div>
                )}
            </div>

            {/* Renderizar o Modal */}
            {showModal && modalData && (
                <MonthlyReportsModal 
                    consultant={modalData.consultant}
                    month={modalData.month}
                    reports={modalData.reports}
                    onClose={() => setShowModal(false)}
                    onEdit={onEditReport} // 🆕 v2.4
                    currentUserName={currentUserName} // 🆕 v2.4
                />
            )}
        </>
    );
};

export default AtividadesConsultar;
