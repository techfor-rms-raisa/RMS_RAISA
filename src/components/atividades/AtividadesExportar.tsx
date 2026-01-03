/**
 * AtividadesExportar.tsx - Exportação de Relatórios de Atividades
 * 
 * ATUALIZADO:
 * - Filtros: Ano, Cliente/Todos, Mês/Todos, Consultor/Todos
 * - Formatos: CSV e PDF (removido TXT e JSON)
 * - PDF formatado com Content, Data, Cliente, Consultor, Gestão de Pessoas, Score, Recomendações
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Client, Consultant, UsuarioCliente, User, ConsultantReport } from '@/types';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Estender tipos do jsPDF para autoTable
declare module 'jspdf' {
    interface jsPDF {
        autoTable: (options: any) => jsPDF;
        lastAutoTable: { finalY: number };
    }
}

interface AtividadesExportarProps {
    clients: Client[];
    consultants: Consultant[];
    usuariosCliente: UsuarioCliente[];
    users?: User[];
    loadConsultantReports?: (consultantId: number) => Promise<ConsultantReport[]>;
}

const AtividadesExportar: React.FC<AtividadesExportarProps> = ({
    clients,
    consultants,
    usuariosCliente,
    users = [],
    loadConsultantReports
}) => {
    // ===== ESTADOS =====
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
    const [selectedClient, setSelectedClient] = useState<string>('all');
    const [selectedMonth, setSelectedMonth] = useState<string>('all');
    const [selectedConsultant, setSelectedConsultant] = useState<string>('all');
    const [selectedFormat, setSelectedFormat] = useState<'csv' | 'pdf'>('csv');
    const [loadingReports, setLoadingReports] = useState(false);
    const [consultantsWithReports, setConsultantsWithReports] = useState<Consultant[]>([]);
    const [exporting, setExporting] = useState(false);
    
    const hasLoadedRef = useRef(false);

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

    // ===== ANOS DISPONÍVEIS =====
    const availableYears = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const uniqueYears = new Set<number>();
        
        consultants.forEach(c => {
            if (c.ano_vigencia) uniqueYears.add(c.ano_vigencia);
            const reports = c.consultant_reports || c.reports || [];
            reports.forEach((r: any) => {
                if (r.year) uniqueYears.add(r.year);
            });
        });
        
        if (uniqueYears.size === 0) uniqueYears.add(currentYear);
        return [...uniqueYears].sort((a, b) => b - a);
    }, [consultants]);

    // ===== CARREGAR RELATÓRIOS =====
    useEffect(() => {
        if (hasLoadedRef.current) return;
        
        if (!loadConsultantReports || !consultants || consultants.length === 0) {
            setConsultantsWithReports(consultants || []);
            hasLoadedRef.current = true;
            return;
        }
        
        const loadAllReports = async () => {
            setLoadingReports(true);
            try {
                console.log('📊 Carregando relatórios para exportação...');
                
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
                console.log('✅ Relatórios carregados!');
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

    // ===== HELPERS =====
    const getRiskLabel = (score: number | null | undefined): string => {
        if (!score) return 'N/A';
        const labels: Record<number, string> = {
            1: 'Excelente',
            2: 'Bom',
            3: 'Médio',
            4: 'Alto',
            5: 'Crítico'
        };
        return labels[score] || 'N/A';
    };

    const getRiskColor = (score: number | null | undefined): string => {
        if (!score) return '#666666';
        const colors: Record<number, string> = {
            1: '#22c55e', // Verde
            2: '#3b82f6', // Azul
            3: '#eab308', // Amarelo
            4: '#f97316', // Laranja
            5: '#ef4444'  // Vermelho
        };
        return colors[score] || '#666666';
    };

    const getGestorName = (consultant: Consultant): string => {
        const gestor = usuariosCliente.find(u => u.id === consultant.gestor_imediato_id);
        return gestor?.nome_gestor_cliente || 'N/A';
    };

    const getClientName = (consultant: Consultant): string => {
        const gestor = usuariosCliente.find(u => u.id === consultant.gestor_imediato_id);
        const client = gestor ? clients.find(c => c.id === gestor.id_cliente) : null;
        return client?.razao_social_cliente || 'N/A';
    };

    const getGestaoPessoasName = (consultant: Consultant): string => {
        if (!consultant.id_gestao_de_pessoas) return 'N/A';
        const user = users.find(u => u.id === consultant.id_gestao_de_pessoas);
        return user?.nome_usuario || 'N/A';
    };

    const formatDate = (dateStr: string | undefined): string => {
        if (!dateStr) return 'N/A';
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } catch {
            return 'N/A';
        }
    };

    // ===== CLIENTES ÚNICOS =====
    const uniqueClients = useMemo(() => {
        return clients
            .filter(c => c.ativo_cliente)
            .sort((a, b) => a.razao_social_cliente.localeCompare(b.razao_social_cliente));
    }, [clients]);

    // ===== CONSULTORES FILTRADOS POR CLIENTE =====
    const consultantsForFilter = useMemo(() => {
        // ✅ v2.4: Filtrar por status E ano_vigencia (tratando NULL)
        let filtered = consultantsWithReports.filter(c => 
            c.status === 'Ativo' && 
            (c.ano_vigencia === selectedYear || c.ano_vigencia === null || c.ano_vigencia === undefined)
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
    }, [consultantsWithReports, selectedClient, clients, usuariosCliente, selectedYear]);

    // ===== RELATÓRIOS FILTRADOS =====
    const filteredReports = useMemo(() => {
        let reports: Array<ConsultantReport & { consultant: Consultant }> = [];
        
        consultantsWithReports.forEach(consultant => {
            const consultantReports = consultant.consultant_reports || [];
            consultantReports.forEach(report => {
                reports.push({ ...report, consultant });
            });
        });

        // Filtrar por ano
        reports = reports.filter(r => r.year === selectedYear);

        // Filtrar por cliente
        if (selectedClient !== 'all') {
            reports = reports.filter(r => getClientName(r.consultant) === selectedClient);
        }

        // Filtrar por mês
        if (selectedMonth !== 'all') {
            reports = reports.filter(r => r.month === parseInt(selectedMonth));
        }

        // Filtrar por consultor
        if (selectedConsultant !== 'all') {
            reports = reports.filter(r => r.consultant.nome_consultores === selectedConsultant);
        }

        // Ordenar por data (mais recente primeiro)
        return reports.sort((a, b) => {
            const dateA = new Date(a.createdAt || a.created_at || 0).getTime();
            const dateB = new Date(b.createdAt || b.created_at || 0).getTime();
            return dateB - dateA;
        });
    }, [consultantsWithReports, selectedYear, selectedClient, selectedMonth, selectedConsultant]);

    // ===== ESTATÍSTICAS =====
    const statistics = useMemo(() => {
        const stats = { total: 0, excellent: 0, good: 0, medium: 0, high: 0, critical: 0 };
        stats.total = filteredReports.length;

        filteredReports.forEach(report => {
            switch (report.riskScore) {
                case 1: stats.excellent++; break;
                case 2: stats.good++; break;
                case 3: stats.medium++; break;
                case 4: stats.high++; break;
                case 5: stats.critical++; break;
            }
        });

        return stats;
    }, [filteredReports]);

    // ===== EXPORTAR CSV =====
    const exportCSV = () => {
        let csv = 'Data;Consultor;Cliente;Gestor;Gestão de Pessoas;Mês;Ano;Score;Status;Conteúdo;Resumo IA;Recomendações\n';

        filteredReports.forEach(report => {
            const consultant = report.consultant;
            const recommendations = Array.isArray(report.recommendations) 
                ? report.recommendations.map((r: any) => `${r.tipo}: ${r.descricao}`).join(' | ')
                : '';

            const row = [
                formatDate(report.createdAt || report.created_at),
                consultant.nome_consultores,
                getClientName(consultant),
                getGestorName(consultant),
                getGestaoPessoasName(consultant),
                months.find(m => m.value === report.month)?.label || report.month,
                report.year,
                report.riskScore,
                getRiskLabel(report.riskScore),
                `"${(report.content || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
                `"${(report.summary || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
                `"${recommendations.replace(/"/g, '""')}"`
            ].join(';');

            csv += row + '\n';
        });

        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `relatorios_atividades_${selectedYear}${selectedMonth !== 'all' ? '_' + months.find(m => m.value === parseInt(selectedMonth))?.label : ''}.csv`;
        link.click();
    };

    // ===== EXPORTAR PDF =====
    const exportPDF = async () => {
        setExporting(true);
        
        try {
            const doc = new jsPDF('p', 'mm', 'a4');
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 15;
            let yPos = margin;

            // ===== CABEÇALHO =====
            doc.setFillColor(30, 58, 138); // Azul escuro
            doc.rect(0, 0, pageWidth, 35, 'F');
            
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            doc.text('RMS-RAISA.ai', margin, 15);
            
            doc.setFontSize(12);
            doc.setFont('helvetica', 'normal');
            doc.text('Relatório de Atividades', margin, 25);
            
            // Data de geração
            doc.setFontSize(10);
            doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, pageWidth - margin - 60, 15);

            yPos = 45;

            // ===== FILTROS APLICADOS =====
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('Filtros aplicados:', margin, yPos);
            
            doc.setFont('helvetica', 'normal');
            const filtrosText = [
                `Ano: ${selectedYear}`,
                `Cliente: ${selectedClient === 'all' ? 'Todos' : selectedClient}`,
                `Mês: ${selectedMonth === 'all' ? 'Todos' : months.find(m => m.value === parseInt(selectedMonth))?.label}`,
                `Consultor: ${selectedConsultant === 'all' ? 'Todos' : selectedConsultant}`
            ].join('  |  ');
            doc.text(filtrosText, margin, yPos + 6);
            
            yPos += 15;

            // ===== ESTATÍSTICAS =====
            doc.setFillColor(245, 245, 245);
            doc.rect(margin, yPos, pageWidth - (margin * 2), 20, 'F');
            
            doc.setFontSize(9);
            const statsY = yPos + 8;
            const colWidth = (pageWidth - (margin * 2)) / 5;
            
            // Total
            doc.setFont('helvetica', 'bold');
            doc.text(`${statistics.total}`, margin + colWidth * 0.5, statsY, { align: 'center' });
            doc.setFont('helvetica', 'normal');
            doc.text('Total', margin + colWidth * 0.5, statsY + 6, { align: 'center' });
            
            // Crítico
            doc.setTextColor(239, 68, 68);
            doc.setFont('helvetica', 'bold');
            doc.text(`${statistics.critical}`, margin + colWidth * 1.5, statsY, { align: 'center' });
            doc.setFont('helvetica', 'normal');
            doc.text('Crítico', margin + colWidth * 1.5, statsY + 6, { align: 'center' });
            
            // Alto
            doc.setTextColor(249, 115, 22);
            doc.setFont('helvetica', 'bold');
            doc.text(`${statistics.high}`, margin + colWidth * 2.5, statsY, { align: 'center' });
            doc.setFont('helvetica', 'normal');
            doc.text('Alto', margin + colWidth * 2.5, statsY + 6, { align: 'center' });
            
            // Médio
            doc.setTextColor(234, 179, 8);
            doc.setFont('helvetica', 'bold');
            doc.text(`${statistics.medium}`, margin + colWidth * 3.5, statsY, { align: 'center' });
            doc.setFont('helvetica', 'normal');
            doc.text('Médio', margin + colWidth * 3.5, statsY + 6, { align: 'center' });
            
            // Baixo
            doc.setTextColor(34, 197, 94);
            doc.setFont('helvetica', 'bold');
            doc.text(`${statistics.excellent + statistics.good}`, margin + colWidth * 4.5, statsY, { align: 'center' });
            doc.setFont('helvetica', 'normal');
            doc.text('Baixo', margin + colWidth * 4.5, statsY + 6, { align: 'center' });
            
            doc.setTextColor(0, 0, 0);
            yPos += 30;

            // ===== RELATÓRIOS DETALHADOS =====
            for (let i = 0; i < filteredReports.length; i++) {
                const report = filteredReports[i];
                const consultant = report.consultant;

                // Verificar se precisa de nova página
                if (yPos > pageHeight - 80) {
                    doc.addPage();
                    yPos = margin;
                }

                // ===== CARD DO RELATÓRIO =====
                const cardHeight = 65;
                
                // Borda colorida baseada no score
                const scoreColor = getRiskColor(report.riskScore);
                doc.setDrawColor(parseInt(scoreColor.slice(1, 3), 16), parseInt(scoreColor.slice(3, 5), 16), parseInt(scoreColor.slice(5, 7), 16));
                doc.setLineWidth(1);
                doc.line(margin, yPos, margin, yPos + cardHeight);
                
                // Background do card
                doc.setFillColor(250, 250, 250);
                doc.rect(margin + 2, yPos, pageWidth - (margin * 2) - 2, cardHeight, 'F');

                // ===== CABEÇALHO DO CARD =====
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(30, 58, 138);
                doc.text(consultant.nome_consultores, margin + 5, yPos + 7);

                // Score Badge
                doc.setFillColor(parseInt(scoreColor.slice(1, 3), 16), parseInt(scoreColor.slice(3, 5), 16), parseInt(scoreColor.slice(5, 7), 16));
                const badgeWidth = 25;
                doc.roundedRect(pageWidth - margin - badgeWidth - 5, yPos + 2, badgeWidth, 10, 2, 2, 'F');
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(8);
                doc.text(`Score ${report.riskScore}`, pageWidth - margin - badgeWidth / 2 - 5, yPos + 8, { align: 'center' });

                // ===== DADOS DO CONSULTOR =====
                doc.setTextColor(100, 100, 100);
                doc.setFontSize(8);
                doc.setFont('helvetica', 'normal');
                
                const info1 = `Cliente: ${getClientName(consultant)}  |  Gestor: ${getGestorName(consultant)}`;
                doc.text(info1, margin + 5, yPos + 14);
                
                const info2 = `Gestão de Pessoas: ${getGestaoPessoasName(consultant)}  |  Data: ${formatDate(report.createdAt || report.created_at)}  |  ${months.find(m => m.value === report.month)?.label}/${report.year}`;
                doc.text(info2, margin + 5, yPos + 20);

                // ===== CONTEÚDO DO RELATÓRIO =====
                doc.setTextColor(0, 0, 0);
                doc.setFontSize(8);
                doc.setFont('helvetica', 'bold');
                doc.text('Atividades:', margin + 5, yPos + 28);
                
                doc.setFont('helvetica', 'normal');
                const content = report.content || report.summary || 'Sem conteúdo disponível';
                const contentLines = doc.splitTextToSize(content.substring(0, 300) + (content.length > 300 ? '...' : ''), pageWidth - (margin * 2) - 15);
                doc.text(contentLines.slice(0, 3), margin + 5, yPos + 34);

                // ===== RECOMENDAÇÕES =====
                if (report.recommendations && Array.isArray(report.recommendations) && report.recommendations.length > 0) {
                    doc.setFontSize(8);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(30, 58, 138);
                    doc.text('Recomendações:', margin + 5, yPos + 52);
                    
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(80, 80, 80);
                    const recsText = report.recommendations.slice(0, 2).map((r: any) => `• ${r.tipo}: ${r.descricao}`).join('  ');
                    const recsLines = doc.splitTextToSize(recsText.substring(0, 200), pageWidth - (margin * 2) - 15);
                    doc.text(recsLines.slice(0, 2), margin + 5, yPos + 58);
                }

                yPos += cardHeight + 8;
            }

            // ===== RODAPÉ =====
            const totalPages = doc.internal.pages.length - 1;
            for (let i = 1; i <= totalPages; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(150, 150, 150);
                doc.text(`RMS-RAISA.ai - Página ${i} de ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
            }

            // ===== SALVAR =====
            const fileName = `relatorios_atividades_${selectedYear}${selectedMonth !== 'all' ? '_' + months.find(m => m.value === parseInt(selectedMonth))?.label : ''}.pdf`;
            doc.save(fileName);
            
        } catch (error) {
            console.error('❌ Erro ao gerar PDF:', error);
            alert('Erro ao gerar PDF. Tente novamente.');
        } finally {
            setExporting(false);
        }
    };

    // ===== HANDLER DE EXPORTAÇÃO =====
    const handleExport = () => {
        if (filteredReports.length === 0) {
            alert('Nenhum relatório para exportar. Verifique os filtros.');
            return;
        }

        if (selectedFormat === 'csv') {
            exportCSV();
        } else {
            exportPDF();
        }
    };

    // ===== RENDER =====
    return (
        <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                📊 Exportar Relatórios de Atividades
            </h2>

            {loadingReports && (
                <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-700">⏳ Carregando relatórios para exportação...</p>
                </div>
            )}

            {/* ===== FILTROS ===== */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
                {/* Ano */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Ano</label>
                    <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                        className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                        {availableYears.map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                </div>

                {/* Cliente */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Cliente</label>
                    <select
                        value={selectedClient}
                        onChange={(e) => {
                            setSelectedClient(e.target.value);
                            setSelectedConsultant('all'); // Reset consultor ao mudar cliente
                        }}
                        className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                        <option value="all">Todos os Clientes</option>
                        {uniqueClients.map(c => (
                            <option key={c.id} value={c.razao_social_cliente}>
                                {c.razao_social_cliente}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Mês */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Mês</label>
                    <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                        <option value="all">Todos os Meses</option>
                        {months.map(m => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                    </select>
                </div>

                {/* Consultor */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Consultor</label>
                    <select
                        value={selectedConsultant}
                        onChange={(e) => setSelectedConsultant(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                        <option value="all">Todos os Consultores</option>
                        {consultantsForFilter.map(c => (
                            <option key={c.id} value={c.nome_consultores}>
                                {c.nome_consultores}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* ===== ESTATÍSTICAS ===== */}
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
                    <p className="text-2xl font-bold text-green-700">{statistics.excellent + statistics.good}</p>
                    <p className="text-sm text-green-700">Baixo</p>
                </div>
            </div>

            {/* ===== OPÇÕES DE EXPORTAÇÃO ===== */}
            <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">✨ Opções de Exportação</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                        onClick={() => setSelectedFormat('csv')}
                        className={`p-4 rounded-lg border-2 transition ${selectedFormat === 'csv' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white hover:border-gray-400'}`}
                    >
                        <p className="font-bold text-lg">📊 CSV</p>
                        <p className="text-sm text-gray-600">Excel, Google Sheets</p>
                    </button>
                    <button
                        onClick={() => setSelectedFormat('pdf')}
                        className={`p-4 rounded-lg border-2 transition ${selectedFormat === 'pdf' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white hover:border-gray-400'}`}
                    >
                        <p className="font-bold text-lg">📄 PDF</p>
                        <p className="text-sm text-gray-600">Relatório formatado para impressão</p>
                    </button>
                </div>
            </div>

            {/* ===== BOTÃO EXPORTAR ===== */}
            <button
                onClick={handleExport}
                disabled={loadingReports || exporting || filteredReports.length === 0}
                className="w-full px-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition flex items-center justify-center gap-2"
            >
                {exporting ? (
                    <>⏳ Gerando {selectedFormat.toUpperCase()}...</>
                ) : loadingReports ? (
                    <>⏳ Carregando...</>
                ) : (
                    <>📥 Exportar {filteredReports.length} relatório(s) em {selectedFormat.toUpperCase()}</>
                )}
            </button>

            {!loadingReports && filteredReports.length === 0 && (
                <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-700">⚠️ Nenhum relatório encontrado para os filtros selecionados.</p>
                </div>
            )}
        </div>
    );
};

export default AtividadesExportar;
