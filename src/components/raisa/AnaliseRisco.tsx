/**
 * AnaliseRisco.tsx - RMS RAISA v3.0
 * Componente de Análise de Currículo com IA
 * 
 * REFATORADO: 06/01/2026
 * - Upload de PDF/DOC (substitui colar texto)
 * - Opção de salvar candidato no banco de talentos
 * - Alertas buscam dados reais de ia_recomendacoes_candidato
 * - Métricas calculadas com resultado_real
 */

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/config/supabase';
import { 
  Upload, FileText, Brain, Loader2, CheckCircle, XCircle,
  AlertTriangle, Target, RefreshCw, UserPlus, Download,
  TrendingUp, TrendingDown, AlertCircle, ChevronRight,
  File, Trash2, Eye, Save, Database, BarChart3,
  Users, Clock, Award, ThumbsUp, ThumbsDown
} from 'lucide-react';

// ============================================
// TIPOS
// ============================================

interface AnaliseTriagem {
  sucesso: boolean;
  score_geral: number;
  nivel_risco: 'Baixo' | 'Médio' | 'Alto' | 'Crítico';
  fatores_risco: Array<{
    tipo: string;
    nivel: string;
    descricao: string;
    evidencia?: string;
  }>;
  pontos_fortes: string[];
  pontos_fracos: string[];
  skills_detectadas: string[];
  experiencia_anos: number;
  senioridade_estimada: string;
  areas_atuacao: string[];
  recomendacao: 'banco_talentos' | 'analisar_mais' | 'descartar';
  justificativa: string;
}

interface CandidaturaRisco {
  id: number;
  candidatura_id: number;
  candidato_nome: string;
  vaga_titulo: string;
  risco_reprovacao: number;
  nivel_risco: string;
  recomendacao: string;
  criado_em: string;
}

interface MetricasIA {
  total_analises: number;
  com_resultado: number;
  predicoes_corretas: number;
  taxa_acerto: number;
  por_recomendacao: {
    aprovar: { total: number; acertos: number };
    entrevistar: { total: number; acertos: number };
    revisar: { total: number; acertos: number };
    rejeitar: { total: number; acertos: number };
  };
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const AnaliseRisco: React.FC = () => {
  // Estados gerais
  const [abaAtiva, setAbaAtiva] = useState<'triagem' | 'alertas' | 'metricas'>('triagem');
  
  // Estados da aba Triagem
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [textoExtraido, setTextoExtraido] = useState<string>('');
  const [isExtraindo, setIsExtraindo] = useState(false);
  const [isAnalisando, setIsAnalisando] = useState(false);
  const [analise, setAnalise] = useState<AnaliseTriagem | null>(null);
  const [isSalvando, setIsSalvando] = useState(false);
  const [salvouBanco, setSalvouBanco] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Estados da aba Alertas
  const [alertas, setAlertas] = useState<CandidaturaRisco[]>([]);
  const [loadingAlertas, setLoadingAlertas] = useState(false);
  
  // Estados da aba Métricas
  const [metricas, setMetricas] = useState<MetricasIA | null>(null);
  const [loadingMetricas, setLoadingMetricas] = useState(false);

  // ============================================
  // CARREGAR DADOS DAS ABAS
  // ============================================

  useEffect(() => {
    if (abaAtiva === 'alertas') {
      carregarAlertas();
    } else if (abaAtiva === 'metricas') {
      carregarMetricas();
    }
  }, [abaAtiva]);

  // ============================================
  // ABA 1: TRIAGEM DE CVs
  // ============================================

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo de arquivo
    const tiposPermitidos = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (!tiposPermitidos.includes(file.type)) {
      setErro('Formato não suportado. Use PDF, DOC ou DOCX.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB
      setErro('Arquivo muito grande. Máximo 10MB.');
      return;
    }

    setArquivo(file);
    setErro(null);
    setAnalise(null);
    setSalvouBanco(false);
    
    // Extrair texto automaticamente
    await extrairTexto(file);
  };

  const extrairTexto = async (file: File) => {
    setIsExtraindo(true);
    setErro(null);

    try {
      // Converter arquivo para base64
      const base64 = await fileToBase64(file);
      
      // Chamar API para extração
      const response = await fetch('/api/gemini-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'extrair_cv',
          payload: {
            base64PDF: base64,
            textoCV: ''
          }
        })
      });

      const result = await response.json();

