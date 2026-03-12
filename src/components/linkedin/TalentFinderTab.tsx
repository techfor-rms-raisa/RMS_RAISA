/**
 * TalentFinderTab.tsx — Pesquisa de Candidatos via LinkedIn (Talent Finder)
 *
 * Aba integrada ao LinkedInImportPanel.
 * O Analista informa requisitos em texto livre e o Gemini AI + Google Search
 * descobre candidatos públicos no LinkedIn com os perfis correspondentes.
 *
 * Retorna: Nome / Cargo / Empresa Atual / LinkedIn URL
 * Sem gravação no banco — exibição + exportação XLS opcional.
 *
 * Arquitetura: mesmo padrão do Prospect Engine (ProspectSearchPage.tsx)
 *
 * Versão: 1.0
 * Data: 12/03/2026
 */

import React, { useState, useCallback } from 'react';

// ============================================
// TIPOS
// ============================================
interface CandidatoEncontrado {
    finder_id:      string;
    nome_completo:  string;
    cargo_atual:    string;
    empresa_atual:  string | null;
    linkedin_url:   string | null;
    cidade:         string | null;
    estado:         string | null;
    resumo:         string | null;
    relevancia:     'alta' | 'media' | 'baixa';
    selecionado?:   boolean;
}

interface SearchState {
    loading:  boolean;
    fase:     'idle' | 'buscando' | 'concluido' | 'erro';
    error:    string | null;
}

// ============================================
// EXEMPLOS DE REQUISITOS
// ============================================
const EXEMPLOS = [
    'Consultor SAP ISOil, SD, MM e FI - Especialista, Região de São Paulo ou Grande São Paulo',
    'Desenvolvedor Front End Mobile React Native - Avançado, Android/Kotlin - Básico, São Paulo',
    'Analista de Testes Sênior - Selenium, JUnit, Appium, Playwright, REST-assured, Brasil',
    'Analista de Sistemas Sênior - Open Finance, PIX, Meios de Pagamentos, São Paulo Capital',
];

