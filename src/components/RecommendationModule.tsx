import React, { useState, useMemo, useEffect } from 'react';
import { Consultant, Client, UsuarioCliente, ConsultantReport, CoordenadorCliente } from '../components/types';
import HistoricoAtividadesModal from './HistoricoAtividadesModal';
import RecommendationCard from './RecommendationCard';
import { generateIntelligentRecommendations, IntelligentAnalysis } from '../services/recommendationService';

interface RecommendationModuleProps {
    consultants: Consultant[];
    clients: Client[];
    usuariosCliente: UsuarioCliente[];
    coordenadoresCliente: CoordenadorCliente[];
    loadConsultantReports: (consultantId: number) => Promise<ConsultantReport[]>;
    onNavigateToAtividades: (clientName?: string, consultantName?: string) => void;
}

interface ConsultantAnalysis {
    consultant: Consultant;
    analysis: IntelligentAnalysis;
    reports: ConsultantReport[];
    manager?: UsuarioCliente;
    client?: Client;
    loading: boolean;
    error?: string;
}

const RecommendationModule: React.FC<RecommendationModuleProps> = ({
    consultants,
    clients,
    usuariosCliente,
    coordenadoresCliente,
    loadConsultantReports,
    onNavigateToAtividades
}) => {
    const [selectedClient, setSelectedClient] = useState<string>('all');
    const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
    const [selectedConsultantForHistory, setSelectedConsultantForHistory] = useState<Consultant | null>(null);
    const [loadedReports, setLoadedReports] = useState<ConsultantReport[]>([]);
    const [analysisCache, setAnalysisCache] = useState<Map<number, ConsultantAnalysis>>(new Map());
    const [loadingConsultants, setLoadingConsultants] = useState<Set<number>>(new Set());

    // Filtrar consultores que precisam de recomendação
    const filteredList = useMemo(() => {
        let list = consultants.filter(c => {
            if (c.status !== 'Ativo') return false;

            // Verificar se tem relatórios com risco >= 3
            if (c.reports && c.reports.length > 0) {
                return c.reports.some(r => r.riskScore >= 3);
            }

            // Verificar parecer_final_consultor (1-5)
            if (c.parecer_final_consultor && c.parecer_final_consultor >= 3) {
                return true;
            }

            // Verificar qualquer parecer mensal (parecer_1_consultor até parecer_12_consultor)
            for (let i = 1; i <= 12; i++) {
                const parecerField = `parecer_${i}_consultor` as keyof Consultant;
                const parecer = c[parecerField];
                if (typeof parecer === 'number' && parecer >= 3) {
                    return true;
                }
            }

            return false;
        });

        // Filtrar por cliente se selecionado
        if (selectedClient !== 'all') {
            list = list.filter(c => {
                const m = usuariosCliente.find(u => u.id === c.gestor_imediato_id);
                const cl = clients.find(cl => cl.id === m?.id_cliente);
                return cl?.razao_social_cliente === selectedClient;
            });
        }

        // Ordenar por maior risco primeiro (score mais alto = pior)
        return list.sort((a, b) => {
            const scoreA = a.parecer_final_consultor || 0;
            const scoreB = b.parecer_final_consultor || 0;
            return scoreB - scoreA; // Decrescente (5=Crítico primeiro)
        });
    }, [consultants, selectedClient, clients, usuariosCliente]);

    // Gerar análises inteligentes para consultores filtrados
    useEffect(() => {
        const generateAnalyses = async () => {
            for (const consultant of filteredList) {
                // Verificar se já está em cache
                if (analysisCache.has(consultant.id)) {
                    continue;
                }

                // Marcar como carregando
                setLoadingConsultants(prev => new Set(prev).add(consultant.id));

                try {
                    // Buscar relatórios
                    const reports = await loadConsultantReports(consultant.id);
                    const manager = usuariosCliente.find(u => u.id === consultant.gestor_imediato_id);
                    const client = clients.find(c => c.id === manager?.id_cliente);

                    // Gerar análise inteligente
                    const analysis = await generateIntelligentRecommendations(
                        consultant,
                        reports,
                        manager,
                        client
                    );

                    // Armazenar em cache
                    setAnalysisCache(prev => {
                        const newCache = new Map(prev);
                        newCache.set(consultant.id, {
                            consultant,
                            analysis,
                            reports,
                            manager,
                            client,
                            loading: false
                        });
                        return newCache;
                    });
                } catch (error) {
                    console.error(`❌ Erro ao gerar análise para ${consultant.nome_consultores}:`, error);
                    setAnalysisCache(prev => {
                        const newCache = new Map(prev);
                        newCache.set(consultant.id, {
                            consultant,
                            analysis: {
                                resumo: 'Erro ao gerar análise. Por favor, tente novamente.',
                                recomendacoes: []
                            },
                            reports: [],
                            loading: false,
                            error: String(error)
                        });
                        return newCache;
                    });
                } finally {
                    setLoadingConsultants(prev => {
                        const newSet = new Set(prev);
                        newSet.delete(consultant.id);
                        return newSet;
                    });
                }
            }
        };

        generateAnalyses();
    }, [filteredList, loadConsultantReports, usuariosCliente, clients]);

    // Handler para abrir modal de histórico
    const handleOpenHistory = async (consultant: Consultant) => {
        setSelectedConsultantForHistory(consultant);
        const reports = await loadConsultantReports(consultant.id);
        setLoadedReports(reports);
        setShowHistoryModal(true);
    };

    return (
        <>
            <div className="p-6 space-y-6">
                {/* Header */}
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-3xl font-bold text-[#4D5253]">Recomendações</h2>
                        <p className="text-sm text-gray-600 mt-1">
                            {filteredList.length} consultor(es) com recomendações pendentes
                        </p>
                    </div>
                    <select
                        value={selectedClient}
                        onChange={e => setSelectedClient(e.target.value)}
                        className="p-2 border border-gray-300 rounded-lg hover:border-gray-400 transition"
                    >
                        <option value="all">Todos Clientes</option>
                        {clients.map(c => (
                            <option key={c.id} value={c.razao_social_cliente}>
                                {c.razao_social_cliente}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Empty State */}
                {filteredList.length === 0 && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
                        <div className="text-6xl mb-4">🎉</div>
                        <h3 className="text-xl font-bold text-green-800 mb-2">Nenhuma Recomendação Necessária!</h3>
                        <p className="text-green-600">Todos os consultores estão com desempenho satisfatório (score 1-2: Excelente/Bom).</p>
                    </div>
                )}

                {/* Recomendações */}
                <div className="grid gap-6">
                    {filteredList.map(consultant => {
                        const cachedAnalysis = analysisCache.get(consultant.id);
                        const isLoading = loadingConsultants.has(consultant.id);

                        // Mostrar skeleton enquanto carrega
                        if (isLoading || !cachedAnalysis) {
                            return (
                                <div
                                    key={consultant.id}
                                    className="bg-white rounded-lg shadow-lg border-l-4 border-gray-300 p-6 animate-pulse"
                                >
                                    <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
                                    <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
                                    <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                                </div>
                            );
                        }

                        // Mostrar erro se houver
                        if (cachedAnalysis.error) {
                            return (
                                <div
                                    key={consultant.id}
                                    className="bg-red-50 border border-red-200 rounded-lg p-6"
                                >
                                    <h3 className="font-bold text-red-900 mb-2">{consultant.nome_consultores}</h3>
                                    <p className="text-red-700 text-sm">{cachedAnalysis.error}</p>
                                </div>
                            );
                        }

                        // Renderizar card com análise
                        return (
                            <RecommendationCard
                                key={consultant.id}
                                consultant={consultant}
                                analysis={cachedAnalysis.analysis}
                                clientName={cachedAnalysis.client?.razao_social_cliente}
                                managerName={cachedAnalysis.manager?.nome_gestor_cliente}
                                onNavigateToAtividades={onNavigateToAtividades}
                                onOpenHistory={() => handleOpenHistory(consultant)}
                            />
                        );
                    })}
                </div>
            </div>

            {/* Modal de Histórico de Atividades */}
            {showHistoryModal && selectedConsultantForHistory && (
                <HistoricoAtividadesModal
                    consultant={selectedConsultantForHistory}
                    reports={loadedReports}
                    onClose={() => {
                        setShowHistoryModal(false);
                        setSelectedConsultantForHistory(null);
                        setLoadedReports([]);
                    }}
                />
            )}
        </>
    );
};

export default RecommendationModule;
