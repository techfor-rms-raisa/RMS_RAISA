/**
 * ApolloTalentTab.tsx - Aba de busca de candidatos via Apollo
 * 
 * Componente que será inserido como nova aba no LinkedInImportPanel.
 * 
 * FLUXO:
 * 1. Analista seleciona uma vaga aberta
 * 2. Sistema extrai filtros automaticamente (título, skills, senioridade)
 * 3. Analista pode ajustar filtros manualmente
 * 4. Busca no Apollo (0 créditos)
 * 5. Resultados exibidos com botão "Abrir LinkedIn"
 * 6. Analista usa extensão Chrome existente para importar
 * 
 * Versão: 1.0
 * Data: 03/03/2026
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useApolloTalentSearch, VagaResumo, ApolloTalentResult, ApolloTalentSearchFilters } from '@/hooks/supabase/useApolloTalentSearch';

interface ApolloTalentTabProps {
  userId?: number;
}

// ============================================
// CONSTANTES
// ============================================

const UF_OPTIONS = [
  '', 'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

const SENIORITY_OPTIONS = [
  { value: '', label: 'Todas' },
  { value: 'Junior', label: 'Junior' },
  { value: 'Pleno', label: 'Pleno' },
  { value: 'Senior', label: 'Senior' },
  { value: 'Especialista', label: 'Especialista' }
];

const EMPLOYEE_RANGES = [
  { value: '', label: 'Qualquer tamanho' },
  { value: '1,50', label: '1-50 funcionários' },
  { value: '51,200', label: '51-200 funcionários' },
  { value: '201,500', label: '201-500 funcionários' },
  { value: '501,1000', label: '501-1.000 funcionários' },
  { value: '1001,5000', label: '1.001-5.000 funcionários' },
  { value: '5001,100000', label: '5.000+ funcionários' }
];

// ============================================
// COMPONENTE
// ============================================

const ApolloTalentTab: React.FC<ApolloTalentTabProps> = ({ userId }) => {
  const {
    loading,
    error,
    results,
    pagination,
    vagasAbertas,
    loadingVagas,
    carregarVagasAbertas,
    extrairFiltrosDaVaga,
    buscarCandidatos,
    irParaPagina,
    limparResultados
  } = useApolloTalentSearch();

  // ============================================
  // ESTADOS LOCAIS
  // ============================================

  // Seleção de vaga
  const [vagaSelecionadaId, setVagaSelecionadaId] = useState<string>('');
  const [buscaVaga, setBuscaVaga] = useState('');

  // Filtros editáveis (preenchidos pela vaga, editáveis pelo analista)
  const [filtroTitulos, setFiltroTitulos] = useState('');
  const [filtroSenioridade, setFiltroSenioridade] = useState('');
  const [filtroKeywords, setFiltroKeywords] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroTamanhoEmpresa, setFiltroTamanhoEmpresa] = useState('');
  const [perPage, setPerPage] = useState(25);

  // Controle de UI
  const [mostrarFiltrosAvancados, setMostrarFiltrosAvancados] = useState(false);
  const [jaBuscou, setJaBuscou] = useState(false);

  // ============================================
  // CARREGAR VAGAS AO MONTAR
  // ============================================

  useEffect(() => {
    carregarVagasAbertas();
  }, [carregarVagasAbertas]);

  // ============================================
  // VAGA SELECIONADA
  // ============================================

  const vagaSelecionada = useMemo(() => {
    if (!vagaSelecionadaId) return null;
    return vagasAbertas.find(v => v.id === vagaSelecionadaId) || null;
  }, [vagaSelecionadaId, vagasAbertas]);

  // Filtrar vagas pelo termo de busca
  const vagasFiltradas = useMemo(() => {
    if (!buscaVaga.trim()) return vagasAbertas;
    const termo = buscaVaga.toLowerCase();
    return vagasAbertas.filter(v =>
      v.titulo.toLowerCase().includes(termo) ||
      v.cliente_nome?.toLowerCase().includes(termo) ||
      v.stack_tecnologica?.some(s => s.toLowerCase().includes(termo))
    );
  }, [vagasAbertas, buscaVaga]);

  // ============================================
  // QUANDO VAGA É SELECIONADA → EXTRAIR FILTROS
  // ============================================

  const handleSelecionarVaga = (vagaId: string) => {
    setVagaSelecionadaId(vagaId);
    limparResultados();
    setJaBuscou(false);

    if (!vagaId) {
      setFiltroTitulos('');
      setFiltroSenioridade('');
      setFiltroKeywords('');
      return;
    }

    const vaga = vagasAbertas.find(v => v.id === vagaId);
    if (!vaga) return;

    // Extrair filtros automaticamente da vaga
    const filtros = extrairFiltrosDaVaga(vaga);

    setFiltroTitulos(filtros.person_titles.join(', '));
    setFiltroSenioridade(vaga.senioridade);
    setFiltroKeywords(filtros.q_keywords);
  };

  // ============================================
  // EXECUTAR BUSCA
  // ============================================

  const handleBuscar = async (page: number = 1) => {
    // Montar filtros
    const titles = filtroTitulos
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    const filters: ApolloTalentSearchFilters = {
      person_titles: titles,
      person_seniorities: filtroSenioridade ? [filtroSenioridade] : [],
      person_locations: filtroEstado
        ? [`${UF_OPTIONS.includes(filtroEstado) ? filtroEstado : ''}, Brazil`.replace(', Brazil', '').trim() || 'Brazil']
        : ['Brazil'],
      q_keywords: filtroKeywords,
      organization_num_employees_ranges: filtroTamanhoEmpresa ? [filtroTamanhoEmpresa] : [],
      page,
      per_page: perPage
    };

    // Ajustar localização
    if (filtroEstado) {
      const ESTADO_MAP: Record<string, string> = {
        'AC': 'Acre, Brazil', 'AL': 'Alagoas, Brazil', 'AP': 'Amapá, Brazil',
        'AM': 'Amazonas, Brazil', 'BA': 'Bahia, Brazil', 'CE': 'Ceará, Brazil',
        'DF': 'Distrito Federal, Brazil', 'ES': 'Espírito Santo, Brazil',
        'GO': 'Goiás, Brazil', 'MA': 'Maranhão, Brazil', 'MT': 'Mato Grosso, Brazil',
        'MS': 'Mato Grosso do Sul, Brazil', 'MG': 'Minas Gerais, Brazil',
        'PA': 'Pará, Brazil', 'PB': 'Paraíba, Brazil', 'PR': 'Paraná, Brazil',
        'PE': 'Pernambuco, Brazil', 'PI': 'Piauí, Brazil',
        'RJ': 'Rio de Janeiro, Brazil', 'RN': 'Rio Grande do Norte, Brazil',
        'RS': 'Rio Grande do Sul, Brazil', 'RO': 'Rondônia, Brazil',
        'RR': 'Roraima, Brazil', 'SC': 'Santa Catarina, Brazil',
        'SP': 'São Paulo, Brazil', 'SE': 'Sergipe, Brazil', 'TO': 'Tocantins, Brazil'
      };
      filters.person_locations = [ESTADO_MAP[filtroEstado] || 'Brazil'];
    }

    await buscarCandidatos(filters, userId, vagaSelecionadaId || undefined);
    setJaBuscou(true);
  };

  // ============================================
  // ABRIR LINKEDIN EM NOVA ABA
  // ============================================

  const handleAbrirLinkedIn = (url: string) => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  // ============================================
  // RENDER: CARD DE RESULTADO
  // ============================================

  const renderResultCard = (person: ApolloTalentResult) => (
    <div
      key={person.id}
      className={`p-4 bg-white rounded-lg border transition-shadow hover:shadow-md ${
        person.ja_importado ? 'border-green-300 bg-green-50/30' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="flex-shrink-0">
          {person.photo_url ? (
            <img
              src={person.photo_url}
              alt={person.name}
              className="w-12 h-12 rounded-full object-cover border-2 border-gray-200"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
                (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : null}
          <div className={`w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg ${person.photo_url ? 'hidden' : ''}`}>
            {person.first_name?.charAt(0) || '?'}
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-gray-800 truncate">{person.name}</h4>
            {person.ja_importado && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700 border border-green-300 whitespace-nowrap">
                ✅ Já no Banco de Talentos
              </span>
            )}
          </div>

          <p className="text-sm text-gray-600 mt-0.5 truncate">
            {person.title || person.headline || 'Cargo não informado'}
          </p>

          <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500 flex-wrap">
            {person.organization_name && (
              <span className="flex items-center gap-1">
                <i className="fa-solid fa-building text-gray-400"></i>
                {person.organization_name}
              </span>
            )}
            {(person.city || person.country) && (
              <span className="flex items-center gap-1">
                <i className="fa-solid fa-location-dot text-gray-400"></i>
                {[person.city, person.state, person.country].filter(Boolean).join(', ')}
              </span>
            )}
            {person.seniority && (
              <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                {person.seniority}
              </span>
            )}
          </div>
        </div>

        {/* Ações */}
        <div className="flex flex-col gap-2 flex-shrink-0">
          {person.linkedin_url ? (
            <button
              onClick={() => handleAbrirLinkedIn(person.linkedin_url)}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5 whitespace-nowrap"
              title="Abrir perfil no LinkedIn (use a extensão Chrome para importar)"
            >
              <i className="fa-brands fa-linkedin"></i>
              Abrir LinkedIn
            </button>
          ) : (
            <span className="px-3 py-1.5 bg-gray-100 text-gray-400 text-xs rounded-lg whitespace-nowrap">
              Sem LinkedIn
            </span>
          )}
        </div>
      </div>
    </div>
  );

  // ============================================
  // RENDER: CARD DA VAGA SELECIONADA
  // ============================================

  const renderVagaSelecionada = () => {
    if (!vagaSelecionada) return null;

    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">📋</span>
              <h4 className="font-semibold text-blue-800">{vagaSelecionada.titulo}</h4>
            </div>
            <div className="flex items-center gap-3 text-sm text-blue-600 flex-wrap">
              {vagaSelecionada.cliente_nome && (
                <span>🏢 {vagaSelecionada.cliente_nome}</span>
              )}
              <span>📊 {vagaSelecionada.senioridade}</span>
              {vagaSelecionada.modalidade && (
                <span>💼 {vagaSelecionada.modalidade}</span>
              )}
            </div>
            {(vagaSelecionada.stack_tecnologica || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {(vagaSelecionada.stack_tecnologica || []).slice(0, 8).map((skill, i) => (
                  <span key={i} className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                    {skill}
                  </span>
                ))}
                {(vagaSelecionada.stack_tecnologica || []).length > 8 && (
                  <span className="px-2 py-0.5 text-xs bg-blue-200 text-blue-800 rounded-full">
                    +{(vagaSelecionada.stack_tecnologica || []).length - 8}
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => handleSelecionarVaga('')}
            className="text-blue-400 hover:text-blue-600 text-sm"
            title="Trocar vaga"
          >
            ✕
          </button>
        </div>

        {/* Filtros extraídos automaticamente */}
        <div className="mt-3 pt-3 border-t border-blue-200">
          <p className="text-xs text-blue-500 mb-1 font-medium">
            🤖 Filtros extraídos automaticamente da vaga:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-blue-700">
            <div><strong>Títulos:</strong> {filtroTitulos || '-'}</div>
            <div><strong>Senioridade:</strong> {filtroSenioridade || '-'}</div>
            <div><strong>Skills:</strong> {filtroKeywords || '-'}</div>
          </div>
        </div>
      </div>
    );
  };

  // ============================================
  // RENDER: PAGINAÇÃO
  // ============================================

  const renderPaginacao = () => {
    if (pagination.total_pages <= 1) return null;

    const { page, total_pages, total_entries } = pagination;
    const maxVisible = 5;
    let startPage = Math.max(1, page - Math.floor(maxVisible / 2));
    let endPage = Math.min(total_pages, startPage + maxVisible - 1);
    if (endPage - startPage < maxVisible - 1) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    const pages = [];
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return (
      <div className="flex items-center justify-between bg-white rounded-lg p-3 border">
        <span className="text-sm text-gray-500">
          {total_entries.toLocaleString('pt-BR')} candidatos encontrados
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleBuscar(page - 1)}
            disabled={page <= 1 || loading}
            className="px-2 py-1 text-sm rounded border hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ‹
          </button>
          {startPage > 1 && (
            <>
              <button onClick={() => handleBuscar(1)} className="px-2 py-1 text-sm rounded border hover:bg-gray-50">1</button>
              {startPage > 2 && <span className="px-1 text-gray-400">…</span>}
            </>
          )}
          {pages.map(p => (
            <button
              key={p}
              onClick={() => handleBuscar(p)}
              disabled={loading}
              className={`px-2.5 py-1 text-sm rounded border ${
                p === page
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'hover:bg-gray-50'
              }`}
            >
              {p}
            </button>
          ))}
          {endPage < total_pages && (
            <>
              {endPage < total_pages - 1 && <span className="px-1 text-gray-400">…</span>}
              <button onClick={() => handleBuscar(total_pages)} className="px-2 py-1 text-sm rounded border hover:bg-gray-50">{total_pages}</button>
            </>
          )}
          <button
            onClick={() => handleBuscar(page + 1)}
            disabled={page >= total_pages || loading}
            className="px-2 py-1 text-sm rounded border hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ›
          </button>
        </div>
      </div>
    );
  };

  // ============================================
  // RENDER PRINCIPAL
  // ============================================

  return (
    <div className="space-y-4">

      {/* ============================================ */}
      {/* ETAPA 1: SELECIONAR VAGA */}
      {/* ============================================ */}
      {!vagaSelecionadaId ? (
        <div className="space-y-3">
          <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🎯</span>
              <div>
                <h3 className="font-bold text-gray-800">Buscar Candidatos no Apollo</h3>
                <p className="text-sm text-gray-500">
                  Selecione uma vaga e o sistema extrairá automaticamente os filtros de busca
                </p>
              </div>
            </div>
          </div>

          {/* Busca de vaga */}
          <div className="bg-white rounded-lg p-4 border">
            <div className="flex items-center gap-3 mb-3">
              <input
                type="text"
                placeholder="Buscar vaga por título, cliente ou skill..."
                value={buscaVaga}
                onChange={e => setBuscaVaga(e.target.value)}
                className="flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
              <span className="text-sm text-gray-400 whitespace-nowrap">
                {vagasFiltradas.length} vaga{vagasFiltradas.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Lista de vagas */}
            {loadingVagas ? (
              <div className="text-center py-8">
                <div className="animate-spin w-6 h-6 border-3 border-orange-500 border-t-transparent rounded-full mx-auto"></div>
                <p className="text-sm text-gray-400 mt-2">Carregando vagas...</p>
              </div>
            ) : vagasFiltradas.length > 0 ? (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {vagasFiltradas.map(vaga => (
                  <button
                    key={vaga.id}
                    onClick={() => handleSelecionarVaga(vaga.id)}
                    className="w-full text-left p-3 rounded-lg border hover:border-orange-400 hover:bg-orange-50 transition-colors group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-800 truncate">{vaga.titulo}</span>
                          <span className={`px-1.5 py-0.5 text-xs rounded ${
                            vaga.status === 'aberta' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {vaga.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                          {vaga.cliente_nome && <span>🏢 {vaga.cliente_nome}</span>}
                          <span>📊 {vaga.senioridade}</span>
                          {(vaga.stack_tecnologica || []).length > 0 && (
                            <span>🔧 {(vaga.stack_tecnologica || []).slice(0, 3).join(', ')}{(vaga.stack_tecnologica || []).length > 3 ? '...' : ''}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-orange-500 opacity-0 group-hover:opacity-100 transition-opacity text-sm ml-2">
                        Selecionar →
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <span className="text-4xl block mb-2">📋</span>
                <p className="text-gray-500 text-sm">Nenhuma vaga aberta encontrada</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* ============================================ */}
          {/* ETAPA 2: VAGA SELECIONADA + FILTROS */}
          {/* ============================================ */}
          {renderVagaSelecionada()}

          {/* Filtros editáveis */}
          <div className="bg-white rounded-lg p-4 border space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-gray-700 text-sm">Filtros de busca</h4>
              <button
                onClick={() => setMostrarFiltrosAvancados(!mostrarFiltrosAvancados)}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                {mostrarFiltrosAvancados ? '▲ Menos filtros' : '▼ Mais filtros'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Títulos/Cargos */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Cargos (separados por vírgula)</label>
                <input
                  type="text"
                  value={filtroTitulos}
                  onChange={e => setFiltroTitulos(e.target.value)}
                  placeholder="Ex: Consultor SAP, SAP FI/CO"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Keywords/Skills */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Skills / Palavras-chave</label>
                <input
                  type="text"
                  value={filtroKeywords}
                  onChange={e => setFiltroKeywords(e.target.value)}
                  placeholder="Ex: SAP S/4HANA ABAP"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {/* Senioridade */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Senioridade</label>
                <select
                  value={filtroSenioridade}
                  onChange={e => setFiltroSenioridade(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                >
                  {SENIORITY_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Estado */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Estado (UF)</label>
                <select
                  value={filtroEstado}
                  onChange={e => setFiltroEstado(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Todo Brasil</option>
                  {UF_OPTIONS.filter(u => u).map(uf => (
                    <option key={uf} value={uf}>{uf}</option>
                  ))}
                </select>
              </div>

              {/* Resultados por página */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Por página</label>
                <select
                  value={perPage}
                  onChange={e => setPerPage(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            {/* Filtros avançados */}
            {mostrarFiltrosAvancados && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Tamanho da empresa</label>
                  <select
                    value={filtroTamanhoEmpresa}
                    onChange={e => setFiltroTamanhoEmpresa(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  >
                    {EMPLOYEE_RANGES.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Botão buscar */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => handleBuscar(1)}
                disabled={loading || (!filtroTitulos && !filtroKeywords)}
                className="px-6 py-2.5 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                    Buscando...
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-magnifying-glass"></i>
                    Buscar Candidatos no Apollo
                  </>
                )}
              </button>

              {jaBuscou && (
                <button
                  onClick={() => {
                    limparResultados();
                    setJaBuscou(false);
                  }}
                  className="px-4 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50"
                >
                  Limpar
                </button>
              )}

              <span className="text-xs text-green-600 flex items-center gap-1 ml-auto">
                <i className="fa-solid fa-circle-check"></i>
                Busca gratuita — 0 créditos
              </span>
            </div>
          </div>

          {/* ============================================ */}
          {/* ETAPA 3: RESULTADOS */}
          {/* ============================================ */}

          {/* Erro */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <span className="text-red-500 text-xl">⚠️</span>
              <div>
                <p className="font-medium text-red-800">Erro na busca</p>
                <p className="text-sm text-red-600 mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Resultados */}
          {jaBuscou && !error && (
            <>
              {/* Header de resultados */}
              {results.length > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-gray-700">
                      Resultados Apollo
                    </h4>
                    <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full">
                      {pagination.total_entries.toLocaleString('pt-BR')} encontrados
                    </span>
                    {results.filter(r => r.ja_importado).length > 0 && (
                      <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">
                        {results.filter(r => r.ja_importado).length} já importados
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">
                    Clique em "Abrir LinkedIn" e use a extensão Chrome para importar
                  </p>
                </div>
              )}

              {/* Lista de resultados */}
              {loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full mx-auto"></div>
                  <p className="text-gray-500 mt-3">Buscando candidatos no Apollo...</p>
                  <p className="text-xs text-gray-400 mt-1">Isto pode levar alguns segundos</p>
                </div>
              ) : results.length > 0 ? (
                <div className="space-y-2">
                  {results.map(renderResultCard)}
                </div>
              ) : (
                <div className="text-center py-12 bg-white rounded-xl border">
                  <span className="text-5xl block mb-4">🔍</span>
                  <p className="text-gray-600 font-medium">Nenhum candidato encontrado</p>
                  <p className="text-sm text-gray-400 mt-2">
                    Tente ajustar os filtros: termos mais genéricos, remover senioridade ou expandir localização
                  </p>
                </div>
              )}

              {/* Paginação */}
              {renderPaginacao()}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default ApolloTalentTab;
