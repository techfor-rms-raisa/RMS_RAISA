/**
 * COMPONENTE: DASHBOARD DE STATUS DE FUNCIONALIDADES DE IA
 * Exibe status de cada funcionalidade e quando pode ser ativada
 */

import React, { useState, useEffect } from 'react';
import { Settings, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { getAIFeaturesStatus } from '../config/aiConfig';

export function AIFeaturesStatusDashboard() {
    const [status, setStatus] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        carregarStatus();
    }, []);

    async function carregarStatus() {
        try {
            setLoading(true);
            const data = await getAIFeaturesStatus();
            setStatus(data);
        } catch (error) {
            console.error('Erro ao carregar status:', error);
        } finally {
            setLoading(false);
        }
    }

    function getStatusIcon(statusValue: string) {
        switch (statusValue) {
            case 'active':
                return <CheckCircle className="w-5 h-5 text-green-600" />;
            case 'waiting':
                return <Clock className="w-5 h-5 text-yellow-600" />;
            case 'inactive':
                return <XCircle className="w-5 h-5 text-gray-400" />;
            default:
                return <AlertTriangle className="w-5 h-5 text-red-600" />;
        }
    }

    function getStatusBadge(statusValue: string) {
        switch (statusValue) {
            case 'active':
                return <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">ATIVO</span>;
            case 'waiting':
                return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-semibold">AGUARDANDO DADOS</span>;
            case 'inactive':
                return <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-xs font-semibold">INATIVO</span>;
            default:
                return <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-semibold">ERRO</span>;
        }
    }

    function getProgressPercentage(current: number, required: number): number {
        if (required === 0) return 100;
        return Math.min((current / required) * 100, 100);
    }

    function estimarDiasParaAtivar(current: number, required: number): number {
        if (current >= required) return 0;
        const faltam = required - current;
        // Estimativa: 1 candidatura/reprovação por dia (ajuste conforme necessário)
        return Math.ceil(faltam);
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (!status) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800">Erro ao carregar status das funcionalidades</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-blue-100 rounded-lg">
                        <Settings className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900">
                            Status das Funcionalidades de IA
                        </h2>
                        <p className="text-sm text-gray-600">
                            Controle e monitore as funcionalidades de IA ativas no sistema
                        </p>
                    </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-800">
                        <strong>💡 Dica:</strong> Funcionalidades que dependem de histórico são ativadas automaticamente 
                        quando há dados suficientes. Configure as flags em <code>.env</code> para controlar manualmente.
                    </p>
                </div>
            </div>

            {/* Lista de Funcionalidades */}
            <div className="grid grid-cols-1 gap-4">
                {Object.entries(status).map(([key, feature]: [string, any]) => (
                    <div key={key} className="bg-white rounded-lg shadow-sm p-6 border-l-4" style={{
                        borderLeftColor: feature.status === 'active' ? '#10b981' : 
                                        feature.status === 'waiting' ? '#f59e0b' : '#9ca3af'
                    }}>
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                                {getStatusIcon(feature.status)}
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900">
                                        {feature.name}
                                    </h3>
                                    <p className="text-sm text-gray-600 mt-1">
                                        {feature.message}
                                    </p>
                                </div>
                            </div>
                            {getStatusBadge(feature.status)}
                        </div>

                        {/* Progresso (se aplicável) */}
                        {feature.requiredCount > 0 && (
                            <div className="mt-4">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm text-gray-700">
                                        Dados acumulados: <strong>{feature.currentCount}/{feature.requiredCount}</strong>
                                    </span>
                                    <span className="text-sm font-semibold" style={{
                                        color: feature.hasEnoughData ? '#10b981' : '#f59e0b'
                                    }}>
                                        {getProgressPercentage(feature.currentCount, feature.requiredCount).toFixed(0)}%
                                    </span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div
                                        className="h-2 rounded-full transition-all"
                                        style={{
                                            width: `${getProgressPercentage(feature.currentCount, feature.requiredCount)}%`,
                                            backgroundColor: feature.hasEnoughData ? '#10b981' : '#f59e0b'
                                        }}
                                    />
                                </div>

                                {!feature.hasEnoughData && (
                                    <p className="text-xs text-gray-600 mt-2">
                                        📅 Estimativa para ativar: ~{estimarDiasParaAtivar(feature.currentCount, feature.requiredCount)} dias
                                    </p>
                                )}

                                {feature.hasEnoughData && !feature.enabled && (
                                    <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3">
                                        <p className="text-sm text-green-800">
                                            <strong>✅ PRONTO PARA ATIVAR!</strong> Você já tem dados suficientes. 
                                            Configure <code>ENABLE_{key.toUpperCase()}=true</code> no arquivo <code>.env</code>
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Instruções */}
            <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    📝 Como Ativar/Desativar Funcionalidades
                </h3>

                <div className="space-y-4">
                    <div>
                        <h4 className="font-medium text-gray-900 mb-2">1. Edite o arquivo <code>.env</code></h4>
                        <pre className="bg-gray-800 text-gray-100 p-4 rounded-lg text-sm overflow-x-auto">
{`# Questões Inteligentes
VITE_ENABLE_AI_QUESTIONS=true

# Recomendação de Candidato
VITE_ENABLE_AI_CANDIDATE_RECOMMENDATION=true

# Red Flags
VITE_ENABLE_AI_RED_FLAGS=true

# Análise de Reprovações (ativar após 15+ reprovações)
VITE_ENABLE_AI_REJECTION_ANALYSIS=false
VITE_MIN_REJECTIONS_FOR_ANALYSIS=15

# Predição de Riscos (ativar após 30+ candidaturas)
VITE_ENABLE_AI_RISK_PREDICTION=false
VITE_MIN_APPLICATIONS_FOR_PREDICTION=30

# Melhoria de Questões (ativar após 20+ candidaturas)
VITE_ENABLE_AI_QUESTION_IMPROVEMENT=false
VITE_MIN_APPLICATIONS_FOR_IMPROVEMENT=20

# Repriorização Automática
VITE_ENABLE_AI_AUTO_REPRIORITIZATION=true`}
                        </pre>
                    </div>

                    <div>
                        <h4 className="font-medium text-gray-900 mb-2">2. Reinicie o servidor</h4>
                        <pre className="bg-gray-800 text-gray-100 p-4 rounded-lg text-sm">
npm run dev
                        </pre>
                    </div>

                    <div>
                        <h4 className="font-medium text-gray-900 mb-2">3. Faça deploy (Vercel)</h4>
                        <p className="text-sm text-gray-700 mb-2">
                            Configure as variáveis de ambiente no Vercel Dashboard:
                        </p>
                        <p className="text-sm text-gray-600">
                            Settings → Environment Variables → Adicione as variáveis acima
                        </p>
                    </div>
                </div>
            </div>

            {/* Botão de Atualizar */}
            <div className="flex justify-center">
                <button
                    onClick={carregarStatus}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                    🔄 Atualizar Status
                </button>
            </div>
        </div>
    );
}
