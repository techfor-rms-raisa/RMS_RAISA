/**
 * LinkedInImportPanel.tsx - Painel de Integração LinkedIn (V3 - Integrado com Pessoas)
 * 
 * Este componente mostra pessoas importadas do LinkedIn diretamente da tabela PESSOAS
 * Não usa tabela separada - tudo integrado ao Banco de Talentos
 * 
 * Funcionalidades:
 * - Ver estatísticas de importação
 * - Listar pessoas importadas do LinkedIn
 * - Filtrar por termo, senioridade
 * - Comparar origens (LinkedIn vs CV vs Manual)
 * - Instruções de uso da extensão Chrome
 * 
 * 🆕 v57.0: Controle de acesso por permissão
 * 
 * Versão: 3.1
 * Data: 11/01/2026
 */

import React, { useState, useEffect } from 'react';
import { useLinkedInPessoas, PessoaLinkedIn } from '@/hooks/supabase/useLinkedInPessoas';
import { useAuth } from '../../contexts/AuthContext';
import { podeUsarLinkedIn } from '../../utils/permissions';

interface LinkedInImportPanelProps {
  userId?: number;
}

const LinkedInImportPanel: React.FC<LinkedInImportPanelProps> = ({ userId }) => {
  // 🆕 v57.0: Verificar permissão de acesso
  const { user } = useAuth();
  
  // Se não tem permissão, mostrar mensagem de acesso restrito
  if (!user || !podeUsarLinkedIn(user.tipo_usuario)) {
    return (
      <div className="p-8 text-center bg-white rounded-lg shadow-md">
        <div className="text-6xl mb-4">🔒</div>
        <h2 className="text-xl font-bold text-gray-700 mb-2">Acesso Restrito</h2>
        <p className="text-gray-500 mb-4">
          Você não tem permissão para acessar a importação do LinkedIn.
        </p>
        <p className="text-sm text-gray-400">
          Esta funcionalidade está disponível para: Administrador, Gestão de R&S e Analista de R&S.
        </p>
      </div>
    );
  }

  const {
    loading,
    pessoas,
    buscarPessoasLinkedIn,
    buscarEstatisticas,
    buscarEstatisticasLinkedIn,
    buscarPessoas
  } = useLinkedInPessoas();

  const [tab, setTab] = useState<'linkedin' | 'todas' | 'instrucoes'>('linkedin');
  const [filtroTermo, setFiltroTermo] = useState('');
  const [filtroSenioridade, setFiltroSenioridade] = useState('');
  const [filtroOrigem, setFiltroOrigem] = useState('');
  const [statsLinkedIn, setStatsLinkedIn] = useState({
    totalImportados: 0,
    importadosHoje: 0,
    importadosSemana: 0,
    importadosMes: 0
  });
  const [statsGeral, setStatsGeral] = useState<any[]>([]);

  // Carregar dados iniciais
  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    const [linkedin, geral] = await Promise.all([
      buscarEstatisticasLinkedIn(),
      buscarEstatisticas()
    ]);
    setStatsLinkedIn(linkedin);
    setStatsGeral(geral);
    
    // Carregar pessoas do LinkedIn por padrão
    await buscarPessoasLinkedIn({ limite: 50 });
  };

  // Aplicar filtros
  const aplicarFiltros = async () => {
    if (tab === 'linkedin') {
      await buscarPessoasLinkedIn({
        termo: filtroTermo || undefined,
        senioridade: filtroSenioridade || undefined,
        limite: 50
      });
    } else if (tab === 'todas') {
      await buscarPessoas({
        origem: filtroOrigem || undefined,
        termo: filtroTermo || undefined,
        senioridade: filtroSenioridade || undefined,
        limite: 50
      });
    }
  };

  // Mudar tab
  const handleTabChange = async (novaTab: 'linkedin' | 'todas' | 'instrucoes') => {
    setTab(novaTab);
    setFiltroTermo('');
    setFiltroSenioridade('');
    setFiltroOrigem('');
    
    if (novaTab === 'linkedin') {
      await buscarPessoasLinkedIn({ limite: 50 });
    } else if (novaTab === 'todas') {
      await buscarPessoas({ limite: 50 });
    }
  };

  // Formatar data
  const formatarData = (data: string) => {
    if (!data) return '-';
    return new Date(data).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Badge de origem
  const badgeOrigem = (origem: string) => {
    const cores: Record<string, string> = {
      'linkedin': 'bg-blue-100 text-blue-700 border-blue-300',
      'importacao_cv': 'bg-green-100 text-green-700 border-green-300',
      'manual': 'bg-gray-100 text-gray-700 border-gray-300',
      'indicacao': 'bg-purple-100 text-purple-700 border-purple-300'
    };
    
    const nomes: Record<string, string> = {
      'linkedin': '🔗 LinkedIn',
      'importacao_cv': '📄 CV/IA',
      'manual': '✏️ Manual',
      'indicacao': '👥 Indicação'
    };

    return (
      <span className={`px-2 py-1 text-xs rounded-full border ${cores[origem] || cores['manual']}`}>
        {nomes[origem] || origem}
      </span>
    );
  };

  // Render card de pessoa
  const renderPessoaCard = (pessoa: PessoaLinkedIn) => (
    <div key={pessoa.id} className="p-4 bg-white rounded-lg border hover:shadow-md transition-shadow">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
          {pessoa.nome?.charAt(0) || '?'}
        </div>
        
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium text-gray-800">{pessoa.nome}</h4>
            {pessoa.linkedin_url && (
              <a 
                href={pessoa.linkedin_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 text-sm"
                title="Ver no LinkedIn"
              >
                🔗 LinkedIn
              </a>
            )}
            {badgeOrigem(pessoa.origem)}
          </div>
          
          <p className="text-sm text-gray-500 mt-1">{pessoa.titulo_profissional || 'Sem título'}</p>
          
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-400 flex-wrap">
            {pessoa.email && <span>✉️ {pessoa.email}</span>}
            {pessoa.cidade && <span>📍 {pessoa.cidade}{pessoa.estado ? `, ${pessoa.estado}` : ''}</span>}
            {pessoa.senioridade && (
              <span className={`px-2 py-0.5 rounded-full ${
                pessoa.senioridade === 'Senior' || pessoa.senioridade === 'Especialista'
                  ? 'bg-purple-100 text-purple-700' 
                  : pessoa.senioridade === 'Pleno' 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'bg-gray-100 text-gray-600'
              }`}>
                {pessoa.senioridade}
              </span>
            )}
          </div>

          {/* Skills */}
          {pessoa.skills_lista && pessoa.skills_lista.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {pessoa.skills_lista.slice(0, 6).map((skill, idx) => (
                <span key={idx} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                  {skill}
                </span>
              ))}
              {pessoa.total_skills && pessoa.total_skills > 6 && (
                <span className="text-xs text-gray-400">+{pessoa.total_skills - 6}</span>
              )}
            </div>
          )}

          {/* Métricas */}
          <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
            <span title="Experiências">💼 {pessoa.total_experiencias || 0} exp</span>
            <span title="Formações">🎓 {pessoa.total_formacoes || 0} form</span>
            <span title="Skills">🛠️ {pessoa.total_skills || 0} skills</span>
            <span title="Importado em">📅 {formatarData(pessoa.criado_em)}</span>
          </div>
        </div>
      </div>
    </div>
  );

  // ============================================
  // RENDER PRINCIPAL
  // ============================================

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            🔗 Integração LinkedIn
          </h1>
          <p className="text-gray-600 mt-1">
            Visualize e gerencie candidatos importados do LinkedIn
          </p>
        </div>
        <button
          onClick={carregarDados}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          🔄 Atualizar
        </button>
      </div>

      {/* Cards de Estatísticas LinkedIn */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-blue-500">
          <p className="text-sm text-gray-500">Total Importados</p>
          <p className="text-2xl font-bold text-gray-800">{statsLinkedIn.totalImportados}</p>
          <p className="text-xs text-blue-600 mt-1">do LinkedIn</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-green-500">
          <p className="text-sm text-gray-500">Importados Hoje</p>
          <p className="text-2xl font-bold text-gray-800">{statsLinkedIn.importadosHoje}</p>
          <p className="text-xs text-green-600 mt-1">últimas 24h</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-purple-500">
          <p className="text-sm text-gray-500">Esta Semana</p>
          <p className="text-2xl font-bold text-gray-800">{statsLinkedIn.importadosSemana}</p>
          <p className="text-xs text-purple-600 mt-1">últimos 7 dias</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-orange-500">
          <p className="text-sm text-gray-500">Este Mês</p>
          <p className="text-2xl font-bold text-gray-800">{statsLinkedIn.importadosMes}</p>
          <p className="text-xs text-orange-600 mt-1">últimos 30 dias</p>
        </div>
      </div>

      {/* Estatísticas por Origem */}
      {statsGeral.length > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-gray-700 mb-3">📊 Distribuição por Origem</h3>
          <div className="flex flex-wrap gap-4">
            {statsGeral.map(stat => (
              <div key={stat.origem} className="flex items-center gap-2">
                {badgeOrigem(stat.origem)}
                <span className="font-bold text-gray-800">{stat.total}</span>
                <span className="text-xs text-gray-400">({stat.ultimos_7_dias} esta semana)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {[
          { id: 'linkedin', label: '🔗 Do LinkedIn', count: statsLinkedIn.totalImportados },
          { id: 'todas', label: '👥 Todas Origens', count: statsGeral.reduce((a, b) => a + b.total, 0) },
          { id: 'instrucoes', label: '📖 Como Usar', count: null }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => handleTabChange(t.id as any)}
            className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap relative ${
              tab === t.id
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {t.label}
            {t.count !== null && (
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-gray-200 text-gray-700">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab LinkedIn */}
      {tab === 'linkedin' && (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="bg-white rounded-lg p-4 flex items-center gap-4 flex-wrap">
            <input
              type="text"
              placeholder="Buscar por nome ou email..."
              value={filtroTermo}
              onChange={e => setFiltroTermo(e.target.value)}
              className="flex-1 min-w-48 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={filtroSenioridade}
              onChange={e => setFiltroSenioridade(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas Senioridades</option>
              <option value="Junior">Junior</option>
              <option value="Pleno">Pleno</option>
              <option value="Senior">Senior</option>
              <option value="Especialista">Especialista</option>
            </select>
            <button
              onClick={aplicarFiltros}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              🔍 Filtrar
            </button>
          </div>

          {/* Lista */}
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
              <p className="text-gray-500 mt-2">Carregando...</p>
            </div>
          ) : pessoas.length > 0 ? (
            <div className="space-y-3">
              {pessoas.map(renderPessoaCard)}
            </div>
          ) : (
            <div className="text-center py-12 bg-white rounded-xl">
              <span className="text-5xl block mb-4">🔗</span>
              <p className="text-gray-600 font-medium">Nenhuma pessoa importada do LinkedIn ainda</p>
              <p className="text-sm text-gray-400 mt-2">
                Use a extensão Chrome para importar perfis do LinkedIn
              </p>
              <button
                onClick={() => setTab('instrucoes')}
                className="mt-4 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm hover:bg-blue-200"
              >
                📖 Ver instruções
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab Todas Origens */}
      {tab === 'todas' && (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="bg-white rounded-lg p-4 flex items-center gap-4 flex-wrap">
            <select
              value={filtroOrigem}
              onChange={e => setFiltroOrigem(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas Origens</option>
              <option value="linkedin">🔗 LinkedIn</option>
              <option value="importacao_cv">📄 CV/IA</option>
              <option value="manual">✏️ Manual</option>
              <option value="indicacao">👥 Indicação</option>
            </select>
            <input
              type="text"
              placeholder="Buscar por nome ou email..."
              value={filtroTermo}
              onChange={e => setFiltroTermo(e.target.value)}
              className="flex-1 min-w-48 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={filtroSenioridade}
              onChange={e => setFiltroSenioridade(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas Senioridades</option>
              <option value="Junior">Junior</option>
              <option value="Pleno">Pleno</option>
              <option value="Senior">Senior</option>
              <option value="Especialista">Especialista</option>
            </select>
            <button
              onClick={aplicarFiltros}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              🔍 Filtrar
            </button>
          </div>

          {/* Lista */}
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
              <p className="text-gray-500 mt-2">Carregando...</p>
            </div>
          ) : pessoas.length > 0 ? (
            <div className="space-y-3">
              {pessoas.map(renderPessoaCard)}
            </div>
          ) : (
            <div className="text-center py-12 bg-white rounded-xl">
              <span className="text-5xl block mb-4">👥</span>
              <p className="text-gray-600 font-medium">Nenhuma pessoa encontrada</p>
              <p className="text-sm text-gray-400 mt-2">
                Tente ajustar os filtros ou importe novos candidatos
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tab Instruções */}
      {tab === 'instrucoes' && (
        <div className="bg-white rounded-xl p-6 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📖</span>
            <div>
              <h3 className="font-bold text-gray-800 text-lg">Como Importar do LinkedIn</h3>
              <p className="text-sm text-gray-500">Use a extensão Chrome para importar com 1 clique</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Passo 1 */}
            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold">1</span>
                <h4 className="font-semibold text-gray-800">Instale a Extensão</h4>
              </div>
              <p className="text-sm text-gray-600">
                Baixe e instale a extensão "RMS-RAISA LinkedIn Importer" no Google Chrome.
                Siga o guia de instalação fornecido pelo time.
              </p>
            </div>

            {/* Passo 2 */}
            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold">2</span>
                <h4 className="font-semibold text-gray-800">Configure a URL</h4>
              </div>
              <p className="text-sm text-gray-600">
                Clique no ícone da extensão e configure a URL do sistema:
              </p>
              <code className="block mt-2 p-2 bg-gray-100 rounded text-sm text-gray-700">
                https://www.techfortirms.online
              </code>
            </div>

            {/* Passo 3 */}
            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold">3</span>
                <h4 className="font-semibold text-gray-800">Acesse um Perfil</h4>
              </div>
              <p className="text-sm text-gray-600">
                No LinkedIn, navegue até o perfil do candidato que deseja importar.
                A URL deve ser no formato: <code className="bg-gray-100 px-1 rounded">linkedin.com/in/nome</code>
              </p>
            </div>

            {/* Passo 4 */}
            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-8 h-8 bg-green-100 text-green-700 rounded-full flex items-center justify-center font-bold">4</span>
                <h4 className="font-semibold text-gray-800">Clique em Importar</h4>
              </div>
              <p className="text-sm text-gray-600">
                Clique no botão <span className="font-semibold text-blue-600">"Importar para RMS-RAISA"</span> que aparece no perfil.
                Os dados serão salvos automaticamente no Banco de Talentos!
              </p>
            </div>
          </div>

          {/* Dados Importados */}
          <div className="bg-blue-50 rounded-lg p-4">
            <h4 className="font-semibold text-blue-800 mb-2">📊 Dados Importados Automaticamente:</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-blue-700">
              <span>✓ Nome completo</span>
              <span>✓ Título/Headline</span>
              <span>✓ Localização</span>
              <span>✓ URL LinkedIn</span>
              <span>✓ Email e Telefone*</span>
              <span>✓ Experiências</span>
              <span>✓ Formação</span>
              <span>✓ Skills</span>
            </div>
            <p className="text-xs text-blue-600 mt-2">* Se disponíveis no perfil</p>
          </div>

          {/* Vantagens */}
          <div className="bg-green-50 rounded-lg p-4">
            <h4 className="font-semibold text-green-800 mb-2">✅ Vantagens:</h4>
            <ul className="text-sm text-green-700 space-y-1">
              <li>• <strong>Integrado:</strong> Salva direto na tabela de Pessoas (Banco de Talentos)</li>
              <li>• <strong>Sem duplicatas:</strong> Atualiza se o perfil já existe</li>
              <li>• <strong>Rastreável:</strong> Origem "linkedin" para filtrar e gerenciar</li>
              <li>• <strong>Rápido:</strong> 3 segundos por candidato vs 5-10 minutos manual</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default LinkedInImportPanel;
