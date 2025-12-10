import React, { useMemo, useState } from 'react';
import { Consultant, Client, UsuarioCliente } from '../components/types';

interface RecommendationModuleProps {
    consultants: Consultant[];
    clients: Client[];
    usuariosCliente: UsuarioCliente[];
    onNavigateToAtividades: (clientName?: string, consultantName?: string) => void;
}

const RecommendationModule: React.FC<RecommendationModuleProps> = ({ consultants, clients, usuariosCliente, onNavigateToAtividades }) => {
    const [selectedClient, setSelectedClient] = useState<string>('all');

    const filteredList = useMemo(() => {
        // Filtrar consultores ativos com risco MÉDIO, ALTO ou CRÍTICO (score >= 3)
        // NOVA ESCALA: 1=Excelente, 2=Bom, 3=Médio, 4=Alto, 5=Crítico
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

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-bold text-[#4D5253]">Recomendações</h2>
                <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)} className="p-2 border rounded">
                    <option value="all">Todos Clientes</option>
                    {clients.map(c => <option key={c.id} value={c.razao_social_cliente}>{c.razao_social_cliente}</option>)}
                </select>
            </div>
            {filteredList.length === 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
                    <div className="text-6xl mb-4">🎉</div>
                    <h3 className="text-xl font-bold text-green-800 mb-2">Nenhuma Recomendação Necessária!</h3>
                    <p className="text-green-600">Todos os consultores estão com desempenho satisfatório (score 1-2: Excelente/Bom).</p>
                </div>
            )}
            
            <div className="grid gap-6">
                {filteredList.map(c => {
                    const riskScore = c.parecer_final_consultor || 0;
                    const latestReport = c.reports && c.reports.length > 0 ? c.reports[0] : null;
                    
                    // Definir cor da borda baseado no risco
                    // NOVA ESCALA: 1=Excelente (Verde), 2=Bom (Azul), 3=Médio (Amarelo), 4=Alto (Laranja), 5=Crítico (Vermelho)
                    let borderColor = 'border-gray-300';
                    let bgColor = 'bg-gray-50';
                    let riskLabel = 'Sem Classificação';
                    let riskIcon = '❓';
                    
                    if (riskScore === 1) {
                        borderColor = 'border-green-500';
                        bgColor = 'bg-green-50';
                        riskLabel = 'EXCELENTE';
                        riskIcon = '🟢'; // Verde #34A853
                    } else if (riskScore === 2) {
                        borderColor = 'border-blue-500';
                        bgColor = 'bg-blue-50';
                        riskLabel = 'BOM';
                        riskIcon = '🔵'; // Azul #4285F4
                    } else if (riskScore === 3) {
                        borderColor = 'border-yellow-500';
                        bgColor = 'bg-yellow-50';
                        riskLabel = 'MÉDIO';
                        riskIcon = '🟡'; // Amarelo #FBBC05
                    } else if (riskScore === 4) {
                        borderColor = 'border-orange-600';
                        bgColor = 'bg-orange-50';
                        riskLabel = 'ALTO';
                        riskIcon = '🟠'; // Laranja #FF6D00
                    } else if (riskScore === 5) {
                        borderColor = 'border-red-700';
                        bgColor = 'bg-red-50';
                        riskLabel = 'CRÍTICO';
                        riskIcon = '🔴'; // Vermelho #EA4335
                    }
                    
                    // Gerar recomendações baseadas no score
                    const recommendations = latestReport?.recommendations || generateRecommendationsByScore(riskScore);
                    
                    return (
                        <div key={c.id} className={`bg-white p-6 rounded-lg shadow-md border-l-4 ${borderColor}`}>
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex-1">
                                    <div className="flex items-center justify-between gap-3 mb-1">
                                      <h3 className="font-bold text-xl text-gray-800">{c.nome_consultores}</h3>
                                      <button
                                        onClick={() => onNavigateToAtividades(clientInfo?.razao_social_cliente, c.nome_consultores)}
                                        className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition whitespace-nowrap"
                                        title="Registrar nova atividade para este consultor"
                                      >
                                        + Nova Atividade
                                      </button>
                                    </div>
                                    <p className="text-sm text-gray-600">{c.cargo_consultores}</p>
                                </div>
                                <div className={`px-4 py-2 rounded-lg ${bgColor} border ${borderColor}`}>
                                    <div className="text-2xl mb-1">{riskIcon}</div>
                                    <div className="text-xs font-bold text-gray-700">{riskLabel}</div>
                                    <div className="text-lg font-bold text-gray-900">Score {riskScore}</div>
                                </div>
                            </div>
                            
                            {latestReport && (
                                <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded">
                                    <h4 className="font-bold text-sm text-blue-900 mb-2">📊 Resumo da Análise:</h4>
                                    <p className="text-sm text-blue-800">{latestReport.summary}</p>
                                    {latestReport.predictiveAlert && (
                                        <p className="text-sm text-red-600 font-bold mt-2">⚠️ {latestReport.predictiveAlert}</p>
                                    )}
                                </div>
                            )}
                            
                            <div className="mt-4">
                                <h4 className="font-bold text-sm text-gray-700 mb-3">💡 Recomendações de Ação:</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {recommendations.map((r, i) => (
                                        <div key={i} className="border border-gray-200 p-3 rounded-lg bg-white hover:shadow-md transition-shadow">
                                            <span className="text-xs font-bold uppercase text-blue-600">{r.tipo}</span>
                                            <p className="text-sm mt-1 text-gray-700">{r.descricao}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// Função auxiliar para gerar recomendações baseadas no score
const generateRecommendationsByScore = (score: number) => {
    // NOVA ESCALA: 1=Excelente, 2=Bom, 3=Médio, 4=Alto, 5=Crítico
    
    if (score === 5) {
        // CRÍTICO - Situação grave
        return [
            { tipo: 'URGENTE', descricao: 'Reunião imediata com gestor e RH' },
            { tipo: 'PLANO DE AÇÃO', descricao: 'Criar plano de recuperação em 48h' },
            { tipo: 'MONITORAMENTO', descricao: 'Acompanhamento semanal obrigatório' },
            { tipo: 'SUPORTE', descricao: 'Alocar mentor/coach especializado' }
        ];
    } else if (score === 4) {
        // ALTO - Problemas significativos
        return [
            { tipo: 'ATENÇÃO', descricao: 'Agendar reunião com gestor em 1 semana' },
            { tipo: 'FEEDBACK', descricao: 'Sessão de feedback estruturado' },
            { tipo: 'TREINAMENTO', descricao: 'Identificar necessidades de capacitação' },
            { tipo: 'ACOMPANHAMENTO', descricao: 'Monitoramento quinzenal' }
        ];
    } else if (score === 3) {
        // MÉDIO - Pontos de atenção
        return [
            { tipo: 'OBSERVAÇÃO', descricao: 'Conversa informal com gestor' },
            { tipo: 'DESENVOLVIMENTO', descricao: 'Oferecer oportunidades de melhoria' },
            { tipo: 'SUPORTE', descricao: 'Disponibilizar recursos adicionais' },
            { tipo: 'PREVENTIVO', descricao: 'Monitoramento mensal' }
        ];
    } else if (score === 2) {
        // BOM - Performance satisfatória
        return [
            { tipo: 'RECONHECIMENTO', descricao: 'Reconhecer bom desempenho' },
            { tipo: 'CRESCIMENTO', descricao: 'Explorar oportunidades de desenvolvimento' },
            { tipo: 'MANUTENÇÃO', descricao: 'Manter nível de suporte atual' }
        ];
    } else if (score === 1) {
        // EXCELENTE - Performance excepcional
        return [
            { tipo: 'DESTAQUE', descricao: 'Reconhecimento público do desempenho' },
            { tipo: 'LIDERANÇA', descricao: 'Considerar para posições de liderança' },
            { tipo: 'MENTORIA', descricao: 'Convidar para mentorar outros consultores' },
            { tipo: 'RETENÇÃO', descricao: 'Plano de carreira e retenção de talento' }
        ];
    }
    
    return [{ tipo: 'AVALIAR', descricao: 'Realizar avaliação de desempenho' }];
};

export default RecommendationModule;
