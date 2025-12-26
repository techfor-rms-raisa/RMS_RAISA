/**
 * LinkedInImportPanel.tsx - Painel de Integração LinkedIn
 * 
 * Funcionalidades:
 * - Importar perfis manualmente
 * - Colar JSON do LinkedIn
 * - Ver matches com vagas
 * - Converter em candidatura
 * 
 * Versão: 1.0
 * Data: 26/12/2024
 */

import React, { useState, useEffect } from 'react';
import { useLinkedInIntegration, LinkedInProfile, LinkedInMatch } from '@/hooks/Supabase/useLinkedInIntegration';

interface LinkedInImportPanelProps {
  vagaId?: number;
  userId: number;
  onCandidaturaCreated?: (candidaturaId: number) => void;
}

const LinkedInImportPanel: React.FC<LinkedInImportPanelProps> = ({
  vagaId,
  userId,
  onCandidaturaCreated
}) => {
  const {
    loading,
    profiles,
    matches,
    importarPerfil,
    importarDeJSON,
    buscarPerfis,
    buscarMatches,
    aprovarMatch,
    descartarMatch,
    buscarEstatisticas
  } = useLinkedInIntegration();

  const [tab, setTab] = useState<'importar' | 'perfis' | 'matches'>('importar');
  const [jsonInput, setJsonInput] = useState('');
  const [manualForm, setManualForm] = useState({
    nome_completo: '',
    headline: '',
    linkedin_url: '',
    email: '',
    telefone: '',
    localizacao: '',
    skills: ''
  });
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);
  const [estatisticas, setEstatisticas] = useState<any>(null);
  const [filtroScore, setFiltroScore] = useState(50);

  useEffect(() => {
    carregarDados();
  }, [vagaId]);

  const carregarDados = async () => {
    const [stats] = await Promise.all([
      buscarEstatisticas(),
      buscarPerfis({ limite: 20 }),
      buscarMatches({ vagaId, scoreMinimo: filtroScore, limite: 30 })
    ]);
    setEstatisticas(stats);
  };

  // ============================================
  // IMPORTAR DE JSON
  // ============================================

  const handleImportarJSON = async () => {
    if (!jsonInput.trim()) {
      setMensagem({ tipo: 'erro', texto: 'Cole o JSON do perfil LinkedIn' });
      return;
    }

    try {
      const jsonData = JSON.parse(jsonInput);
      const resultado = await importarDeJSON(jsonData, userId);
      
      if (resultado.sucesso) {
        setMensagem({ tipo: 'sucesso', texto: resultado.mensagem });
        setJsonInput('');
        carregarDados();
      } else {
        setMensagem({ tipo: 'erro', texto: resultado.mensagem });
      }
    } catch (err) {
      setMensagem({ tipo: 'erro', texto: 'JSON inválido. Verifique o formato.' });
    }
  };

  // ============================================
  // IMPORTAR MANUAL
  // ============================================

  const handleImportarManual = async () => {
    if (!manualForm.nome_completo.trim()) {
      setMensagem({ tipo: 'erro', texto: 'Nome completo é obrigatório' });
      return;
    }

    const perfil: Partial<LinkedInProfile> = {
      nome_completo: manualForm.nome_completo,
      headline: manualForm.headline,
      linkedin_url: manualForm.linkedin_url,
      email: manualForm.email,
      telefone: manualForm.telefone,
      localizacao: manualForm.localizacao,
      skills: manualForm.skills.split(',').map(s => s.trim()).filter(s => s)
    };

    const resultado = await importarPerfil(perfil, userId, true);

    if (resultado.sucesso) {
      setMensagem({ tipo: 'sucesso', texto: resultado.mensagem });
      setManualForm({
        nome_completo: '',
        headline: '',
        linkedin_url: '',
        email: '',
        telefone: '',
        localizacao: '',
        skills: ''
      });
      carregarDados();
    } else {
      setMensagem({ tipo: 'erro', texto: resultado.mensagem });
    }
  };

  // ============================================
  // APROVAR MATCH
  // ============================================

  const handleAprovarMatch = async (matchId: number) => {
    const resultado = await aprovarMatch(matchId, userId);
    
    if (resultado.sucesso) {
      setMensagem({ tipo: 'sucesso', texto: resultado.mensagem });
      carregarDados();
      if (resultado.candidaturaId && onCandidaturaCreated) {
        onCandidaturaCreated(resultado.candidaturaId);
      }
    } else {
      setMensagem({ tipo: 'erro', texto: resultado.mensagem });
    }
  };

  // ============================================
  // RENDER CARD PERFIL
  // ============================================

  const renderPerfilCard = (perfil: LinkedInProfile) => (
    <div key={perfil.id} className="p-4 bg-white rounded-lg border hover:shadow-md transition-shadow">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-lg">
          {perfil.nome_completo.charAt(0)}
        </div>
        
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-gray-800 truncate">{perfil.nome_completo}</h4>
            {perfil.linkedin_url && (
              <a 
                href={perfil.linkedin_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800"
              >
                🔗
              </a>
            )}
          </div>
          <p className="text-sm text-gray-500 truncate">{perfil.headline || 'Sem título'}</p>
          
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
            {perfil.localizacao && <span>📍 {perfil.localizacao}</span>}
            {perfil.anos_experiencia && <span>⏱️ {perfil.anos_experiencia} anos</span>}
            {perfil.senioridade_estimada && (
              <span className={`px-2 py-0.5 rounded-full ${
                perfil.senioridade_estimada === 'senior' ? 'bg-purple-100 text-purple-700' :
                perfil.senioridade_estimada === 'pleno' ? 'bg-blue-100 text-blue-700' :
                'bg-gray-100 text-gray-600'
              }`}>
                {perfil.senioridade_estimada}
              </span>
            )}
          </div>

          {/* Skills */}
          {perfil.skills && perfil.skills.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {perfil.skills.slice(0, 5).map((skill, idx) => (
                <span key={idx} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                  {skill}
                </span>
              ))}
              {perfil.skills.length > 5 && (
                <span className="text-xs text-gray-400">+{perfil.skills.length - 5}</span>
              )}
            </div>
          )}
        </div>

        {/* Status */}
        <div className="text-right">
          <span className={`px-2 py-1 text-xs rounded-full ${
            perfil.status === 'vinculado' ? 'bg-green-100 text-green-700' :
            perfil.status === 'descartado' ? 'bg-red-100 text-red-700' :
            'bg-yellow-100 text-yellow-700'
          }`}>
            {perfil.status || 'importado'}
          </span>
        </div>
      </div>
    </div>
  );

  // ============================================
  // RENDER MATCH CARD
  // ============================================

  const renderMatchCard = (match: LinkedInMatch) => (
    <div key={match.match_id} className="p-4 bg-white rounded-lg border hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        {/* Info do Perfil */}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-gray-800">{match.nome_completo}</h4>
            {match.linkedin_url && (
              <a 
                href={match.linkedin_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                LinkedIn ↗
              </a>
            )}
          </div>
          <p className="text-sm text-gray-500">{match.headline}</p>
          
          <div className="mt-2 text-xs text-gray-500">
            <span className="inline-block mr-3">🏢 {match.ultima_empresa || 'N/A'}</span>
            <span className="inline-block">💼 {match.ultimo_cargo || 'N/A'}</span>
          </div>

          {/* Skills Match */}
          {match.skills_match && (
            <div className="mt-3 space-y-1">
              {match.skills_match.match?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-xs text-green-600">✓ Match:</span>
                  {match.skills_match.match.slice(0, 4).map((s, i) => (
                    <span key={i} className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                      {s}
                    </span>
                  ))}
                </div>
              )}
              {match.skills_match.faltam?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-xs text-orange-600">⚠ Faltam:</span>
                  {match.skills_match.faltam.slice(0, 3).map((s, i) => (
                    <span key={i} className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs rounded">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Score e Ações */}
        <div className="text-right ml-4">
          {/* Score */}
          <div className={`text-2xl font-bold ${
            match.score_match >= 70 ? 'text-green-600' :
            match.score_match >= 50 ? 'text-yellow-600' :
            'text-gray-500'
          }`}>
            {match.score_match.toFixed(0)}%
          </div>
          <p className="text-xs text-gray-400 mb-3">Match Score</p>

          {/* Botões de Ação */}
          {match.status === 'sugerido' && (
            <div className="flex gap-2">
              <button
                onClick={() => handleAprovarMatch(match.match_id)}
                disabled={loading}
                className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
              >
                ✓ Aprovar
              </button>
              <button
                onClick={() => descartarMatch(match.match_id)}
                disabled={loading}
                className="px-3 py-1.5 bg-gray-200 text-gray-600 text-sm rounded hover:bg-gray-300 disabled:opacity-50"
              >
                ✕
              </button>
            </div>
          )}
          {match.status === 'enviado' && (
            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
              ✓ Candidatura Criada
            </span>
          )}
        </div>
      </div>

      {/* Vaga Info */}
      <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs">
        <span className="text-gray-500">
          Vaga: <strong className="text-gray-700">{match.vaga_titulo}</strong>
        </span>
        <span className="text-gray-400">{match.cliente_nome}</span>
      </div>
    </div>
  );

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">🔗 Integração LinkedIn</h1>
          <p className="text-sm text-gray-500 mt-1">
            Importe candidatos do LinkedIn e encontre matches com vagas
          </p>
        </div>
        <button
          onClick={carregarDados}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? <span className="animate-spin">⚙️</span> : <span>🔄</span>}
          Atualizar
        </button>
      </div>

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-blue-500">
          <p className="text-sm text-gray-500">Perfis Importados</p>
          <p className="text-2xl font-bold text-gray-800">{estatisticas?.totalPerfis || 0}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-purple-500">
          <p className="text-sm text-gray-500">Matches Gerados</p>
          <p className="text-2xl font-bold text-gray-800">{estatisticas?.totalMatches || 0}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-green-500">
          <p className="text-sm text-gray-500">Candidaturas Criadas</p>
          <p className="text-2xl font-bold text-gray-800">{estatisticas?.matchesAprovados || 0}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-orange-500">
          <p className="text-sm text-gray-500">Score Médio</p>
          <p className="text-2xl font-bold text-gray-800">{estatisticas?.mediaScore || 0}%</p>
        </div>
      </div>

      {/* Mensagem de Feedback */}
      {mensagem && (
        <div className={`p-4 rounded-lg ${
          mensagem.tipo === 'sucesso' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
        }`}>
          <p>{mensagem.texto}</p>
          <button 
            onClick={() => setMensagem(null)}
            className="mt-2 text-sm underline"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {[
          { id: 'importar', label: '📥 Importar', count: null },
          { id: 'perfis', label: '👤 Perfis', count: profiles.length },
          { id: 'matches', label: '🎯 Matches', count: matches.length }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              tab === t.id
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {t.count !== null && t.count > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Importar */}
      {tab === 'importar' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Importar por JSON */}
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h3 className="font-bold text-gray-800 mb-4">📋 Importar via JSON</h3>
            <p className="text-sm text-gray-500 mb-4">
              Cole o JSON do perfil LinkedIn (de extensões Chrome ou API)
            </p>
            
            <textarea
              value={jsonInput}
              onChange={e => setJsonInput(e.target.value)}
              placeholder='{"fullName": "João Silva", "headline": "Desenvolvedor Senior", ...}'
              className="w-full h-48 p-3 border rounded-lg text-sm font-mono resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            
            <button
              onClick={handleImportarJSON}
              disabled={loading || !jsonInput.trim()}
              className="mt-4 w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? 'Importando...' : '📥 Importar JSON'}
            </button>
          </div>

          {/* Importar Manual */}
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h3 className="font-bold text-gray-800 mb-4">✏️ Cadastro Manual</h3>
            <p className="text-sm text-gray-500 mb-4">
              Preencha os dados do candidato manualmente
            </p>
            
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Nome completo *"
                value={manualForm.nome_completo}
                onChange={e => setManualForm(f => ({ ...f, nome_completo: e.target.value }))}
                className="w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="Título/Headline (ex: Desenvolvedor Senior)"
                value={manualForm.headline}
                onChange={e => setManualForm(f => ({ ...f, headline: e.target.value }))}
                className="w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="url"
                placeholder="URL do LinkedIn"
                value={manualForm.linkedin_url}
                onChange={e => setManualForm(f => ({ ...f, linkedin_url: e.target.value }))}
                className="w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="email"
                  placeholder="Email"
                  value={manualForm.email}
                  onChange={e => setManualForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="tel"
                  placeholder="Telefone"
                  value={manualForm.telefone}
                  onChange={e => setManualForm(f => ({ ...f, telefone: e.target.value }))}
                  className="w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <input
                type="text"
                placeholder="Localização"
                value={manualForm.localizacao}
                onChange={e => setManualForm(f => ({ ...f, localizacao: e.target.value }))}
                className="w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="Skills (separadas por vírgula: Java, Spring, AWS)"
                value={manualForm.skills}
                onChange={e => setManualForm(f => ({ ...f, skills: e.target.value }))}
                className="w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <button
              onClick={handleImportarManual}
              disabled={loading || !manualForm.nome_completo.trim()}
              className="mt-4 w-full py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? 'Salvando...' : '✓ Cadastrar Perfil'}
            </button>
          </div>
        </div>
      )}

      {/* Tab Perfis */}
      {tab === 'perfis' && (
        <div className="space-y-4">
          {profiles.length > 0 ? (
            profiles.map(renderPerfilCard)
          ) : (
            <div className="text-center py-12 bg-white rounded-xl">
              <span className="text-4xl">👤</span>
              <p className="text-gray-500 mt-2">Nenhum perfil importado</p>
              <p className="text-sm text-gray-400">Importe perfis do LinkedIn para começar</p>
            </div>
          )}
        </div>
      )}

      {/* Tab Matches */}
      {tab === 'matches' && (
        <div className="space-y-4">
          {/* Filtro de Score */}
          <div className="bg-white rounded-lg p-4 flex items-center gap-4">
            <span className="text-sm text-gray-600">Score mínimo:</span>
            <input
              type="range"
              min="0"
              max="90"
              step="10"
              value={filtroScore}
              onChange={e => setFiltroScore(Number(e.target.value))}
              className="flex-1"
            />
            <span className="text-sm font-medium text-gray-800 w-12">{filtroScore}%</span>
            <button
              onClick={() => buscarMatches({ vagaId, scoreMinimo: filtroScore, limite: 30 })}
              className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm hover:bg-blue-200"
            >
              Filtrar
            </button>
          </div>

          {matches.length > 0 ? (
            matches.map(renderMatchCard)
          ) : (
            <div className="text-center py-12 bg-white rounded-xl">
              <span className="text-4xl">🎯</span>
              <p className="text-gray-500 mt-2">Nenhum match encontrado</p>
              <p className="text-sm text-gray-400">Importe perfis para gerar matches com vagas</p>
            </div>
          )}
        </div>
      )}

      {/* Dica */}
      <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-800">
        <strong>💡 Dica:</strong> Use extensões como "LinkedIn Profile Scraper" para exportar perfis em JSON 
        e cole aqui para importação rápida. O sistema calculará automaticamente o match com todas as vagas abertas!
      </div>
    </div>
  );
};

export default LinkedInImportPanel;
