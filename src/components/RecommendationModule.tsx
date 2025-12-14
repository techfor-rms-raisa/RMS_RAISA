import React, { useState, useMemo, useEffect } from 'react';
import { Consultant, Client, UsuarioCliente, ConsultantReport, CoordenadorCliente } from '../components/types';
import HistoricoAtividadesModal from './HistoricoAtividadesModal';
import RecommendationCard from './RecommendationCard';
import RecommendationsModal from './RecommendationsModal';
// ✅ CORRIGIDO: Usar recomendações do Supabase em vez de chamar Gemini
import { loadRecommendationsFromSupabase, IntelligentAnalysis } from '../services/supabaseRecommendationService';

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

const ITEMS_PER_PAGE = 10; // ✅ NOVO: Paginação com 10 consultores por página

const RecommendationModule: React.FC<RecommendationModuleProps> = ({
    consultants,
    clients,
    usuariosCliente,
    coordenadoresCliente,
    loadConsultantReports,
    onNavigateToAtividades
}) => {
    const [selectedClient, setSelectedClient] = useState<string>('all');
    const [currentPage, setCurrentPage] = useState<number>(1); // ✅ NOVO: Página atual
    const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
    const [selectedConsultantForHistory, setSelectedConsultantForHistory] = useState<Consultant | null>(null);
    const [loadedReports, setLoadedReports] = useState<ConsultantReport[]>([]);
    const [analysisCache, setAnalysisCache] = useState<Map<number, ConsultantAnalysis>>(new Map());
    const [loadingConsultants, setLoadingConsultants] = useState<Set<number>>(new Set());
    
    // ============================================
    // ✅ NOVO: ESTADO PARA MODAL DE RECOMENDAÇÕES
    // ============================================
    const [showRecommendationsModal, setShowRecommendationsModal] = useState<boolean>(false);
    const [selectedConsultantForRecommendations, setSelectedConsultantForRecommendations] = useState<Consultant | null>(null);
    const [selectedRecommendations, setSelectedRecommendations] = useState<any>(null);

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

    // ✅ NOVO: Calcular consultores da página atual
    const paginatedList = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        return filteredList.slice(startIndex, endIndex);
    }, [filteredList, currentPage]);

    // ✅ NOVO: Calcular total de páginas
    const totalPages = Math.ceil(filteredList.length / ITEMS_PER_PAGE);

    // ✅ NOVO: Resetar página quando filtro mudar
    useEffect(() => {
        setCurrentPage(1);
    }, [selectedClient]);

    // ✅ CORRIGIDO: Carregar análises apenas para consultores da página atual
    useEffect(() => {
        const generateAnalyses = async () => {
            for (const consultant of paginatedList) {
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

                    // ✅ CORRIGIDO: Carregar recomendações do Supabase (não chamar Gemini)
                    const analysis = loadRecommendationsFromSupabase(consultant, reports);

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
    }, [paginatedList, loadConsultantReports, usuariosCliente, clients, analysisCache]);

    // Handler para abrir modal de histórico
    const handleOpenHistory = async (consultant: Consultant) => {
        setSelectedConsultantForHistory(consultant);
        const reports = await loadConsultantReports(consultant.id);
        setLoadedReports(reports);
        setShowHistoryModal(true);
    };

    // ============================================
    // ✅ NOVO: HANDLER PARA ABRIR MODAL DE RECOMENDAÇÕES
    // ============================================
    const handleOpenRecommendations = (consultant: Consultant, analysis: IntelligentAnalysis) => {
        setSelectedConsultantForRecommendations(consultant);
        setSelectedRecommendations(analysis);
        setShowRecommendationsModal(true);
    };

    // ============================================
    // ✅ NOVO: HANDLER PARA FECHAR MODAL DE RECOMENDAÇÕES
    // ============================================
    const handleCloseRecommendations = () => {
        setShowRecommendationsModal(false);
        setSelectedConsultantForRecommendations(null);
        setSelectedRecommendations(null);
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
                    {paginatedList.map(consultant => {
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
                                // ============================================
                                // ✅ NOVO: PROP PARA ABRIR MODAL DE RECOMENDAÇÕES
                                // ============================================
                                onOpenRecommendations={() => handleOpenRecommendations(consultant, cachedAnalysis.analysis)}
                            />
                        );
                    })}
                </div>

                {/* ✅ NOVO: PAGINAÇÃO */}
                {filteredList.length > ITEMS_PER_PAGE && (
                    <div className="flex items-center justify-center gap-4 mt-8 pt-6 border-t border-gray-200">
                        {/* Botão Início */}
                        <button
                            onClick={() => setCurrentPage(1)}
                            disabled={currentPage === 1}
                            className={`px-4 py-2 rounded-lg font-medium transition-all ${
                                currentPage === 1
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : 'bg-blue-500 text-white hover:bg-blue-600 active:scale-95'
                            }`}
                            title="Ir para primeira página"
                        >
                            <i className="fa-solid fa-step-backward mr-2"></i>
                            Início
                        </button>

                        {/* Botão Voltar */}
                        <button
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className={`px-4 py-2 rounded-lg font-medium transition-all ${
                                currentPage === 1
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : 'bg-blue-500 text-white hover:bg-blue-600 active:scale-95'
                            }`}
                            title="Página anterior"
                        >
                            <i className="fa-solid fa-chevron-left mr-2"></i>
                            Voltar
                        </button>

                        {/* Indicador de Página */}
                        <div className="px-6 py-2 bg-gray-100 rounded-lg text-center min-w-[120px]">
                            <p className="text-sm font-semibold text-gray-700">
                                Página <span className="text-blue-600">{currentPage}</span> de <span className="text-blue-600">{totalPages}</span>
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                                {paginatedList.length} de {filteredList.length} consultores
                            </p>
                        </div>

                        {/* Botão Avançar */}
                        <button
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                            className={`px-4 py-2 rounded-lg font-medium transition-all ${
                                currentPage === totalPages
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : 'bg-blue-500 text-white hover:bg-blue-600 active:scale-95'
                            }`}
                            title="Próxima página"
                        >
                            Avançar
                            <i className="fa-solid fa-chevron-right ml-2"></i>
                        </button>

                        {/* Botão Fim */}
                        <button
                            onClick={() => setCurrentPage(totalPages)}
                            disabled={currentPage === totalPages}
                            className={`px-4 py-2 rounded-lg font-medium transition-all ${
                                currentPage === totalPages
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : 'bg-blue-500 text-white hover:bg-blue-600 active:scale-95'
                            }`}
                            title="Ir para última página"
                        >
                            Fim
                            <i className="fa-solid fa-step-forward ml-2"></i>
                        </button>
                    </div>
                )}
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

            {/* ============================================ */}
            {/* ✅ NOVO: MODAL DE RECOMENDAÇÕES */}
            {/* ============================================ */}
            {showRecommendationsModal && selectedConsultantForRecommendations && selectedRecommendations && (
                <RecommendationsModal
                    consultant={selectedConsultantForRecommendations}
                    analysis={selectedRecommendations}
                    onClose={handleCloseRecommendations}
                />
            )}
        </>
    );
};

export default RecommendationModule;