      if (result.success && result.data?.texto_original) {
        setTextoExtraido(result.data.texto_original);
      } else if (result.success && result.data?.dados) {
        // Se retornou dados estruturados, montar texto
        const dados = result.data.dados;
        const texto = montarTextoDeCV(dados);
        setTextoExtraido(texto);
      } else {
        throw new Error(result.error || 'Falha ao extrair texto do arquivo');
      }
    } catch (err: any) {
      console.error('Erro ao extrair texto:', err);
      setErro(`Erro ao extrair texto: ${err.message}`);
      setTextoExtraido('');
    } finally {
      setIsExtraindo(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remover prefixo data:application/pdf;base64,
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  const montarTextoDeCV = (dados: any): string => {
    let texto = '';
    if (dados.nome) texto += `Nome: ${dados.nome}\n`;
    if (dados.email) texto += `Email: ${dados.email}\n`;
    if (dados.telefone) texto += `Telefone: ${dados.telefone}\n`;
    if (dados.titulo_profissional) texto += `Cargo: ${dados.titulo_profissional}\n`;
    if (dados.senioridade) texto += `Senioridade: ${dados.senioridade}\n`;
    if (dados.resumo) texto += `\nResumo:\n${dados.resumo}\n`;
    if (dados.experiencias?.length) {
      texto += '\nExperiências:\n';
      dados.experiencias.forEach((exp: any) => {
        texto += `- ${exp.cargo} em ${exp.empresa} (${exp.periodo})\n`;
        if (exp.descricao) texto += `  ${exp.descricao}\n`;
      });
    }
    if (dados.formacoes?.length) {
      texto += '\nFormação:\n';
      dados.formacoes.forEach((f: any) => {
        texto += `- ${f.curso} - ${f.instituicao}\n`;
      });
    }
    if (dados.skills?.length) {
      texto += `\nSkills: ${dados.skills.join(', ')}\n`;
    }
    return texto;
  };

  const handleAnalisar = async () => {
    if (!textoExtraido || textoExtraido.length < 50) {
      setErro('Texto do currículo muito curto para análise.');
      return;
    }

    setIsAnalisando(true);
    setErro(null);

    try {
      const response = await fetch('/api/gemini-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'triagem_cv_generica',
          payload: {
            curriculo_texto: textoExtraido
          }
        })
      });

      const result = await response.json();

      if (result.success && result.data?.sucesso) {
        setAnalise(result.data);
      } else {
        throw new Error(result.data?.erro || result.error || 'Erro na análise');
      }
    } catch (err: any) {
      console.error('Erro na análise:', err);
      setErro(`Erro na análise: ${err.message}`);
    } finally {
      setIsAnalisando(false);
    }
  };

  const handleSalvarBancoTalentos = async () => {
    if (!analise || !textoExtraido) return;

    setIsSalvando(true);
    setErro(null);

    try {
      // Extrair dados básicos do CV
      const response = await fetch('/api/gemini-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'extrair_cv',
          payload: {
            textoCV: textoExtraido,
            base64PDF: ''
          }
        })
      });

      const result = await response.json();
      const dados = result.data?.dados || {};

      // Inserir na tabela pessoas (banco de talentos)
      const { data: pessoa, error: errorPessoa } = await supabase
        .from('pessoas')
        .insert({
          nome: dados.nome || 'Candidato (CV Importado)',
          email: dados.email || null,
          telefone: dados.telefone || null,
          titulo_profissional: dados.titulo_profissional || analise.areas_atuacao?.[0],
          senioridade: analise.senioridade_estimada,
          cv_texto_original: textoExtraido.substring(0, 50000),
          cv_resumo: analise.justificativa,
          cv_processado: true,
          cv_processado_em: new Date().toISOString(),
          cv_processado_por: 'Gemini 2.0 Flash - Triagem',
          observacoes: `Importado via Triagem de CVs em ${new Date().toLocaleDateString('pt-BR')}\n\nScore: ${analise.score_geral}%\nRecomendação IA: ${analise.recomendacao}\n${analise.justificativa}`,
          ativo: true,
          criado_em: new Date().toISOString()
        })
        .select()
        .single();

      if (errorPessoa) throw errorPessoa;

      // Se tiver skills, inserir
      if (analise.skills_detectadas?.length > 0 && pessoa) {
        const skillsToInsert = analise.skills_detectadas.slice(0, 20).map(skill => ({
          pessoa_id: pessoa.id,
          skill_nome: skill,
          nivel: 'Informado',
          criado_em: new Date().toISOString()
        }));

        await supabase.from('pessoa_skills').insert(skillsToInsert);
      }

      setSalvouBanco(true);
      
    } catch (err: any) {
      console.error('Erro ao salvar:', err);
      setErro(`Erro ao salvar no banco: ${err.message}`);
    } finally {
      setIsSalvando(false);
    }
  };

  const handleLimpar = () => {
    setArquivo(null);
    setTextoExtraido('');
    setAnalise(null);
    setSalvouBanco(false);
    setErro(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // ============================================
  // ABA 2: ALERTAS DE RISCO
  // ============================================

  const carregarAlertas = async () => {
    setLoadingAlertas(true);

    try {
      const { data, error } = await supabase
        .from('ia_recomendacoes_candidato')
        .select(`
          id,
          candidatura_id,
          risco_reprovacao,
          recomendacao,
          analise_detalhada,
          criado_em,
          candidaturas!inner(
            id,
            candidato_nome,
            status,
            vagas!inner(titulo)
          )
        `)
        .eq('tipo_recomendacao', 'analise_cv')
        .gte('risco_reprovacao', 50)
        .in('candidaturas.status', ['triagem', 'entrevista', 'enviado_cliente', 'aguardando_cliente'])
        .order('risco_reprovacao', { ascending: false })
        .limit(20);

      if (error) throw error;

      const alertasFormatados: CandidaturaRisco[] = (data || []).map((item: any) => ({
        id: item.id,
        candidatura_id: item.candidatura_id,
        candidato_nome: item.candidaturas?.candidato_nome || 'N/A',
        vaga_titulo: item.candidaturas?.vagas?.titulo || 'N/A',
        risco_reprovacao: item.risco_reprovacao || 0,
        nivel_risco: item.analise_detalhada?.nivel_risco || 'Médio',
        recomendacao: item.recomendacao || 'revisar',
        criado_em: item.criado_em
      }));

      setAlertas(alertasFormatados);
    } catch (err: any) {
      console.error('Erro ao carregar alertas:', err);
      setAlertas([]);
    } finally {
      setLoadingAlertas(false);
    }
  };

  // ============================================
  // ABA 3: MÉTRICAS DE ACURÁCIA
  // ============================================

  const carregarMetricas = async () => {
    setLoadingMetricas(true);

    try {
      // Buscar todas as análises com resultado real
      const { data, error } = await supabase
        .from('ia_recomendacoes_candidato')
        .select(`
          id,
          recomendacao,
          resultado_real,
          predicao_correta
        `)
        .eq('tipo_recomendacao', 'analise_cv')
        .not('resultado_real', 'is', null);

      if (error) throw error;

      // Calcular métricas
      const total = data?.length || 0;
      const corretas = data?.filter(d => d.predicao_correta === true).length || 0;

      // Agrupar por recomendação
      const porRecomendacao = {
        aprovar: { total: 0, acertos: 0 },
        entrevistar: { total: 0, acertos: 0 },
        revisar: { total: 0, acertos: 0 },
        rejeitar: { total: 0, acertos: 0 }
      };

      data?.forEach(item => {
        const rec = item.recomendacao as keyof typeof porRecomendacao;
        if (porRecomendacao[rec]) {
          porRecomendacao[rec].total++;
          if (item.predicao_correta) {
            porRecomendacao[rec].acertos++;
          }
        }
      });

      // Buscar total de análises (mesmo sem resultado)
      const { count: totalAnalises } = await supabase
        .from('ia_recomendacoes_candidato')
        .select('id', { count: 'exact', head: true })
        .eq('tipo_recomendacao', 'analise_cv');

      setMetricas({
        total_analises: totalAnalises || 0,
        com_resultado: total,
        predicoes_corretas: corretas,
        taxa_acerto: total > 0 ? (corretas / total) * 100 : 0,
        por_recomendacao: porRecomendacao
      });
    } catch (err: any) {
      console.error('Erro ao carregar métricas:', err);
      setMetricas(null);
    } finally {
      setLoadingMetricas(false);
    }
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="p-6 space-y-6">
      {/* Título */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-purple-100 rounded-lg">
          <Brain className="w-6 h-6 text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Análise de Currículo (AI)</h1>
          <p className="text-sm text-gray-500">Triagem inteligente de currículos com Gemini 2.0</p>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setAbaAtiva('triagem')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors flex items-center gap-2 ${
            abaAtiva === 'triagem' 
              ? 'border-purple-600 text-purple-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Upload className="w-4 h-4" />
          Triagem de CVs
        </button>
        <button
          onClick={() => setAbaAtiva('alertas')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors flex items-center gap-2 ${
            abaAtiva === 'alertas' 
              ? 'border-orange-600 text-orange-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Candidaturas em Risco
          {alertas.length > 0 && (
            <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">
              {alertas.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setAbaAtiva('metricas')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors flex items-center gap-2 ${
            abaAtiva === 'metricas' 
              ? 'border-blue-600 text-blue-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Métricas de Acurácia
        </button>
      </div>

      {/* Conteúdo das Abas */}
      {abaAtiva === 'triagem' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Lado Esquerdo: Upload e Texto */}
          <div className="space-y-4">
            {/* Card de Upload */}
            <div className="bg-white rounded-xl shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Upload className="w-5 h-5 text-purple-600" />
                Upload de Currículo
              </h2>

              {/* Área de Drop */}
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                  arquivo 
                    ? 'border-green-300 bg-green-50' 
                    : 'border-gray-300 hover:border-purple-400 hover:bg-purple-50'
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {arquivo ? (
                  <div className="flex items-center justify-center gap-3">
                    <FileText className="w-10 h-10 text-green-600" />
                    <div className="text-left">
                      <p className="font-medium text-gray-800">{arquivo.name}</p>
                      <p className="text-sm text-gray-500">
                        {(arquivo.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleLimpar(); }}
                      className="p-2 hover:bg-red-100 rounded-lg transition"
                    >
                      <Trash2 className="w-5 h-5 text-red-500" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600 font-medium">
                      Clique ou arraste um arquivo
                    </p>
                    <p className="text-sm text-gray-400 mt-1">
                      PDF, DOC ou DOCX (máx. 10MB)
                    </p>
                  </>
                )}
              </div>

              {/* Status de Extração */}
              {isExtraindo && (
                <div className="mt-4 flex items-center gap-2 text-purple-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Extraindo texto do arquivo...</span>
                </div>
              )}

              {/* Erro */}
              {erro && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{erro}</p>
                </div>
              )}
            </div>

            {/* Texto Extraído */}
            {textoExtraido && (
              <div className="bg-white rounded-xl shadow-md p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                    <Eye className="w-4 h-4 text-gray-500" />
                    Texto Extraído
                  </h3>
                  <span className="text-xs text-gray-400">
                    {textoExtraido.length} caracteres
                  </span>
                </div>
                <textarea
                  value={textoExtraido}
                  onChange={(e) => setTextoExtraido(e.target.value)}
                  className="w-full h-48 p-3 border rounded-lg text-sm font-mono bg-gray-50 resize-none"
                  placeholder="O texto extraído aparecerá aqui..."
                />

                <button
                  onClick={handleAnalisar}
                  disabled={isAnalisando || textoExtraido.length < 50}
                  className="w-full mt-4 px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isAnalisando ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Analisando com IA...
                    </>
                  ) : (
                    <>
                      <Brain className="w-5 h-5" />
                      Analisar Currículo
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Lado Direito: Resultados */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-600" />
              Resultado da Análise
            </h2>

            {!analise && !isAnalisando && (
              <div className="text-center py-16 text-gray-400">
                <Brain className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p>Faça upload de um CV e clique em "Analisar"</p>
                <p className="text-sm mt-1">Os resultados aparecerão aqui</p>
              </div>
            )}

            {isAnalisando && (
              <div className="text-center py-16">
                <Loader2 className="w-12 h-12 mx-auto mb-4 text-purple-600 animate-spin" />
                <p className="text-gray-600">Analisando currículo com IA...</p>
                <p className="text-sm text-gray-400 mt-1">Isso pode levar alguns segundos</p>
              </div>
            )}

            {analise && (
              <div className="space-y-4">
                {/* Score e Recomendação */}
                <div className={`p-4 rounded-xl ${
                  analise.recomendacao === 'banco_talentos' ? 'bg-green-50 border border-green-200' :
                  analise.recomendacao === 'analisar_mais' ? 'bg-yellow-50 border border-yellow-200' :
                  'bg-red-50 border border-red-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Score Geral</p>
                      <p className={`text-3xl font-bold ${
                        analise.score_geral >= 70 ? 'text-green-600' :
                        analise.score_geral >= 50 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {analise.score_geral}%
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-medium px-3 py-1 rounded-full ${
                        analise.recomendacao === 'banco_talentos' ? 'bg-green-200 text-green-800' :
                        analise.recomendacao === 'analisar_mais' ? 'bg-yellow-200 text-yellow-800' :
                        'bg-red-200 text-red-800'
                      }`}>
                        {analise.recomendacao === 'banco_talentos' ? '✅ Salvar no Banco' :
                         analise.recomendacao === 'analisar_mais' ? '⚠️ Analisar Mais' :
                         '❌ Descartar'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Risco: {analise.nivel_risco}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mt-3">{analise.justificativa}</p>
                </div>

                {/* Informações Detectadas */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-xs text-gray-500">Senioridade Estimada</p>
                    <p className="font-medium">{analise.senioridade_estimada || 'N/A'}</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-xs text-gray-500">Experiência</p>
                    <p className="font-medium">{analise.experiencia_anos || 0} anos</p>
                  </div>
                </div>

                {/* Áreas de Atuação */}
                {analise.areas_atuacao?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Áreas de Atuação</p>
                    <div className="flex flex-wrap gap-1">
                      {analise.areas_atuacao.map((area, i) => (
                        <span key={i} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                          {area}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Skills */}
                {analise.skills_detectadas?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Skills Detectadas</p>
                    <div className="flex flex-wrap gap-1">
                      {analise.skills_detectadas.slice(0, 15).map((skill, i) => (
                        <span key={i} className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">
                          {skill}
                        </span>
                      ))}
                      {analise.skills_detectadas.length > 15 && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-500 text-xs rounded">
                          +{analise.skills_detectadas.length - 15}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Pontos Fortes */}
                {analise.pontos_fortes?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-green-700 mb-2 flex items-center gap-1">
                      <TrendingUp className="w-4 h-4" />
                      Pontos Fortes
                    </p>
                    <ul className="space-y-1">
                      {analise.pontos_fortes.map((ponto, i) => (
                        <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                          {ponto}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Fatores de Risco */}
                {analise.fatores_risco?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-orange-700 mb-2 flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" />
                      Fatores de Risco ({analise.fatores_risco.length})
                    </p>
                    <div className="space-y-2">
                      {analise.fatores_risco.map((risco, i) => (
                        <div key={i} className="p-2 bg-orange-50 rounded-lg border border-orange-200">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-800">{risco.tipo}</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              risco.nivel === 'high' ? 'bg-red-200 text-red-700' :
                              risco.nivel === 'medium' ? 'bg-yellow-200 text-yellow-700' :
                              'bg-blue-200 text-blue-700'
                            }`}>
                              {risco.nivel}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 mt-1">{risco.descricao}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Botão Salvar no Banco de Talentos */}
                {analise.score_geral >= 50 && !salvouBanco && (
                  <button
                    onClick={handleSalvarBancoTalentos}
                    disabled={isSalvando}
                    className="w-full mt-4 px-4 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSalvando ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <Database className="w-5 h-5" />
                        Salvar no Banco de Talentos
                      </>
                    )}
                  </button>
                )}

                {salvouBanco && (
                  <div className="p-4 bg-green-100 border border-green-300 rounded-lg text-center">
                    <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
                    <p className="font-medium text-green-800">Salvo no Banco de Talentos!</p>
                    <p className="text-sm text-green-600">O candidato foi adicionado à base de pessoas</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {abaAtiva === 'alertas' && (
        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
              Candidaturas em Risco
            </h2>
            <button
              onClick={carregarAlertas}
              disabled={loadingAlertas}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
            >
              <RefreshCw className={`w-5 h-5 ${loadingAlertas ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <p className="text-sm text-gray-500 mb-4">
            Candidaturas em processo com risco de reprovação acima de 50% (dados reais de análises feitas no modal de Candidaturas)
          </p>

          {loadingAlertas ? (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 mx-auto text-orange-600 animate-spin" />
              <p className="text-gray-500 mt-2">Carregando alertas...</p>
            </div>
          ) : alertas.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
              <p className="font-medium text-gray-600">Nenhum alerta de risco</p>
              <p className="text-sm">Todas as candidaturas em processo têm risco baixo ou ainda não foram analisadas</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alertas.map((alerta) => (
                <div
                  key={alerta.id}
                  className={`p-4 rounded-lg border-l-4 ${
                    alerta.risco_reprovacao >= 70 ? 'bg-red-50 border-red-500' :
                    'bg-orange-50 border-orange-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-800">{alerta.candidato_nome}</h3>
                      <p className="text-sm text-gray-600">{alerta.vaga_titulo}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-bold ${
                        alerta.risco_reprovacao >= 70 ? 'text-red-600' : 'text-orange-600'
                      }`}>
                        {alerta.risco_reprovacao}%
                      </p>
                      <p className="text-xs text-gray-500">risco de reprovação</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className={`text-xs px-2 py-1 rounded ${
                      alerta.recomendacao === 'rejeitar' ? 'bg-red-200 text-red-700' :
                      alerta.recomendacao === 'revisar' ? 'bg-yellow-200 text-yellow-700' :
                      'bg-blue-200 text-blue-700'
                    }`}>
                      {alerta.recomendacao}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(alerta.criado_em).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {abaAtiva === 'metricas' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-600" />
                Métricas de Acurácia da IA
              </h2>
              <button
                onClick={carregarMetricas}
                disabled={loadingMetricas}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <RefreshCw className={`w-5 h-5 ${loadingMetricas ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <p className="text-sm text-gray-500 mb-6">
              Comparação entre as recomendações da IA e os resultados reais das candidaturas
            </p>

            {loadingMetricas ? (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 mx-auto text-blue-600 animate-spin" />
                <p className="text-gray-500 mt-2">Calculando métricas...</p>
              </div>
            ) : !metricas ? (
              <div className="text-center py-12 text-gray-400">
                <Target className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium text-gray-600">Métricas não disponíveis</p>
                <p className="text-sm">Aguardando candidaturas com resultado final</p>
              </div>
            ) : (
              <>
                {/* Cards de resumo */}
                <div className="grid grid-cols-4 gap-4 mb-6">
                  <div className="bg-blue-50 p-4 rounded-xl text-center">
                    <p className="text-3xl font-bold text-blue-600">{metricas.total_analises}</p>
                    <p className="text-sm text-gray-600">Total de Análises</p>
                  </div>
                  <div className="bg-purple-50 p-4 rounded-xl text-center">
                    <p className="text-3xl font-bold text-purple-600">{metricas.com_resultado}</p>
                    <p className="text-sm text-gray-600">Com Resultado</p>
                  </div>
                  <div className="bg-green-50 p-4 rounded-xl text-center">
                    <p className="text-3xl font-bold text-green-600">{metricas.predicoes_corretas}</p>
                    <p className="text-sm text-gray-600">Predições Corretas</p>
                  </div>
                  <div className={`p-4 rounded-xl text-center ${
                    metricas.taxa_acerto >= 70 ? 'bg-green-100' :
                    metricas.taxa_acerto >= 50 ? 'bg-yellow-100' : 'bg-red-100'
                  }`}>
                    <p className={`text-3xl font-bold ${
                      metricas.taxa_acerto >= 70 ? 'text-green-600' :
                      metricas.taxa_acerto >= 50 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {metricas.taxa_acerto.toFixed(1)}%
                    </p>
                    <p className="text-sm text-gray-600">Taxa de Acerto</p>
                  </div>
                </div>

                {/* Detalhamento por recomendação */}
                <h3 className="font-semibold text-gray-700 mb-3">Acerto por Tipo de Recomendação</h3>
                <div className="grid grid-cols-4 gap-3">
                  {Object.entries(metricas.por_recomendacao).map(([tipo, dados]) => (
                    <div key={tipo} className="bg-gray-50 p-3 rounded-lg">
                      <p className="text-sm font-medium text-gray-700 capitalize">{tipo}</p>
                      <p className="text-lg font-bold text-gray-800">
                        {dados.total > 0 ? ((dados.acertos / dados.total) * 100).toFixed(0) : 0}%
                      </p>
                      <p className="text-xs text-gray-500">
                        {dados.acertos}/{dados.total} acertos
                      </p>
                    </div>
                  ))}
                </div>

                {metricas.com_resultado === 0 && (
                  <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      <strong>Nota:</strong> As métricas serão calculadas quando houver candidaturas 
                      com resultado final (contratado, reprovado, etc.)
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AnaliseRisco;
