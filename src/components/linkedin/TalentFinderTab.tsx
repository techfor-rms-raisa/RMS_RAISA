/**
 * TalentFinderTab.tsx — Gerador de Boolean Search para LinkedIn
 *
 * Versão: 2.0 — Nova arquitetura: gera queries booleanas para Google Search
 * Data: 13/03/2026
 *
 * Fluxo:
 * 1. Recrutador descreve os requisitos em texto livre
 * 2. Gemini gera 3 queries booleanas otimizadas (abrangente, título, tecnologia)
 * 3. Recrutador clica "Abrir no Google" — resultados reais do LinkedIn aparecem
 * 4. Recrutador pode copiar e editar a query manualmente se necessário
 */

import React, { useState, useCallback } from 'react';

const TALENT_FINDER_VERSION = '2.0';

interface QueryGerada {
    id:         string;
    tipo:       'abrangente' | 'titulo' | 'tecnologia';
    titulo:     string;
    descricao:  string;
    query:      string;
    url_google: string;
}

interface SearchState {
    loading: boolean;
    fase:    'idle' | 'gerando' | 'concluido' | 'erro' | 'rate_limit';
    error:   string | null;
}

const EXEMPLOS = [
    'Consultor SAP ISOil, SD, MM e FI - Especialista, Região de São Paulo ou Grande São Paulo',
    'Desenvolvedor Front End Mobile React Native - Avançado, Android/Kotlin - Básico, São Paulo',
    'Analista de Testes Sênior - Selenium, JUnit, Appium, Playwright, REST-assured, Brasil',
    'Analista de Sistemas Sênior - Open Finance, PIX, Meios de Pagamentos, São Paulo Capital',
];

