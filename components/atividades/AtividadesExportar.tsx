import React, { useState, useMemo } from 'react';
import { Client, Consultant, UsuarioCliente } from '../../src/components/types';

interface AtividadesExportarProps {
    clients: Client[];
    consultants: Consultant[];
    usuariosCliente: UsuarioCliente[];
}

const AtividadesExportar: React.FC<AtividadesExportarProps> = ({
    clients,
    consultants,
    usuariosCliente
}) => {
    const [selectedClient, setSelectedClient] = useState<string>('all');
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
    const [selectedFormat, setSelectedFormat] = useState<'csv' | 'txt' | 'json'>('csv');
    const [includeDetails, setIncludeDetails] = useState(true);

    const months = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    const getRiskLabel = (score: number | null | undefined) => {
        if (!score) return 'N/A';
        switch (score) {
            case 1: return 'Crítico';        // 🔴 Vermelho
            case 2: return 'Moderado';       // 🟡 Amarelo
            case 3: return 'Satisfatório';   // 🟢 Verde
            case 4: return 'Excelente';      // 🔵 Azul
            default: return 'N/A';
        }
    };

    // Filtrar consultores
    const filteredConsultants = useMemo(() => {
        let filtered = consultants.filter(c => c.ano_vigencia === selectedYear);

        if (selectedClient !== 'all') {
            const client = clients.find(c => c.razao_social_cliente === selectedClient);
            if (client) {
                const clientManagers = usuariosCliente.filter(u => u.id_cliente === client.id);
                const managerIds = clientManagers.map(m => m.id);
                filtered = filtered.filter(c => c.gestor_imediato_id && managerIds.includes(c.gestor_imediato_id));
            }
        }

        return filtered.sort((a, b) => a.nome_consultores.localeCompare(b.nome_consultores));
    }, [consultants, selectedClient, selectedYear, clients, usuariosCliente]);

    const exportCSV = () => {
        let csv = 'Consultor,Cliente,Gestor,';
        csv += months.join(',') + ',Status Final\n';

        filteredConsultants.forEach(consultant => {
            const gestor = usuariosCliente.find(u => u.id === consultant.gestor_imediato_id);
            const cliente = gestor ? clients.find(c => c.id === gestor.id_cliente) : null;

            let row = `"${consultant.nome_consultores}",`;
            row += `"${cliente?.razao_social_cliente || 'N/A'}",`;
            row += `"${gestor?.nome_gestor_cliente || 'N/A'}",`;

            for (let m = 1; m <= 12; m++) {
                const score = consultant[`parecer_${m}_consultor` as keyof Consultant] as number | null;
                row += `${score || ''},`;
            }

            row += `${getRiskLabel(consultant.parecer_final_consultor)}\n`;
            csv += row;
        });

        if (includeDetails) {
            csv += '\n\nDetalhes dos Relatórios\n';
            csv += 'Consultor,Mês,Ano,Risco,Resumo,Padrões Negativos,Alerta,Atividades\n';

            filteredConsultants.forEach(consultant => {
                if (consultant.reports && consultant.reports.length > 0) {
                    consultant.reports
                        .filter(r => r.year === selectedYear)
                        .forEach(report => {
                            let row = `"${consultant.nome_consultores}",`;
                            row += `"${months[report.month - 1]}",`;
                            row += `${report.year},`;
                            row += `${getRiskLabel(report.riskScore)},`;
                            row += `"${report.summary.replace(/"/g, '""')}",`;
                            row += `"${report.negativePattern?.replace(/"/g, '""') || 'N/A'}",`;
                            row += `"${report.predictiveAlert?.replace(/"/g, '""') || 'N/A'}",`;
                            row += `"${report.content.replace(/"/g, '""')}"\n`;
                            csv += row;
                        });
                }
            });
        }

        downloadFile(csv, `relatorios_atividades_${selectedYear}.csv`, 'text/csv');
    };

    const exportTXT = () => {
        let txt = `RELATÓRIOS DE ATIVIDADES - ${selectedYear}\n`;
        txt += `Gerado em: ${new Date().toLocaleString('pt-BR')}\n`;
        txt += `Cliente: ${selectedClient === 'all' ? 'Todos' : selectedClient}\n`;
        txt += `Total de Consultores: ${filteredConsultants.length}\n`;
        txt += '='.repeat(80) + '\n\n';

        filteredConsultants.forEach(consultant => {
            const gestor = usuariosCliente.find(u => u.id === consultant.gestor_imediato_id);
            const cliente = gestor ? clients.find(c => c.id === gestor.id_cliente) : null;

            txt += `CONSULTOR: ${consultant.nome_consultores}\n`;
            txt += `Cliente: ${cliente?.razao_social_cliente || 'N/A'}\n`;
            txt += `Gestor: ${gestor?.nome_gestor_cliente || 'N/A'}\n`;
            txt += `Cargo: ${consultant.cargo_consultores}\n`;
            txt += `Status Final: ${getRiskLabel(consultant.parecer_final_consultor)}\n`;
            txt += '-'.repeat(80) + '\n';

            txt += 'Scores Mensais:\n';
            for (let m = 1; m <= 12; m++) {
                const score = consultant[`parecer_${m}_consultor` as keyof Consultant] as number | null;
                if (score) {
                    txt += `  ${months[m - 1]}: ${score} (${getRiskLabel(score)})\n`;
                }
            }

            if (includeDetails && consultant.reports && consultant.reports.length > 0) {
                txt += '\nDetalhes dos Relatórios:\n';
                consultant.reports
                    .filter(r => r.year === selectedYear)
                    .sort((a, b) => a.month - b.month)
                    .forEach(report => {
                        txt += `\n  ${months[report.month - 1]}/${report.year}:\n`;
                        txt += `  Risco: ${getRiskLabel(report.riskScore)}\n`;
                        txt += `  Resumo: ${report.summary}\n`;
                        if (report.negativePattern) {
                            txt += `  Padrões: ${report.negativePattern}\n`;
                        }
                        if (report.predictiveAlert) {
                            txt += `  Alerta: ${report.predictiveAlert}\n`;
                        }
                        txt += `  Atividades: ${report.content}\n`;
                    });
            }

            txt += '\n' + '='.repeat(80) + '\n\n';
        });

        downloadFile(txt, `relatorios_atividades_${selectedYear}.txt`, 'text/plain');
    };

    const exportJSON = () => {
        const data = filteredConsultants.map(consultant => {
            const gestor = usuariosCliente.find(u => u.id === consultant.gestor_imediato_id);
            const cliente = gestor ? clients.find(c => c.id === gestor.id_cliente) : null;

            const obj: any = {
                consultor: consultant.nome_consultores,
                cliente: cliente?.razao_social_cliente || 'N/A',
                gestor: gestor?.nome_gestor_cliente || 'N/A',
                cargo: consultant.cargo_consultores,
                ano: selectedYear,
                status_final: getRiskLabel(consultant.parecer_final_consultor),
                scores_mensais: {}
            };

            for (let m = 1; m <= 12; m++) {
                const score = consultant[`parecer_${m}_consultor` as keyof Consultant] as number | null;
                if (score) {
                    obj.scores_mensais[months[m - 1]] = {
                        valor: score,
                        nivel: getRiskLabel(score)
                    };
                }
            }

            if (includeDetails && consultant.reports && consultant.reports.length > 0) {
                obj.relatorios_detalhados = consultant.reports
                    .filter(r => r.year === selectedYear)
                    .map(r => ({
                        mes: months[r.month - 1],
                        ano: r.year,
                        risco: {
                            valor: r.riskScore,
                            nivel: getRiskLabel(r.riskScore)
                        },
                        resumo: r.summary,
                        padroes_negativos: r.negativePattern || null,
                        alerta_preditivo: r.predictiveAlert || null,
                        recomendacoes: r.recommendations || [],
                        atividades: r.content,
                        criado_em: r.createdAt,
                        gerado_por: r.generatedBy
                    }));
            }

            return obj;
        });

        const json = JSON.stringify({
            ano: selectedYear,
            cliente: selectedClient === 'all' ? 'Todos' : selectedClient,
            total_consultores: filteredConsultants.length,
            gerado_em: new Date().toISOString(),
            dados: data
        }, null, 2);

        downloadFile(json, `relatorios_atividades_${selectedYear}.json`, 'application/json');
    };

    const downloadFile = (content: string, filename: string, mimeType: string) => {
        const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleExport = () => {
        if (filteredConsultants.length === 0) {
            alert('⚠️ Nenhum consultor encontrado com os filtros selecionados.');
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

        alert(`✅ Arquivo exportado com sucesso!\n\n${filteredConsultants.length} consultor(es) incluído(s).`);
    };

    // Estatísticas
    const stats = useMemo(() => {
        const total = filteredConsultants.length;
        const critico = filteredConsultants.filter(c => c.parecer_final_consultor === 1).length;
        const alto = filteredConsultants.filter(c => c.parecer_final_consultor === 2).length;
        const medio = filteredConsultants.filter(c => c.parecer_final_consultor === 3).length;
        const baixo = filteredConsultants.filter(c => c.parecer_final_consultor === 4).length;

        return { total, critico, alto, medio, baixo };
    }, [filteredConsultants]);

    return (
        <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">📥 Exportar Relatórios de Atividades</h2>

            {/* Filtros */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Ano</label>
                    <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                        className="w-full border border-gray-300 rounded-lg p-3"
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
                        className="w-full border border-gray-300 rounded-lg p-3"
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
            </div>

            {/* Estatísticas */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                <div className="bg-gray-100 p-4 rounded-lg text-center">
                    <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
                    <p className="text-sm text-gray-600">Total</p>
                </div>
                <div className="bg-red-100 p-4 rounded-lg text-center">
                    <p className="text-2xl font-bold text-red-700">{stats.critico}</p>
                    <p className="text-sm text-red-700">Crítico</p>
                </div>
                <div className="bg-orange-100 p-4 rounded-lg text-center">
                    <p className="text-2xl font-bold text-orange-700">{stats.alto}</p>
                    <p className="text-sm text-orange-700">Alto</p>
                </div>
                <div className="bg-yellow-100 p-4 rounded-lg text-center">
                    <p className="text-2xl font-bold text-yellow-700">{stats.medio}</p>
                    <p className="text-sm text-yellow-700">Médio</p>
                </div>
                <div className="bg-green-100 p-4 rounded-lg text-center">
                    <p className="text-2xl font-bold text-green-700">{stats.baixo}</p>
                    <p className="text-sm text-green-700">Baixo</p>
                </div>
            </div>

            {/* Opções de Exportação */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
                <h3 className="font-semibold text-gray-800 mb-4">⚙️ Opções de Exportação</h3>

                <div className="space-y-4">
                    {/* Formato */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Formato do Arquivo</label>
                        <div className="grid grid-cols-3 gap-4">
                            <button
                                onClick={() => setSelectedFormat('csv')}
                                className={`p-4 rounded-lg border-2 transition ${
                                    selectedFormat === 'csv'
                                        ? 'border-blue-600 bg-blue-50'
                                        : 'border-gray-300 hover:border-gray-400'
                                }`}
                            >
                                <p className="font-bold text-lg">📊 CSV</p>
                                <p className="text-xs text-gray-600 mt-1">Excel, Google Sheets</p>
                            </button>
                            <button
                                onClick={() => setSelectedFormat('txt')}
                                className={`p-4 rounded-lg border-2 transition ${
                                    selectedFormat === 'txt'
                                        ? 'border-blue-600 bg-blue-50'
                                        : 'border-gray-300 hover:border-gray-400'
                                }`}
                            >
                                <p className="font-bold text-lg">📄 TXT</p>
                                <p className="text-xs text-gray-600 mt-1">Texto simples</p>
                            </button>
                            <button
                                onClick={() => setSelectedFormat('json')}
                                className={`p-4 rounded-lg border-2 transition ${
                                    selectedFormat === 'json'
                                        ? 'border-blue-600 bg-blue-50'
                                        : 'border-gray-300 hover:border-gray-400'
                                }`}
                            >
                                <p className="font-bold text-lg">🔧 JSON</p>
                                <p className="text-xs text-gray-600 mt-1">APIs, Integração</p>
                            </button>
                        </div>
                    </div>

                    {/* Incluir Detalhes */}
                    <div className="flex items-center gap-3">
                        <input
                            type="checkbox"
                            id="includeDetails"
                            checked={includeDetails}
                            onChange={(e) => setIncludeDetails(e.target.checked)}
                            className="w-5 h-5 text-blue-600"
                        />
                        <label htmlFor="includeDetails" className="text-sm font-medium text-gray-700">
                            Incluir detalhes completos dos relatórios (resumo, padrões, alertas, recomendações)
                        </label>
                    </div>
                </div>
            </div>

            {/* Preview */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h4 className="font-semibold text-blue-900 mb-2">📋 O que será exportado:</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                    <li>✅ {stats.total} consultor(es)</li>
                    <li>✅ Scores mensais de Janeiro a Dezembro/{selectedYear}</li>
                    <li>✅ Status final de cada consultor</li>
                    {includeDetails && <li>✅ Detalhes completos de todos os relatórios</li>}
                    {!includeDetails && <li>⚪ Apenas scores (sem detalhes)</li>}
                </ul>
            </div>

            {/* Botão de Exportação */}
            <div className="flex justify-end">
                <button
                    onClick={handleExport}
                    className="px-8 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-bold text-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
                    disabled={stats.total === 0}
                >
                    📥 Exportar {selectedFormat.toUpperCase()}
                </button>
            </div>

            {stats.total === 0 && (
                <div className="text-center mt-6 text-orange-600">
                    <p className="font-medium">⚠️ Nenhum consultor encontrado com os filtros selecionados.</p>
                    <p className="text-sm mt-1">Ajuste o ano ou cliente para ver os dados.</p>
                </div>
            )}
        </div>
    );
};

export default AtividadesExportar;
