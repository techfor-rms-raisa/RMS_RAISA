import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Client, Consultant, UsuarioCliente, ConsultantReport } from '../types';

interface AtividadesExportarProps {
    clients: Client[];
    consultants: Consultant[];
    usuariosCliente: UsuarioCliente[];
    loadConsultantReports?: (consultantId: number) => Promise<ConsultantReport[]>;
}

const AtividadesExportar: React.FC<AtividadesExportarProps> = ({
    clients,
    consultants,
    usuariosCliente,
    loadConsultantReports
}) => {
    const [selectedClient, setSelectedClient] = useState<string>('all');
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
    const [selectedFormat, setSelectedFormat] = useState<'csv' | 'txt' | 'json'>('csv');
    const [includeDetails, setIncludeDetails] = useState(true);
    const [loadingReports, setLoadingReports] = useState(false);
    const [consultantsWithReports, setConsultantsWithReports] = useState<Consultant[]>([]);
    
    // ✅ Rastrear se os dados já foram carregados para evitar loop infinito
    const hasLoadedRef = useRef(false);

    const months = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    // ✅ Carregar relatórios apenas UMA VEZ quando o componente monta
    useEffect(() => {
        // ⚠️ Se já foi carregado, não carregar novamente
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
                console.log('📊 Carregando relatórios de todos os consultores para exportação...');
                
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
                console.log('✅ Relatórios carregados com sucesso para exportação!');
                // ✅ Marcar como carregado para evitar loop
                hasLoadedRef.current = true;
            } catch (error) {
                console.error('❌ Erro ao carregar relatórios:', error);
                // ✅ Mesmo em caso de erro, marcar como carregado
                hasLoadedRef.current = true;
            } finally {
                setLoadingReports(false);
            }
        };

        loadAllReports();
    }, [loadConsultantReports]);

    const getRiskLabel = (score: number | null | undefined) => {
        if (!score) return 'N/A';
        switch (score) {
            case 1: return 'Excelente';
            case 2: return 'Bom';
            case 3: return 'Médio';
            case 4: return 'Alto';
            case 5: return 'Crítico';
            default: return 'N/A';
        }
    };

    // ✅ Filtrar consultores com dados carregados
    const filteredConsultants = useMemo(() => {
        let filtered = consultantsWithReports.filter(c => 
            c.consultant_reports && c.consultant_reports.some(r => r.year === selectedYear)
        );

        if (selectedClient !== 'all') {
            const client = clients.find(c => c.razao_social_cliente === selectedClient);
            if (client) {
                const clientManagers = usuariosCliente.filter(u => u.id_cliente === client.id);
                const managerIds = clientManagers.map(m => m.id);
                filtered = filtered.filter(c => c.gestor_imediato_id && managerIds.includes(c.gestor_imediato_id));
            }
        }

        return filtered.sort((a, b) => a.nome_consultores.localeCompare(b.nome_consultores));
    }, [consultantsWithReports, selectedClient, selectedYear, clients, usuariosCliente]);

    // ✅ Calcular estatísticas
    const statistics = useMemo(() => {
        const stats = { total: 0, excellent: 0, good: 0, medium: 0, high: 0, critical: 0 };
        stats.total = filteredConsultants.length;

        filteredConsultants.forEach(consultant => {
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
    }, [filteredConsultants, selectedYear]);

    const exportCSV = () => {
        let csv = 'Consultor,Cliente,Gestor,';
        csv += months.join(',') + ',Status Final\n';

        filteredConsultants.forEach(consultant => {
            const gestor = usuariosCliente.find(u => u.id === consultant.gestor_imediato_id);
            const cliente = gestor ? clients.find(c => c.id === gestor.id_cliente) : null;

            let row = `"${consultant.nome_consultores}",`;
            row += `"${cliente?.razao_social_cliente || 'N/A'}",`;
            row += `"${gestor?.nome_usuario_cliente || 'N/A'}",`;

            months.forEach((_, monthIndex) => {
                const report = consultant.consultant_reports?.find(
                    r => r.month === monthIndex + 1 && r.year === selectedYear
                );
                row += `"${report ? getRiskLabel(report.riskScore) : ''}"${monthIndex < months.length - 1 ? ',' : ''}`;
            });

            row += `,"${consultant.parecer_final_consultor ? getRiskLabel(consultant.parecer_final_consultor) : 'N/A'}"\n`;
            csv += row;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `relatorios_atividades_${selectedYear}.csv`;
        link.click();
    };

    const exportTXT = () => {
        let txt = `RELATÓRIO DE ATIVIDADES - ${selectedYear}\n`;
        txt += '='.repeat(80) + '\n\n';

        filteredConsultants.forEach(consultant => {
            const gestor = usuariosCliente.find(u => u.id === consultant.gestor_imediato_id);
            const cliente = gestor ? clients.find(c => c.id === gestor.id_cliente) : null;

            txt += `Consultor: ${consultant.nome_consultores}\n`;
            txt += `Cliente: ${cliente?.razao_social_cliente || 'N/A'}\n`;
            txt += `Gestor: ${gestor?.nome_usuario_cliente || 'N/A'}\n`;
            txt += '-'.repeat(80) + '\n';

            months.forEach((month, monthIndex) => {
                const report = consultant.consultant_reports?.find(
                    r => r.month === monthIndex + 1 && r.year === selectedYear
                );
                if (report) {
                    txt += `${month}: ${getRiskLabel(report.riskScore)}\n`;
                    if (includeDetails && report.summary) {
                        txt += `  Resumo: ${report.summary}\n`;
                    }
                }
            });

            txt += '\n' + '='.repeat(80) + '\n\n';
        });

        const blob = new Blob([txt], { type: 'text/plain;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `relatorios_atividades_${selectedYear}.txt`;
        link.click();
    };

    const exportJSON = () => {
        const data = filteredConsultants.map(consultant => ({
            nome: consultant.nome_consultores,
            cliente: usuariosCliente.find(u => u.id === consultant.gestor_imediato_id)?.id_cliente,
            relatorios: consultant.consultant_reports?.filter(r => r.year === selectedYear) || []
        }));

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `relatorios_atividades_${selectedYear}.json`;
        link.click();
    };

    const handleExport = () => {
        if (filteredConsultants.length === 0) {
            alert('Nenhum relatório para exportar. Verifique os filtros.');
            return;
        }

        switch (selectedFormat) {
            case 'csv':
                exportCSV();
                break;
            case 'txt':
                exportTXT();
                break;
            case 'json':
                exportJSON();
                break;
        }
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">📊 Exportar Relatórios de Atividades</h2>

            {loadingReports && (
                <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-700">⏳ Carregando relatórios para exportação...</p>
                </div>
            )}

            {/* Filtros */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
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
                        onChange={(e) => setSelectedClient(e.target.value)}
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
            </div>

            {/* ✅ PAINEL DE ESTATÍSTICAS */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                <div className="bg-gray-100 p-4 rounded-lg text-center">
                    <p className="text-2xl font-bold text-gray-800">{statistics.total}</p>
                    <p className="text-sm text-gray-600">Total</p>
                </div>
                <div className="bg-red-100 p-4 rounded-lg text-center">
                    <p className="text-2xl font-bold text-red-700">{statistics.critical}</p>
                    <p className="text-sm text-red-700">Crítico</p>
                </div>
                <div className="bg-orange-100 p-4 rounded-lg text-center">
                    <p className="text-2xl font-bold text-orange-700">{statistics.high}</p>
                    <p className="text-sm text-orange-700">Alto</p>
                </div>
                <div className="bg-yellow-100 p-4 rounded-lg text-center">
                    <p className="text-2xl font-bold text-yellow-700">{statistics.medium}</p>
                    <p className="text-sm text-yellow-700">Médio</p>
                </div>
                <div className="bg-green-100 p-4 rounded-lg text-center">
                    <p className="text-2xl font-bold text-green-700">{statistics.excellent}</p>
                    <p className="text-sm text-green-700">Baixo</p>
                </div>
            </div>

            {/* Opções de Exportação */}
            <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">✨ Opções de Exportação</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button
                        onClick={() => setSelectedFormat('csv')}
                        className={`p-4 rounded-lg border-2 transition ${selectedFormat === 'csv' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white'}`}
                    >
                        <p className="font-bold text-lg">📊 CSV</p>
                        <p className="text-sm text-gray-600">Excel, Google Sheets</p>
                    </button>
                    <button
                        onClick={() => setSelectedFormat('txt')}
                        className={`p-4 rounded-lg border-2 transition ${selectedFormat === 'txt' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white'}`}
                    >
                        <p className="font-bold text-lg">📄 TXT</p>
                        <p className="text-sm text-gray-600">Texto simples</p>
                    </button>
                    <button
                        onClick={() => setSelectedFormat('json')}
                        className={`p-4 rounded-lg border-2 transition ${selectedFormat === 'json' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white'}`}
                    >
                        <p className="font-bold text-lg">🔗 JSON</p>
                        <p className="text-sm text-gray-600">APIs, Integração</p>
                    </button>
                </div>
            </div>

            {/* Checkbox para incluir detalhes */}
            <div className="mb-6">
                <label className="flex items-center">
                    <input
                        type="checkbox"
                        checked={includeDetails}
                        onChange={(e) => setIncludeDetails(e.target.checked)}
                        className="mr-2"
                    />
                    <span className="text-sm text-gray-700">Incluir detalhes dos relatórios</span>
                </label>
            </div>

            {/* Botão de Exportação */}
            <button
                onClick={handleExport}
                disabled={loadingReports || filteredConsultants.length === 0}
                className="w-full px-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition"
            >
                {loadingReports ? '⏳ Carregando...' : `📥 Exportar em ${selectedFormat.toUpperCase()}`}
            </button>

            {!loadingReports && filteredConsultants.length === 0 && (
                <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-700">⚠️ Nenhum relatório encontrado para os filtros selecionados.</p>
                </div>
            )}
        </div>
    );
};

export default AtividadesExportar;
