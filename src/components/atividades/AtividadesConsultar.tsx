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

    // Filtrar consultores e relatórios
    const filteredData = useMemo(() => {
        let filtered = consultants.filter(c => c.reports && c.reports.length > 0);

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
        filtered = filtered.filter(c => c.ano_vigencia === selectedYear);

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
            case 1: return 'Excelente';      // 🟢 Verde
            case 2: return 'Bom';            // 🔵 Azul
            case 3: return 'Médio';          // 🟡 Amarelo
            case 4: return 'Alto';           // 🟠 Laranja
            case 5: return 'Crítico';        // 🔴 Vermelho
            default: return 'N/A';
        }
    };

    const getReportForMonth = (consultant: Consultant, month: number) => {
        if (!consultant.reports) return null;
        const reports = consultant.reports.filter(r => r.month === month && r.year === selectedYear);
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
                            ))
                        }
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
                            ))
                        }
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

            {/* Estatísticas */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
                <div className="bg-gray-100 p-4 rounded-lg text-center">
                    <p className="text-2xl font-bold text-gray-800">{filteredData.length}</p>
                    <p className="text-sm text-gray-600">Consultores</p>
                </div>
                <div className="bg-green-100 p-4 rounded-lg text-center">
                    <p className="text-2xl font-bold text-green-700">
                        {filteredData.filter(c => c.parecer_final_consultor === 1).length}
                    </p>
                    <p className="text-sm text-green-700">Excelente</p>
                </div>
                <div className="bg-blue-100 p-4 rounded-lg text-center">
                    <p className="text-2xl font-bold text-blue-700">
                        {filteredData.filter(c => c.parecer_final_consultor === 2).length}
                    </p>
                    <p className="text-sm text-blue-700">Bom</p>
                </div>
                <div className="bg-yellow-100 p-4 rounded-lg text-center">
                    <p className="text-2xl font-bold text-yellow-700">
                        {filteredData.filter(c => c.parecer_final_consultor === 3).length}
                    </p>
                    <p className="text-sm text-yellow-700">Médio</p>
                </div>
                <div className="bg-orange-100 p-4 rounded-lg text-center">
                    <p className="text-2xl font-bold text-orange-700">
                        {filteredData.filter(c => c.parecer_final_consultor === 4).length}
                    </p>
                    <p className="text-sm text-orange-700">Alto</p>
                </div>
                <div className="bg-red-100 p-4 rounded-lg text-center">
                    <p className="text-2xl font-bold text-red-700">
                        {filteredData.filter(c => c.parecer_final_consultor === 5).length}
                    </p>
                    <p className="text-sm text-red-700">Crítico</p>
                </div>
            </div>

            {/* Tabela de Relatórios */}
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Consultor</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Jan</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Fev</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Mar</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Abr</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Mai</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Jun</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Jul</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Ago</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Set</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Out</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Nov</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Dez</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredData.map(consultant => {
                            const gestor = usuariosCliente.find(u => u.id === consultant.gestor_imediato_id);
                            const cliente = gestor ? clients.find(c => c.id === gestor.id_cliente) : null;

                            return (
                                <tr key={consultant.id}>
                                    <td className="px-4 py-3 whitespace-nowrap">{consultant.nome_consultores}</td>
                                    <td className="px-4 py-3 whitespace-nowrap">{cliente?.razao_social_cliente || '-'}</td>
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(month => {
                                        const report = getReportForMonth(consultant, month);
                                        const score = consultant[`parecer_${month}_consultor` as keyof Consultant] as number | null;
                                        
                                        if (selectedMonth !== 'all' && parseInt(selectedMonth) !== month) {
                                            return <td key={month} className="px-4 py-3"></td>;
                                        }

                                        return (
                                            <td key={month} className="px-4 py-3 text-center">
                                                {report ? (
                                                    <button
                                                        onClick={() => setViewingReport(report)}
                                                        className={`w-8 h-8 rounded-full ${getRiskColor(score)} font-bold text-xs hover:opacity-80 transition`}
                                                        title={`Clique para ver detalhes - ${getRiskLabel(score)}`}
                                                    >
                                                        {score || '?'}
                                                    </button>
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-gray-200 mx-auto"></div>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {filteredData.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                        <p className="text-lg">📭 Nenhum relatório encontrado</p>
                        <p className="text-sm mt-2">Ajuste os filtros ou insira novos relatórios</p>
                    </div>
                )}
            </div>

            {/* Modal de Detalhes do Relatório */}
            {viewingReport && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
                            <h3 className="text-xl font-bold">
                                Detalhes do Relatório ({months[viewingReport.month - 1]?.label}/{viewingReport.year})
                            </h3>
                            <button 
                                onClick={() => setViewingReport(null)}
                                className="text-gray-500 hover:text-gray-700 text-3xl font-bold"
                            >
                                &times;
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            {/* Score de Risco */}
                            <div className={`p-4 rounded-lg ${getRiskColor(viewingReport.riskScore)}`}>
                                <p className="text-sm font-medium">Nível de Risco</p>
                                <p className="text-2xl font-bold">{getRiskLabel(viewingReport.riskScore)} ({viewingReport.riskScore})</p>
                            </div>

                            {/* Resumo */}
                            <div className="bg-gray-50 p-4 rounded-lg">
                                <p className="text-sm font-medium text-gray-700 mb-2">📋 Resumo:</p>
                                <p className="text-gray-800">{viewingReport.summary}</p>
                            </div>

                            {/* Padrão Negativo */}
                            {viewingReport.negativePattern && (
                                <div className="bg-orange-50 border border-orange-200 p-4 rounded-lg">
                                    <p className="text-sm font-medium text-orange-900 mb-2">⚠️ Padrões Identificados:</p>
                                    <p className="text-orange-800">{viewingReport.negativePattern}</p>
                                </div>
                            )}

                            {/* Alerta Preditivo */}
                            {viewingReport.predictiveAlert && (
                                <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
                                    <p className="text-sm font-medium text-red-900 mb-2">🚨 Alerta:</p>
                                    <p className="text-red-800">{viewingReport.predictiveAlert}</p>
                                </div>
                            )}

                            {/* Recomendações */}
                            {viewingReport.recommendations && viewingReport.recommendations.length > 0 && (
                                <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                                    <p className="text-sm font-medium text-blue-900 mb-3">💡 Recomendações:</p>
                                    <ul className="space-y-2">
                                        {viewingReport.recommendations.map((rec, idx) => (
                                            <li key={idx} className="text-blue-800">
                                                <strong>{rec.tipo}:</strong> {rec.descricao}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Conteúdo Original */}
                            <div className="bg-gray-50 p-4 rounded-lg">
                                <p className="text-sm font-medium text-gray-700 mb-2">📄 Atividades Registradas:</p>
                                <p className="text-gray-800 whitespace-pre-wrap">{viewingReport.content}</p>
                            </div>

                            {/* Metadados */}
                            <div className="text-xs text-gray-500 border-t pt-3">
                                <p>Criado em: {new Date(viewingReport.createdAt).toLocaleString('pt-BR')}</p>
                                <p>Gerado por: {viewingReport.generatedBy === 'manual' ? 'Inserção Manual' : 'Importação em Lote'}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Legenda */}
            <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-gray-800 mb-3">📊 Legenda de Níveis de Risco:</h4>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-red-500"></div>
                        <span><strong>1 - Crítico</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-orange-500"></div>
                        <span><strong>2 - Alto</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-yellow-500"></div>
                        <span><strong>3 - Médio</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-green-500"></div>
                        <span><strong>4 - Baixo</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gray-200"></div>
                        <span><strong>Sem Relatório</strong></span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AtividadesConsultar;
