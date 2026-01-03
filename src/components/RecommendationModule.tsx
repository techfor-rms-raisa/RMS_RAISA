import React, { useState, useMemo, useEffect } from 'react';
import { Consultant, Client, UsuarioCliente, ConsultantReport, CoordenadorCliente, User } from '@/types';
import HistoricoAtividadesModal from './HistoricoAtividadesModal';
import RecommendationCard from './RecommendationCard';
import RecommendationsModal from './RecommendationsModal';
import { loadRecommendationsFromSupabase, IntelligentAnalysis } from '../services/supabaseRecommendationService';

interface RecommendationModuleProps {
    consultants: Consultant[];
    clients: Client[];
    usuariosCliente: UsuarioCliente[];
    coordenadoresCliente: CoordenadorCliente[];
    users?: User[]; // ✅ NOVO: Lista de usuários para filtro de Gestão de Pessoas
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

// ✅ CORRIGIDO: Navegação 1 a 1 (1 consultor por página)
const ITEMS_PER_PAGE = 1;

const RecommendationModule: React.FC<RecommendationModuleProps> = ({
    consultants,
    clients,
    usuariosCliente,
    coordenadoresCliente,
    users = [],
    loadConsultantReports,
    onNavigateToAtividades
}) => {
    // ✅ NOVO: Estados para filtros (como Quarentena)
    const [selectedClient, setSelectedClient] = useState<string>('all');
    const [selectedScore, setSelectedScore] = useState<string>('all');
    const [selectedManager, setSelectedManager] = useState<string>('all');
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear()); // ✅ v2.4: Filtro de ano
    
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
    const [selectedConsultantForHistory, setSelectedConsultantForHistory] = useState<Consultant | null>(null);
    const [loadedReports, setLoadedReports] = useState<ConsultantReport[]>([]);
    const [analysisCache, setAnalysisCache] = useState<Map<number, ConsultantAnalysis>>(new Map());
    const [loadingConsultants, setLoadingConsultants] = useState<Set<number>>(new Set());
    
    const [showRecommendationsModal, setShowRecommendationsModal] = useState<boolean>(false);
    const [selectedConsultantForRecommendations, setSelectedConsultantForRecommendations] = useState<Consultant | null>(null);
    const [selectedRecommendations, setSelectedRecommendations] = useState<any>(null);