const TIPO_CONFIG: Record<string, { icon: string; color: string; badge: string }> = {
    abrangente:  { icon: '🌐', color: 'border-indigo-200 bg-indigo-50/40', badge: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
    titulo:      { icon: '🏷️', color: 'border-blue-200 bg-blue-50/40',    badge: 'bg-blue-100 text-blue-700 border-blue-200'       },
    tecnologia:  { icon: '⚙️', color: 'border-purple-200 bg-purple-50/40', badge: 'bg-purple-100 text-purple-700 border-purple-200' },
};

const TalentFinderTab: React.FC = () => {

    const [requisitos, setRequisitos] = useState('');
    const [queries, setQueries]       = useState<QueryGerada[]>([]);
    const [searchState, setSearch]    = useState<SearchState>({ loading: false, fase: 'idle', error: null });
    const [copiado, setCopiado]       = useState<string | null>(null);

    const handleReset = useCallback(() => {
        setRequisitos('');
        setQueries([]);
        setSearch({ loading: false, fase: 'idle', error: null });
        setCopiado(null);
    }, []);

    const handleCopiar = useCallback((id: string, query: string) => {
        navigator.clipboard.writeText(query).then(() => {
            setCopiado(id);
            setTimeout(() => setCopiado(null), 2000);
        });
    }, []);

    const handleGerar = useCallback(async () => {
        if (!requisitos.trim() || requisitos.trim().length < 10) return;

        console.log(`🚀 [TalentFinderTab v${TALENT_FINDER_VERSION}] Gerando queries`);
        console.log(`   Requisitos: ${requisitos.substring(0, 100)}`);

        setSearch({ loading: true, fase: 'gerando', error: null });
        setQueries([]);

        try {
            const resp = await fetch('/api/talent-finder-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requisitos: requisitos.trim() }),
            });

            const data = await resp.json();
            console.log(`📦 [TalentFinderTab] Resposta:`, data);

            // Rate limit — tratamento visual específico (não é erro da aplicação)
            if (resp.status === 429) {
                setSearch({ loading: false, fase: 'rate_limit', error: null });
                return;
            }

            if (!resp.ok || !data.success) throw new Error(data.error || 'Erro ao gerar queries.');

            setQueries(data.queries || []);
            setSearch({ loading: false, fase: 'concluido', error: null });
            console.log(`✅ [TalentFinderTab] ${data.queries?.length} queries recebidas`);

        } catch (err: any) {
            console.error(`❌ [TalentFinderTab] Erro:`, err);

            // Detectar rate limit — backend retorna 429 com mensagem_usuario
            const isRateLimit = err.message?.includes('rate_limit') ||
                                err.message?.includes('429') ||
                                err.message?.includes('Resource exhausted');

            if (isRateLimit) {
                setSearch({ loading: false, fase: 'rate_limit', error: null });
            } else {
                setSearch({ loading: false, fase: 'erro', error: err.message || 'Erro desconhecido.' });
            }
        }
    }, [requisitos]);

    return (
        <div className="space-y-5">

            {/* ── Header ────────────────────────────────────────────── */}
            <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 rounded-xl p-5">
                <div className="flex items-start gap-3">
                    <span className="text-2xl mt-0.5">🔍</span>
                    <div>
                        <h2 className="font-bold text-gray-800 text-base">
                            Talent Finder — Gerador de Boolean Search
                        </h2>
                        <p className="text-sm text-gray-600 mt-0.5">
                            Descreva os requisitos da vaga. O Gemini AI criará queries avançadas para buscar candidatos diretamente no Google/LinkedIn.
                        </p>
                        <p className="text-xs text-indigo-600 mt-1.5 flex items-center gap-1">
                            <span>⚡</span>
                            Powered by Gemini 2.0 Flash · Sem consumo de créditos extras · Resultados diretos do LinkedIn
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Formulário ────────────────────────────────────────── */}
            <div className="bg-white border rounded-xl p-5 shadow-sm space-y-4">
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                        Requisitos da Vaga <span className="text-red-500">*</span>
                    </label>
                    <textarea
                        value={requisitos}
                        onChange={e => setRequisitos(e.target.value)}
                        disabled={searchState.loading}
                        placeholder="Ex: Desenvolvedor React Native Sênior, Android/Kotlin, São Paulo&#10;Ex: Analista de Testes - Selenium, JUnit, Appium, Brasil&#10;Ex: Consultor SAP IS-Oil, SD, MM e FI, Grande São Paulo"
                        rows={3}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 resize-none disabled:opacity-50 disabled:bg-gray-50"
                    />
                    <p className="text-xs text-gray-400 mt-1">{requisitos.length} caracteres</p>
                </div>

                {/* Exemplos */}
                <div>
                    <p className="text-xs font-semibold text-gray-500 mb-2">💡 Exemplos rápidos:</p>
                    <div className="flex flex-wrap gap-2">
                        {EXEMPLOS.map((ex, i) => (
                            <button key={i} onClick={() => setRequisitos(ex)} disabled={searchState.loading}
                                className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-md hover:bg-indigo-50 hover:text-indigo-700 transition-colors border border-gray-200 disabled:opacity-40">
                                {ex.substring(0, 40)}...
                            </button>
                        ))}
                    </div>
                </div>

                {/* Ações */}
                <div className="flex justify-end gap-2 pt-2 border-t">
                    {searchState.fase !== 'idle' && (
                        <button onClick={handleReset} disabled={searchState.loading}
                            className="px-3 py-2 text-sm border rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                            🔄 Nova Busca
                        </button>
                    )}
                    <button onClick={handleGerar}
                        disabled={searchState.loading || requisitos.trim().length < 10}
                        className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-colors">
                        {searchState.loading ? (
                            <>
                                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                </svg>
                                Gerando queries...
                            </>
                        ) : <>🔍 Gerar Queries de Busca</>}
                    </button>
                </div>
            </div>

            {/* ── Loading ───────────────────────────────────────────── */}
            {searchState.fase === 'gerando' && (
                <div className="bg-white border rounded-xl p-8 text-center shadow-sm">
                    <div className="flex flex-col items-center gap-4">
                        <div className="relative">
                            <div className="w-14 h-14 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin"/>
                            <span className="absolute inset-0 flex items-center justify-center text-xl">🤖</span>
                        </div>
                        <div>
                            <p className="font-semibold text-gray-700">Gemini analisando os requisitos...</p>
                            <p className="text-sm text-gray-500 mt-1">Gerando queries booleanas otimizadas para LinkedIn. Isso leva apenas alguns segundos.</p>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Rate Limit (aviso temporário — não é erro da aplicação) ── */}
            {searchState.fase === 'rate_limit' && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-5">
                    <div className="flex items-start gap-3">
                        <span className="text-2xl">⏳</span>
                        <div className="flex-1">
                            <p className="font-semibold text-amber-800">Serviço temporariamente sobrecarregado</p>
                            <p className="text-sm text-amber-700 mt-1">
                                O serviço de IA recebeu muitas requisições ao mesmo tempo. Isso é temporário — aguarde alguns segundos e tente novamente.
                            </p>
                            <button
                                onClick={handleGerar}
                                className="mt-3 flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 transition-colors font-medium">
                                <span>🔄</span> Tentar novamente
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Erro ──────────────────────────────────────────────── */}
            {searchState.fase === 'erro' && searchState.error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-5">
                    <div className="flex items-start gap-3">
                        <span className="text-2xl">⚠️</span>
                        <div>
                            <p className="font-semibold text-red-700">Erro ao gerar queries</p>
                            <p className="text-sm text-red-600 mt-1">{searchState.error}</p>
                            <button onClick={handleGerar} className="mt-3 text-sm text-red-700 underline hover:no-underline">
                                Tentar novamente
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Resultado: Queries geradas ────────────────────────── */}
            {searchState.fase === 'concluido' && queries.length > 0 && (
                <div className="space-y-3">

                    {/* Cabeçalho dos resultados */}
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-semibold text-gray-700">
                                {queries.length} queries geradas para: <span className="text-indigo-700">"{requisitos.substring(0, 50)}{requisitos.length > 50 ? '...' : ''}"</span>
                            </h3>
                            <p className="text-xs text-gray-500 mt-0.5">
                                Clique em <strong>Abrir no Google</strong> para ver os resultados do LinkedIn · Use <strong>Copiar</strong> para editar manualmente
                            </p>
                        </div>
                    </div>

                    {/* Cards das queries */}
                    {queries.map((q) => {
                        const config = TIPO_CONFIG[q.tipo] || TIPO_CONFIG.abrangente;
                        const jaCopiei = copiado === q.id;

                        return (
                            <div key={q.id} className={`border rounded-xl p-4 shadow-sm transition-all ${config.color}`}>

                                {/* Linha do título */}
                                <div className="flex items-center justify-between gap-3 mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg">{config.icon}</span>
                                        <span className="font-semibold text-gray-800 text-sm">{q.titulo}</span>
                                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${config.badge}`}>
                                            {q.tipo}
                                        </span>
                                    </div>
                                    {/* Botões de ação */}
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <button
                                            onClick={() => handleCopiar(q.id, q.query)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg text-gray-600 bg-white hover:bg-gray-50 transition-colors font-medium">
                                            {jaCopiei ? (
                                                <><span>✅</span> Copiado!</>
                                            ) : (
                                                <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                                                </svg> Copiar</>
                                            )}
                                        </button>
                                        <a
                                            href={q.url_google}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700 transition-colors font-medium">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                                            </svg>
                                            Abrir no Google
                                        </a>
                                    </div>
                                </div>

                                {/* Descrição */}
                                <p className="text-xs text-gray-500 mb-2">{q.descricao}</p>

                                {/* Query em destaque — editável pelo recrutador */}
                                <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5 font-mono text-xs text-gray-700 break-all leading-relaxed select-all cursor-text"
                                    title="Clique para selecionar tudo">
                                    {q.query}
                                </div>

                                {/* Dica de uso */}
                                <p className="text-xs text-gray-400 mt-2">
                                    💡 Clique na query acima para selecionar · Cole no Google para editar antes de buscar
                                </p>
                            </div>
                        );
                    })}

                    {/* Instrução de uso */}
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <p className="text-xs font-semibold text-amber-700 mb-1">📋 Como usar os resultados do Google:</p>
                        <ol className="text-xs text-amber-700 space-y-1 list-decimal list-inside">
                            <li>Clique em <strong>Abrir no Google</strong> na query desejada</li>
                            <li>O Google listará perfis do LinkedIn com nome, cargo, empresa e localização</li>
                            <li>Clique no link do perfil para acessar diretamente o LinkedIn</li>
                            <li>Use <strong>Copiar</strong> para colar a query no Google e editar manualmente</li>
                        </ol>
                    </div>
                </div>
            )}

            {/* ── Idle ──────────────────────────────────────────────── */}
            {searchState.fase === 'idle' && (
                <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-8 text-center">
                    <span className="text-4xl">🎯</span>
                    <p className="mt-3 text-sm text-gray-500 font-medium">
                        Descreva os requisitos da vaga e clique em <strong>Gerar Queries de Busca</strong>
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                        O Gemini criará 3 queries booleanas otimizadas para encontrar candidatos no LinkedIn via Google
                    </p>
                </div>
            )}
        </div>
    );
};

export default TalentFinderTab;