// ============================================
// HELPERS
// ============================================
const RELEVANCIA_CONFIG = {
    alta:  { label: 'Alta',  color: 'bg-green-100 text-green-700  border-green-200' },
    media: { label: 'Média', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    baixa: { label: 'Baixa', color: 'bg-gray-100  text-gray-600   border-gray-200'  },
};

function exportarXLS(candidatos: CandidatoEncontrado[]) {
    // Gera CSV compatível com Excel (UTF-8 BOM para acentos)
    const bom = '\uFEFF';
    const header = ['Nome', 'Cargo Atual', 'Empresa Atual', 'Cidade', 'Estado', 'LinkedIn', 'Relevância'];
    const rows = candidatos.map(c => [
        c.nome_completo,
        c.cargo_atual,
        c.empresa_atual || '',
        c.cidade || '',
        c.estado || '',
        c.linkedin_url || '',
        RELEVANCIA_CONFIG[c.relevancia].label,
    ]);

    const csvContent = [header, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
        .join('\n');

    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = `talent-finder-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================
const TalentFinderTab: React.FC = () => {

    // Form
    const [requisitos, setRequisitos]   = useState('');
    const [maxResultados, setMax]       = useState(20);

    // Resultados
    const [resultados, setResultados]   = useState<CandidatoEncontrado[]>([]);
    const [queriesGoogle, setQueries]   = useState<string[]>([]);
    const [searchState, setSearch]      = useState<SearchState>({ loading: false, fase: 'idle', error: null });

    // Seleção
    const [todosSelecionados, setTodos] = useState(false);

    // ============================================
    // SELEÇÃO
    // ============================================
    const toggleSelecionado = (idx: number) => {
        setResultados(prev => {
            const u = [...prev];
            u[idx] = { ...u[idx], selecionado: !u[idx].selecionado };
            return u;
        });
    };

    const toggleTodos = () => {
        const novo = !todosSelecionados;
        setTodos(novo);
        setResultados(prev => prev.map(r => ({ ...r, selecionado: novo })));
    };

    const selecionados = resultados.filter(r => r.selecionado);

    // ============================================
    // RESET
    // ============================================
    const handleReset = useCallback(() => {
        setRequisitos('');
        setResultados([]);
        setQueries([]);
        setMax(20);
        setTodos(false);
        setSearch({ loading: false, fase: 'idle', error: null });
    }, []);

    // ============================================
    // BUSCAR
    // ============================================
    const handleBuscar = useCallback(async () => {
        if (!requisitos.trim() || requisitos.trim().length < 10) return;

        setSearch({ loading: true, fase: 'buscando', error: null });
        setResultados([]);
        setQueries([]);
        setTodos(false);

        try {
            const resp = await fetch('/api/talent-finder-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    requisitos:     requisitos.trim(),
                    max_resultados: maxResultados,
                }),
            });

            const data = await resp.json();

            if (!resp.ok || !data.success) {
                throw new Error(data.error || 'Erro ao buscar candidatos.');
            }

            const lista: CandidatoEncontrado[] = (data.resultados || []).map((c: any) => ({
                ...c,
                selecionado: false,
            }));

            setResultados(lista);
            setQueries(data.queries_google || []);
            setSearch({ loading: false, fase: 'concluido', error: null });

        } catch (err: any) {
            setSearch({ loading: false, fase: 'erro', error: err.message || 'Erro desconhecido.' });
        }
    }, [requisitos, maxResultados]);

    // ============================================
    // EXPORTAR XLS
    // ============================================
    const handleExportar = () => {
        const lista = selecionados.length > 0 ? selecionados : resultados;
        if (lista.length === 0) return;
        exportarXLS(lista);
    };

    // ============================================
    // RENDER
    // ============================================
    return (
        <div className="space-y-5">

            {/* ─── Header Explicativo ─────────────────────────── */}
            <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 rounded-xl p-5">
                <div className="flex items-start gap-3">
                    <span className="text-3xl">🔍</span>
                    <div>
                        <h3 className="font-bold text-indigo-900 text-base">
                            Talent Finder — Busca de Candidatos no LinkedIn
                        </h3>
                        <p className="text-sm text-indigo-700 mt-1">
                            Informe os requisitos da vaga em texto livre. O Gemini AI pesquisará
                            candidatos públicos no LinkedIn e retornará <strong>Nome, Cargo e Link</strong>.
                        </p>
                        <p className="text-xs text-indigo-500 mt-1">
                            ⚡ Powered by Gemini 2.5 Flash + Google Search · Sem consumo de créditos extras
                        </p>
                    </div>
                </div>
            </div>

            {/* ─── Formulário ─────────────────────────────────── */}
            <div className="bg-white border rounded-xl p-5 space-y-4 shadow-sm">

                {/* Textarea de requisitos */}
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Requisitos Mandatórios
                        <span className="text-red-500 ml-1">*</span>
                    </label>
                    <textarea
                        className="w-full border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                        rows={4}
                        placeholder="Descreva o perfil buscado...&#10;Ex: Consultor SAP FI/CO Sênior, com experiência em implementação e suporte, São Paulo ou Grande SP"
                        value={requisitos}
                        onChange={e => setRequisitos(e.target.value)}
                        disabled={searchState.loading}
                    />
                    <p className="text-xs text-gray-400 mt-1">
                        {requisitos.length} caracteres
                        {requisitos.length < 10 && requisitos.length > 0 && (
                            <span className="text-red-400 ml-2">— mínimo 10 caracteres</span>
                        )}
                    </p>
                </div>

                {/* Exemplos */}
                <div>
                    <p className="text-xs font-semibold text-gray-500 mb-2">💡 Exemplos rápidos:</p>
                    <div className="flex flex-wrap gap-2">
                        {EXEMPLOS.map((ex, i) => (
                            <button
                                key={i}
                                onClick={() => setRequisitos(ex)}
                                disabled={searchState.loading}
                                className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-md hover:bg-indigo-50 hover:text-indigo-700 transition-colors border border-gray-200 disabled:opacity-40"
                            >
                                {ex.substring(0, 40)}...
                            </button>
                        ))}
                    </div>
                </div>

                {/* Slider max resultados + Botão */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pt-2 border-t">
                    <div className="flex items-center gap-3 flex-1">
                        <label className="text-sm text-gray-600 whitespace-nowrap">
                            Máx. resultados:
                            <span className="font-bold text-indigo-700 ml-1">{maxResultados}</span>
                        </label>
                        <input
                            type="range"
                            min={5}
                            max={50}
                            step={5}
                            value={maxResultados}
                            onChange={e => setMax(Number(e.target.value))}
                            disabled={searchState.loading}
                            className="flex-1 accent-indigo-600"
                        />
                        <span className="text-xs text-gray-400 whitespace-nowrap">5 – 50</span>
                    </div>

                    <div className="flex gap-2">
                        {searchState.fase !== 'idle' && (
                            <button
                                onClick={handleReset}
                                disabled={searchState.loading}
                                className="px-3 py-2 text-sm border rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                            >
                                🔄 Nova Pesquisa
                            </button>
                        )}
                        <button
                            onClick={handleBuscar}
                            disabled={searchState.loading || requisitos.trim().length < 10}
                            className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                        >
                            {searchState.loading ? (
                                <>
                                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                    </svg>
                                    Pesquisando...
                                </>
                            ) : (
                                <>🔍 Pesquisar Candidatos</>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* ─── Loading ────────────────────────────────────── */}
            {searchState.fase === 'buscando' && (
                <div className="bg-white border rounded-xl p-8 text-center shadow-sm">
                    <div className="flex flex-col items-center gap-4">
                        <div className="relative">
                            <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin"/>
                            <span className="absolute inset-0 flex items-center justify-center text-2xl">🤖</span>
                        </div>
                        <div>
                            <p className="font-semibold text-gray-700">Gemini AI pesquisando no LinkedIn...</p>
                            <p className="text-sm text-gray-500 mt-1">
                                Executando até 6 buscas no Google. Isso pode levar 20–40 segundos.
                            </p>
                        </div>
                        <div className="flex gap-2 text-xs text-gray-400">
                            <span className="animate-pulse">● Buscando perfis públicos</span>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Erro ───────────────────────────────────────── */}
            {searchState.fase === 'erro' && searchState.error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-5">
                    <div className="flex items-start gap-3">
                        <span className="text-2xl">⚠️</span>
                        <div>
                            <p className="font-semibold text-red-700">Erro na pesquisa</p>
                            <p className="text-sm text-red-600 mt-1">{searchState.error}</p>
                            <button
                                onClick={handleBuscar}
                                className="mt-3 text-sm text-red-700 underline hover:no-underline"
                            >
                                Tentar novamente
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Resultados ─────────────────────────────────── */}
            {searchState.fase === 'concluido' && (
                <div className="space-y-4">

                    {/* Barra de resultados */}
                    <div className="bg-white border rounded-xl px-4 py-3 shadow-sm flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-4">
                            <span className="font-semibold text-gray-700">
                                {resultados.length === 0
                                    ? '0 candidatos encontrados'
                                    : `${resultados.length} candidato${resultados.length !== 1 ? 's' : ''} encontrado${resultados.length !== 1 ? 's' : ''}`
                                }
                            </span>
                            {resultados.length > 0 && (
                                <>
                                    <span className="text-sm text-green-600 font-medium">
                                        {resultados.filter(r => r.relevancia === 'alta').length} alta relevância
                                    </span>
                                    <span className="text-sm text-gray-400">
                                        {resultados.filter(r => r.linkedin_url).length} com LinkedIn
                                    </span>
                                </>
                            )}
                        </div>

                        {resultados.length > 0 && (
                            <div className="flex items-center gap-2">
                                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={todosSelecionados}
                                        onChange={toggleTodos}
                                        className="w-4 h-4 accent-indigo-600"
                                    />
                                    Selecionar todos
                                </label>
                                <button
                                    onClick={handleExportar}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                                    </svg>
                                    {selecionados.length > 0
                                        ? `Exportar ${selecionados.length} selecionados`
                                        : 'Exportar todos (.csv)'
                                    }
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Zero resultados */}
                    {resultados.length === 0 && (
                        <div className="bg-white border rounded-xl p-10 text-center shadow-sm">
                            <span className="text-5xl">🔍</span>
                            <p className="mt-4 font-semibold text-gray-600">Nenhum candidato encontrado</p>
                            <p className="text-sm text-gray-400 mt-2">
                                Tente reformular os requisitos com mais palavras-chave técnicas ou reduzir a especificidade da região.
                            </p>
                        </div>
                    )}

                    {/* Lista de candidatos */}
                    {resultados.length > 0 && (
                        <div className="space-y-2">
                            {resultados.map((c, idx) => {
                                const rel = RELEVANCIA_CONFIG[c.relevancia];
                                return (
                                    <div
                                        key={c.finder_id}
                                        className={`bg-white border rounded-xl p-4 shadow-sm transition-all ${
                                            c.selecionado ? 'border-indigo-300 bg-indigo-50/30' : 'hover:border-gray-300'
                                        }`}
                                    >
                                        <div className="flex items-start gap-3">

                                            {/* Checkbox */}
                                            <input
                                                type="checkbox"
                                                checked={!!c.selecionado}
                                                onChange={() => toggleSelecionado(idx)}
                                                className="mt-1 w-4 h-4 accent-indigo-600 flex-shrink-0"
                                            />

                                            {/* Avatar inicial */}
                                            <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                                                {c.nome_completo.charAt(0).toUpperCase()}
                                            </div>

                                            {/* Dados */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="font-semibold text-gray-800 text-sm">
                                                        {c.nome_completo}
                                                    </span>
                                                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${rel.color}`}>
                                                        {rel.label}
                                                    </span>
                                                    {c.linkedin_url && (
                                                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 font-medium">
                                                            LinkedIn
                                                        </span>
                                                    )}
                                                </div>

                                                <p className="text-sm text-gray-600 mt-0.5">
                                                    {c.cargo_atual}
                                                    {c.empresa_atual && (
                                                        <span className="text-gray-400"> · {c.empresa_atual}</span>
                                                    )}
                                                </p>

                                                {(c.cidade || c.estado) && (
                                                    <p className="text-xs text-gray-400 mt-0.5">
                                                        📍 {[c.cidade, c.estado].filter(Boolean).join(', ')}
                                                    </p>
                                                )}

                                                {c.resumo && (
                                                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                                                        {c.resumo}
                                                    </p>
                                                )}
                                            </div>

                                            {/* Ação LinkedIn */}
                                            <div className="flex-shrink-0">
                                                {c.linkedin_url ? (
                                                    <a
                                                        href={c.linkedin_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-colors font-medium"
                                                        title="Abrir perfil no LinkedIn"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                                            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                                                        </svg>
                                                        Ver Perfil
                                                    </a>
                                                ) : (
                                                    <span className="text-xs text-gray-400 italic">Sem link</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Queries utilizadas */}
                    {queriesGoogle.length > 0 && (
                        <details className="bg-gray-50 border rounded-lg">
                            <summary className="px-4 py-2 text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                                🔍 {queriesGoogle.length} queries Google utilizadas
                            </summary>
                            <div className="px-4 pb-3 space-y-1">
                                {queriesGoogle.map((q, i) => (
                                    <p key={i} className="text-xs text-gray-500 font-mono bg-white rounded px-2 py-1 border">
                                        {i + 1}. {q}
                                    </p>
                                ))}
                            </div>
                        </details>
                    )}
                </div>
            )}

            {/* ─── Aviso de estado idle ───────────────────────── */}
            {searchState.fase === 'idle' && (
                <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-8 text-center">
                    <span className="text-4xl">🎯</span>
                    <p className="mt-3 text-sm text-gray-500 font-medium">
                        Descreva os requisitos acima e clique em <strong>Pesquisar Candidatos</strong>
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                        Inclua cargo, tecnologias, nível de senioridade e região para melhores resultados
                    </p>
                </div>
            )}
        </div>
    );
};

export default TalentFinderTab;

