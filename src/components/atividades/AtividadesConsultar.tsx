import React, { useState, useMemo } from 'react';
import { Client, Consultant, UsuarioCliente, ConsultantReport } from '../../src/components/types';

interface AtividadesConsultarProps {
    clients: Client[];
    consultants: Consultant[];
    usuariosCliente: UsuarioCliente[];
}

const AtividadesConsultar: React.FC<AtividadesConsultarProps> = ({
    clients,
    consultants,
    usuariosCliente
}) => {
    const [selectedClient, setSelectedClient] = useState<string>('all');
    const [selectedConsultant, setSelectedConsultant] = useState<string>('all');
    const [selectedMonth, setSelectedMonth] = useState<string>('all');
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
    const [viewingReport, setViewingReport] = useState<ConsultantReport | null>(null);

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

    // ✅ CORREÇÃO: Filtrar consultores e relatórios usando 'consultant_reports' do Supabase
    const filteredData = useMemo(() => {
        // Usar 'consultant_reports' que vêm do Supabase, em vez de 'reports'
        let filtered = consultants.filter(c => c.consultant_reports && c.consultant_reports.length > 0);

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
    }, [consultants, selectedClient, selectedConsultant, selectedYear, clients, usuariosCliente]);

    const getRiskColor = (score: number | null | undefined) => {
        if (!score) return 'bg-gray-200 text-gray-600';
        switch (score) {
            case 1: return 'bg-green-500 text-white';    // 🟢 Verde - Excelente
            case 2: return 'bg-blue-500 text-white';     // 🔵 Azul - Bom
            case 3: return 'bg-yellow-500 text-white';   // 🟡 Amarelo - Médio
            case 4: return 'bg-orange-600 text-white';   // 🟠 Laranja - Alto
            case 5: return 'bg-red-500 text-white';      // 🔴 Vermelho - Crítico
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

    // ✅ CORREÇÃO: Buscar relatório em 'consultant_reports'
    const getReportForMonth = (consultant: Consultant, month: number) => {
        if (!consultant.consultant_reports) return null;
        const reports = consultant.consultant_reports.filter(r => r.month === month && r.year === selectedYear);
        return reports.length > 0 ? reports[reports.length - 1] : null;
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">🔍 Consultar Relatórios de Atividades</h2>

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

            {/* Tabela de Relatórios */}
            {filteredData.length > 0 ? (
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Consultor</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                                {months.map(m => (
                                    <th key={m.value} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">{m.label.substring(0, 3)}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredData.map(consultant => {
                                const client = clients.find(cli => usuariosCliente.some(u => u.id_cliente === cli.id && u.id === consultant.gestor_imediato_id));
                                return (
                                    <tr key={consultant.id}>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{consultant.nome_consultores}</td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{client?.razao_social_cliente || 'N/A'}</td>
                                        {months.map(m => {
                                            const report = getReportForMonth(consultant, m.value);
                                            return (
                                                <td key={m.value} className="px-4 py-4 text-center">
                                                    {report ? (
                                                        <button 
                                                            onClick={() => setViewingReport(report)}
                                                            className={`w-8 h-8 rounded-full text-xs font-bold ${getRiskColor(report.riskScore)}`}
                                                            title={`Risco: ${getRiskLabel(report.riskScore)} - Clique para ver detalhes`}
                                                        >
                                                            {report.riskScore}
                                                        </button>
                                                    ) : (
                                                        <div className="w-8 h-8 rounded-full bg-gray-100"></div>
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
                <div className="text-center py-10">
                    <p className="text-lg font-semibold text-gray-700">Nenhum relatório encontrado</p>
                    <p className="text-sm text-gray-500">Ajuste os filtros ou insira novos relatórios</p>
                </div>
            )}

            {/* Modal de Visualização de Relatório */}
            {viewingReport && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg shadow-xl max-w-2xl w-full">
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