    // ✅ v2.4: Anos disponíveis
    const availableYears = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const uniqueYears = new Set<number>();
        consultants.forEach(c => {
            if (c.ano_vigencia) uniqueYears.add(c.ano_vigencia);
        });
        if (uniqueYears.size === 0) uniqueYears.add(currentYear);
        return [...uniqueYears].sort((a, b) => b - a);
    }, [consultants]);

    // ✅ v2.4: Inicializar com o ano mais recente DISPONÍVEL nos dados
    useEffect(() => {
        if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
            setSelectedYear(availableYears[0]); // Primeiro da lista = mais recente
        }
    }, [availableYears, selectedYear]);

    // ✅ NOVO: Funções auxiliares (copiadas do Quarentena)
    const getDaysSinceHiring = (hireDate: string | null | undefined): number | null => {
        if (!hireDate) return null;
        try {
            const hire = new Date(hireDate);
            const today = new Date();
            const diffTime = Math.abs(today.getTime() - hire.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays;
        } catch {
            return null;
        }
    };

    const isNewConsultant = (consultant: Consultant): boolean => {
        const daysSinceHiring = getDaysSinceHiring(consultant.data_inclusao_consultores);
        return daysSinceHiring !== null && daysSinceHiring < 45;
    };

    const getValidFinalScore = (consultant: Consultant): number | null => {
        const score = consultant.parecer_final_consultor;
        if (score === null || score === undefined || String(score) === '#FFFF') {
            return null;
        }
        const numScore = typeof score === 'string' ? parseInt(score, 10) : score;
        if (isNaN(numScore) || numScore < 1 || numScore > 5) {
            return null;
        }
        return numScore;
    };

    // Filtrar consultores que precisam de recomendação
    // ✅ CORRIGIDO: Só mostra consultores com score válido (não mostra sem relatórios)
    const filteredList = useMemo(() => {
        let list = consultants.filter(c => {
            if (c.status !== 'Ativo') return false;
            
            // ✅ v2.4: Filtrar por ano_vigencia (tratando NULL como ano atual)
            if (c.ano_vigencia !== null && c.ano_vigencia !== undefined && c.ano_vigencia !== selectedYear) return false;

            // Verificar parecer_final_consultor (1-5)
            const finalScore = getValidFinalScore(c);
            
            // ✅ CORREÇÃO: Só mostrar consultores com score válido
            // Scores 3, 4, 5 = Precisam de acompanhamento/ação
            // Scores 1, 2 = Bom desempenho (opcional mostrar)
            if (finalScore === null) {
                // Sem score válido = Não mostra (precisa importar relatórios primeiro)
                return false;
            }
            
            // Mostrar consultores com score de risco (3, 4 ou 5)
            // OU consultores novos com qualquer score (para acompanhamento de integração)
            const isNew = isNewConsultant(c);
            const hasRiskScore = [5, 4, 3].includes(finalScore);
            
            return hasRiskScore || isNew;
        });

        // ✅ NOVO: Filtro por Cliente
        if (selectedClient !== 'all') {
            list = list.filter(c => {
                const m = usuariosCliente.find(u => u.id === c.gestor_imediato_id);
                const cl = clients.find(cl => cl.id === m?.id_cliente);
                return cl?.razao_social_cliente === selectedClient;
            });
        }

        // ✅ NOVO: Filtro por Score
        if (selectedScore !== 'all') {
            if (selectedScore === 'new') {
                list = list.filter(c => isNewConsultant(c));
            } else {
                const scoreNum = parseInt(selectedScore, 10);
                list = list.filter(c => getValidFinalScore(c) === scoreNum);
            }
        }

        // ✅ v2.5 CORRIGIDO: Filtro por Gestão de Pessoas (id_gestao_de_pessoas do CONSULTOR)
        if (selectedManager !== 'all') {
            const selectedManagerId = parseInt(selectedManager, 10);
            list = list.filter(c => c.id_gestao_de_pessoas === selectedManagerId);
        }

        // Ordenar por maior risco primeiro (score mais alto = pior)
        return list.sort((a, b) => {
            const scoreA = getValidFinalScore(a) || 0;
            const scoreB = getValidFinalScore(b) || 0;
            return scoreB - scoreA; // Decrescente (5=Crítico primeiro)
        });
    }, [consultants, selectedClient, selectedScore, selectedManager, selectedYear, clients, usuariosCliente, users]);

    // ============================================================================
    // ✅ v2.5: CÁLCULO DE ESTATÍSTICAS PARA CARDS TOTALIZADORES
    // ============================================================================
    const statistics = useMemo(() => {
        const stats = { total: 0, medium: 0, high: 0, critical: 0, newConsultants: 0 };
        
        stats.total = filteredList.length;

        filteredList.forEach(consultant => {
            const score = getValidFinalScore(consultant);
            if (score !== null) {
                switch (score) {
                    case 3: stats.medium++; break;
                    case 4: stats.high++; break;
                    case 5: stats.critical++; break;
                }
            }
            // Contar novos consultores (< 45 dias)
            if (isNewConsultant(consultant)) {
                stats.newConsultants++;
            }
        });

        return stats;
    }, [filteredList]);

    // ✅ CORRIGIDO: Calcular consultor da página atual (1 a 1)
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
    }, [selectedClient, selectedScore, selectedManager]);

    // ✅ NOVO: Rolar tela para início ao navegar
    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [currentPage]);

    // Carregar análises apenas para consultores da página atual
    useEffect(() => {
        const generateAnalyses = async () => {
            for (const consultant of paginatedList) {
                if (analysisCache.has(consultant.id)) {
                    continue;
                }

                setLoadingConsultants(prev => new Set(prev).add(consultant.id));

                try {
                    const reports = await loadConsultantReports(consultant.id);
                    const manager = usuariosCliente.find(u => u.id === consultant.gestor_imediato_id);
                    const client = clients.find(c => c.id === manager?.id_cliente);
                    const analysis = loadRecommendationsFromSupabase(consultant, reports);

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
                    console.error(`Erro ao gerar análise para ${consultant.nome_consultores}:`, error);
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

    const handleOpenHistory = async (consultant: Consultant) => {
        setSelectedConsultantForHistory(consultant);
        const reports = await loadConsultantReports(consultant.id);
        setLoadedReports(reports);
        setShowHistoryModal(true);
    };

    const handleOpenRecommendations = (consultant: Consultant, analysis: IntelligentAnalysis) => {
        setSelectedConsultantForRecommendations(consultant);
        setSelectedRecommendations(analysis);
        setShowRecommendationsModal(true);
    };

    const handleCloseRecommendations = () => {
        setShowRecommendationsModal(false);
        setSelectedConsultantForRecommendations(null);
        setSelectedRecommendations(null);
    };

    return (
        <>
            <div className="p-6 space-y-6">
                {/* ✅ NOVO: Header com Filtros (como Quarentena) */}
                <div className="space-y-4">
                    <div>
                        <h2 className="text-3xl font-bold text-[#4D5253]">Recomendações</h2>
                        <p className="text-sm text-gray-600 mt-1">
                            {filteredList.length} consultor(es) com recomendações pendentes
                        </p>
                    </div>

                    {/* Filtros */}
                    <div className="flex flex-wrap gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
                        {/* Filtro por Cliente */}
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-semibold text-gray-700">Filtrar por Cliente:</label>
                            <select
                                value={selectedClient}
                                onChange={e => setSelectedClient(e.target.value)}
                                className="px-3 py-2 border border-gray-300 rounded-lg hover:border-gray-400 transition"
                            >
                                <option value="all">Todos os Clientes</option>
                                {[...new Set(clients.map(c => c.razao_social_cliente))].sort().map(n => (
                                    <option key={n} value={n}>{n}</option>
                                ))}
                            </select>
                        </div>

                        {/* Filtro por Score */}
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-semibold text-gray-700">Filtrar por Score:</label>
                            <select
                                value={selectedScore}
                                onChange={e => setSelectedScore(e.target.value)}
                                className="px-3 py-2 border border-gray-300 rounded-lg hover:border-gray-400 transition"
                            >
                                <option value="all">Todos os Scores</option>
                                <option value="5">Score 5 - CRÍTICO</option>
                                <option value="4">Score 4 - ALTO</option>
                                <option value="3">Score 3 - MODERADO</option>
                                <option value="new">Novo Consultor (&lt; 45 dias)</option>
                            </select>
                        </div>

                        {/* Filtro por Gestão de Pessoas */}
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-semibold text-gray-700">Gestão de Pessoas:</label>
                            <select
                                value={selectedManager}
                                onChange={e => setSelectedManager(e.target.value)}
                                className="px-3 py-2 border border-gray-300 rounded-lg hover:border-gray-400 transition"
                            >
                                <option value="all">Todos</option>
                                {users
                                    .filter(u => u.tipo_usuario === 'Gestão de Pessoas' && u.ativo_usuario)
                                    .sort((a, b) => a.nome_usuario.localeCompare(b.nome_usuario))
                                    .map(u => (
                                        <option key={u.id} value={String(u.id)}>{u.nome_usuario}</option>
                                    ))
                                }
                            </select>
                        </div>

                        {/* ✅ v2.4: Filtro por Ano */}
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-semibold text-gray-700">Ano:</label>
                            <select
                                value={selectedYear}
                                onChange={e => setSelectedYear(parseInt(e.target.value))}
                                className="px-3 py-2 border border-gray-300 rounded-lg hover:border-gray-400 transition"
                            >
                                {availableYears.map(year => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* ✅ v2.5: PAINEL DE ESTATÍSTICAS */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                    <div className="bg-gray-100 p-4 rounded-lg text-center shadow">
                        <p className="text-2xl font-bold text-gray-800">{statistics.total}</p>
                        <p className="text-sm text-gray-600">Pendentes</p>
                    </div>
                    <div className="bg-yellow-100 p-4 rounded-lg text-center shadow">
                        <p className="text-2xl font-bold text-yellow-700">{statistics.medium}</p>
                        <p className="text-sm text-yellow-700">Médio (3)</p>
                    </div>
                    <div className="bg-orange-100 p-4 rounded-lg text-center shadow">
                        <p className="text-2xl font-bold text-orange-700">{statistics.high}</p>
                        <p className="text-sm text-orange-700">Alto (4)</p>
                    </div>
                    <div className="bg-red-100 p-4 rounded-lg text-center shadow">
                        <p className="text-2xl font-bold text-red-700">{statistics.critical}</p>
                        <p className="text-sm text-red-700">Crítico (5)</p>
                    </div>
                    <div className="bg-purple-100 p-4 rounded-lg text-center shadow">
                        <p className="text-2xl font-bold text-purple-700">{statistics.newConsultants}</p>
                        <p className="text-sm text-purple-700">Novos (&lt;45d)</p>
                    </div>
                </div>

                {/* Empty State */}
                {filteredList.length === 0 && (
                    <div className={`border rounded-lg p-8 text-center ${
                        consultants.filter(c => c.status === 'Ativo').length === 0 
                            ? 'bg-yellow-50 border-yellow-200' 
                            : consultants.filter(c => c.status === 'Ativo' && getValidFinalScore(c) !== null).length === 0
                                ? 'bg-blue-50 border-blue-200'
                                : 'bg-green-50 border-green-200'
                    }`}>
                        {consultants.filter(c => c.status === 'Ativo').length === 0 ? (
                            // Nenhum consultor ativo
                            <>
                                <div className="text-6xl mb-4">📋</div>
                                <h3 className="text-xl font-bold text-yellow-800 mb-2">Nenhum Consultor Cadastrado</h3>
                                <p className="text-yellow-600">Importe consultores para visualizar recomendações.</p>
                            </>
                        ) : consultants.filter(c => c.status === 'Ativo' && getValidFinalScore(c) !== null).length === 0 ? (
                            // Consultores existem mas sem score válido
                            <>
                                <div className="text-6xl mb-4">📊</div>
                                <h3 className="text-xl font-bold text-blue-800 mb-2">Aguardando Dados de Avaliação</h3>
                                <p className="text-blue-600">
                                    Os consultores ainda não possuem relatórios de atividades importados.<br/>
                                    Importe os relatórios para gerar análises e recomendações.
                                </p>
                            </>
                        ) : (
                            // Consultores com score mas nenhum precisa de atenção
                            <>
                                <div className="text-6xl mb-4">🎉</div>
                                <h3 className="text-xl font-bold text-green-800 mb-2">Nenhuma Recomendação Necessária!</h3>
                                <p className="text-green-600">Todos os consultores estão com desempenho satisfatório.</p>
                            </>
                        )}
                    </div>
                )}

                {/* Recomendação Atual (1 a 1) */}
                <div className="grid gap-6">
                    {paginatedList.map(consultant => {
                        const cachedAnalysis = analysisCache.get(consultant.id);
                        const isLoading = loadingConsultants.has(consultant.id);

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

                        return (
                            <RecommendationCard
                                key={consultant.id}
                                consultant={consultant}
                                analysis={cachedAnalysis.analysis}
                                clientName={cachedAnalysis.client?.razao_social_cliente}
                                managerName={cachedAnalysis.manager?.nome_gestor_cliente}
                                onNavigateToAtividades={onNavigateToAtividades}
                                onOpenHistory={() => handleOpenHistory(consultant)}
                                onOpenRecommendations={() => handleOpenRecommendations(consultant, cachedAnalysis.analysis)}
                            />
                        );
                    })}
                </div>

                {/* ✅ CORRIGIDO: Paginação 1 a 1 */}
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
                            title="Ir para primeiro consultor"
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
                            title="Consultor anterior"
                        >
                            <i className="fa-solid fa-chevron-left mr-2"></i>
                            Voltar
                        </button>

                        {/* Indicador de Página */}
                        <div className="px-6 py-2 bg-gray-100 rounded-lg text-center min-w-[150px]">
                            <p className="text-sm font-semibold text-gray-700">
                                Consultor <span className="text-blue-600">{currentPage}</span> de <span className="text-blue-600">{totalPages}</span>
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
                            title="Próximo consultor"
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
                            title="Ir para último consultor"
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

            {/* Modal de Recomendações */}
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
