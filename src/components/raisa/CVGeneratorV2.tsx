/**
 * CVGeneratorV2.tsx - Gerador de CV Padronizado v2.1
 * 
 * Baseado nos templates reais:
 * - Techfor Padrão (vermelho)
 * - T-Systems (magenta com capa)
 * 
 * Novos campos:
 * - Parecer de Seleção
 * - Tabela de Requisitos Match
 * - Hard Skills com tempo
 * - Motivo de saída
 * - Dados pessoais completos
 * 
 * INTEGRAÇÃO SUPABASE v2.1 (Sprint 1 - 27/12/2024):
 * - Usa useCVGenerator hook para salvar CVs
 * - Usa useCVTemplates hook para carregar templates
 * - Tabelas: cv_gerado, cv_template
 * 
 * Versão: 2.1
 * Data: 27/12/2024
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  DadosCandidatoTechfor, 
  ExperienciaCV, 
  FormacaoCV, 
  RequisitoMatch,
  IdiomaCV,
  ESTADOS_CIVIS,
  NIVEIS_HIERARQUICOS,
  TIPOS_FORMACAO,
  NIVEIS_IDIOMA,
  MODALIDADES_TRABALHO
} from '@/types/cvTypes';

// ✅ NOVO: Hooks de integração Supabase
import { useCVGenerator } from '@/hooks/supabase/useCVGenerator';
import { useCVTemplates } from '@/hooks/supabase/useCVTemplates';

interface CVGeneratorV2Props {
  candidaturaId: number;
  candidatoNome: string;
  // 🆕 v57.2: Dados de anonimização e contato da pessoa
  pessoaDados?: {
    nome_anoni_parcial?: string;  // Ex: José S.X.
    nome_anoni_total?: string;    // Ex: J.S.X.
    email?: string;
    telefone?: string;
    cidade?: string;
    estado?: string;
  };
  vagaInfo?: {
    id: number;
    titulo: string;
    codigo?: string;
    cliente?: string;
    gestor?: string;
    requisitos?: string;
    stack_tecnologica?: string;
  };
  cvOriginalTexto?: string;
  onClose: () => void;
  onCVGerado?: (cvId: number) => void;
  currentUserId?: number;
}

// 🆕 v57.2: Tipos para configuração de nome
type TipoNomeCV = 'completo' | 'parcial' | 'anonimo';

type EtapaGeracao = 'template' | 'dados' | 'requisitos' | 'parecer' | 'preview' | 'finalizado';
type TemplateType = 'techfor' | 'tsystems';

const CVGeneratorV2: React.FC<CVGeneratorV2Props> = ({
  candidaturaId,
  candidatoNome,
  pessoaDados,  // 🆕 v57.2: Dados de anonimização
  vagaInfo,
  cvOriginalTexto,
  onClose,
  onCVGerado,
  currentUserId
}) => {
  // ✅ NOVO: Hooks Supabase para persistência
  const { 
    cvAtual, 
    saveCV, 
    aprovarCV, 
    loadCVByCandidatura,
    loading: loadingCV,
    error: errorCV 
  } = useCVGenerator();
  
  const { 
    templates, 
    loadTemplates, 
    getTemplateByNome,
    loading: loadingTemplates 
  } = useCVTemplates();

  // Estados principais
  const [etapa, setEtapa] = useState<EtapaGeracao>('template');
  const [templateSelecionado, setTemplateSelecionado] = useState<TemplateType>('techfor');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cvSalvoId, setCvSalvoId] = useState<number | null>(null);
  
  // 🆕 v57.2: Estados para configuração de nome e contato
  const [tipoNome, setTipoNome] = useState<TipoNomeCV>('completo');
  const [exibirContato, setExibirContato] = useState<boolean>(true);
  
  // 🆕 v57.2: Nome a ser usado no CV baseado na seleção
  const nomeParaCV = (): string => {
    switch (tipoNome) {
      case 'parcial':
        return pessoaDados?.nome_anoni_parcial || candidatoNome;
      case 'anonimo':
        return pessoaDados?.nome_anoni_total || candidatoNome;
      default:
        return candidatoNome;
    }
  };
  
  // Dados do candidato
  const [dados, setDados] = useState<DadosCandidatoTechfor>({
    nome: candidatoNome,
    email: pessoaDados?.email || '',
    telefone: pessoaDados?.telefone || '',
    cidade: pessoaDados?.cidade || '',
    estado: pessoaDados?.estado || '',
    titulo_vaga: vagaInfo?.titulo,
    codigo_vaga: vagaInfo?.codigo,
    cliente_destino: vagaInfo?.cliente,
    gestor_destino: vagaInfo?.gestor,
    requisitos_match: [],
    experiencias: [],
    formacao_academica: [],
    formacao_complementar: [],
    hard_skills_tabela: [],
    idiomas: []
  });
  
  // 🆕 v57.2: Atualizar nome quando tipo muda
  useEffect(() => {
    setDados(prev => ({
      ...prev,
      nome: nomeParaCV(),
      // Se não exibir contato, limpar os campos
      email: (tipoNome === 'completo' && exibirContato) ? (pessoaDados?.email || '') : '',
      telefone: (tipoNome === 'completo' && exibirContato) ? (pessoaDados?.telefone || '') : '',
      cidade: (tipoNome === 'completo' && exibirContato) ? (pessoaDados?.cidade || '') : '',
      estado: (tipoNome === 'completo' && exibirContato) ? (pessoaDados?.estado || '') : ''
    }));
  }, [tipoNome, exibirContato]);

  // ✅ NOVO: Carregar CV existente e templates ao montar
  useEffect(() => {
    const init = async () => {
      // Carregar templates disponíveis
      await loadTemplates();
      
      // Verificar se já existe CV para esta candidatura
      const cvExistente = await loadCVByCandidatura(candidaturaId);
      if (cvExistente) {
        setDados(cvExistente.dados_processados);
        console.log('📋 CV existente carregado (versão ' + cvExistente.versao + ')');
      }
    };
    init();
  }, [candidaturaId, loadTemplates, loadCVByCandidatura]);
  
  // Preview HTML
  const [htmlPreview, setHtmlPreview] = useState<string>('');
  const [htmlCapa, setHtmlCapa] = useState<string>('');

  // Atualizar campo
  const updateDados = <K extends keyof DadosCandidatoTechfor>(
    campo: K, 
    valor: DadosCandidatoTechfor[K]
  ) => {
    setDados(prev => ({ ...prev, [campo]: valor }));
  };

  // Extrair dados do CV
  const handleExtrairDados = async () => {
    // ✅ Se CV já foi carregado do banco (Entrevista já preencheu), pular extração IA
    if (cvAtual && cvAtual.dados_processados) {
      console.log('📋 CV já carregado do banco, pulando extração IA');
      setEtapa('dados');
      return;
    }

    if (!cvOriginalTexto) {
      setEtapa('dados');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/gemini-cv-generator-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'extrair_dados',
          texto_cv: cvOriginalTexto,
          vaga_info: vagaInfo
        })
      });

      if (!response.ok) throw new Error('Erro ao extrair dados');

      const dadosExtraidos = await response.json();
      setDados(prev => ({
        ...prev,
        ...dadosExtraidos,
        titulo_vaga: vagaInfo?.titulo || dadosExtraidos.titulo_profissional,
        codigo_vaga: vagaInfo?.codigo,
        cliente_destino: vagaInfo?.cliente,
        gestor_destino: vagaInfo?.gestor
      }));
      setEtapa('dados');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Gerar parecer com IA
  const handleGerarParecer = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/gemini-cv-generator-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'gerar_parecer',
          dados: dados,
          vaga_info: vagaInfo
        })
      });

      if (!response.ok) throw new Error('Erro ao gerar parecer');

      const { parecer } = await response.json();
      updateDados('parecer_selecao', parecer);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Gerar preview
  const handleGerarPreview = async () => {
    setLoading(true);
    setError(null);

    try {
      const action = templateSelecionado === 'tsystems' 
        ? 'gerar_html_tsystems' 
        : 'gerar_html_techfor';

      const response = await fetch('/api/gemini-cv-generator-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: action,
          dados: dados
        })
      });

      if (!response.ok) throw new Error('Erro ao gerar preview');

      const result = await response.json();
      setHtmlPreview(result.html);
      if (result.html_capa) setHtmlCapa(result.html_capa);
      setEtapa('preview');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ✅ NOVO: Função para finalizar e salvar CV no Supabase
  const handleFinalizarCV = async () => {
    setLoading(true);
    setError(null);

    try {
      // Buscar template_id se disponível
      let templateId: number | undefined;
      const templateNome = templateSelecionado === 'tsystems' ? 'T-Systems' : 'Techfor';
      const templateDB = await getTemplateByNome(templateNome);
      if (templateDB) {
        templateId = templateDB.id;
      }

      // Salvar CV no Supabase
      const cvSalvo = await saveCV({
        candidatura_id: candidaturaId,
        template_id: templateId,
        cv_original_url: cvOriginalTexto ? undefined : undefined, // URL do CV original se disponível
        dados_processados: dados,
        cv_html: htmlPreview,
        gerado_por: currentUserId,
        metadados: {
          template_tipo: templateSelecionado,
          tem_capa: !!htmlCapa,
          vaga_info: vagaInfo
        }
      });

      if (cvSalvo) {
        setCvSalvoId(cvSalvo.id);
        console.log('✅ CV salvo no Supabase (ID: ' + cvSalvo.id + ', versão: ' + cvSalvo.versao + ')');
        
        // Callback para o componente pai
        if (onCVGerado) {
          onCVGerado(cvSalvo.id);
        }

        setEtapa('finalizado');
      } else {
        throw new Error('Falha ao salvar CV no banco de dados');
      }
    } catch (err: any) {
      console.error('❌ Erro ao finalizar CV:', err);
      setError(err.message || 'Erro ao salvar CV');
    } finally {
      setLoading(false);
    }
  };

  // 🆕 v3.0: Função para baixar CV em DOCX (Word) com papel timbrado real
  const handleBaixarDocx = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/cv-generator-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dados: dados,
          template: templateSelecionado === 'tsystems' ? 'tsystems' : 'techfor'
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Erro ao gerar DOCX');
      }

      const result = await response.json();
      
      // Converter base64 para blob e iniciar download
      const byteCharacters = atob(result.docx_base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { 
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
      });

      // Criar link de download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename || `CV_${(dados.nome || 'Candidato').replace(/\s+/g, '_')}_Techfor.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      console.log('✅ DOCX baixado: ' + result.size + ' bytes');
    } catch (err: any) {
      console.error('❌ Erro ao gerar DOCX:', err);
      setError(err.message || 'Erro ao gerar documento Word');
    } finally {
      setLoading(false);
    }
  };

  // Adicionar experiência
  const addExperiencia = () => {
    const nova: ExperienciaCV = {
      empresa: '',
      cargo: '',
      data_inicio: '',
      atual: false
    };
    updateDados('experiencias', [...(dados.experiencias || []), nova]);
  };

  // Remover experiência
  const removeExperiencia = (index: number) => {
    const lista = [...(dados.experiencias || [])];
    lista.splice(index, 1);
    updateDados('experiencias', lista);
  };

  // Atualizar experiência
  const updateExperiencia = (index: number, campo: keyof ExperienciaCV, valor: any) => {
    const lista = [...(dados.experiencias || [])];
    lista[index] = { ...lista[index], [campo]: valor };
    updateDados('experiencias', lista);
  };

  // Adicionar hard skill
  const addHardSkill = () => {
    updateDados('hard_skills_tabela', [
      ...(dados.hard_skills_tabela || []),
      { tecnologia: '', tempo_experiencia: '' }
    ]);
  };

  // Remover hard skill
  const removeHardSkill = (index: number) => {
    const lista = [...(dados.hard_skills_tabela || [])];
    lista.splice(index, 1);
    updateDados('hard_skills_tabela', lista);
  };

  // Adicionar requisito match
  const addRequisito = () => {
    const novo: RequisitoMatch = {
      tecnologia: '',
      tempo_experiencia: '',
      observacao: '',
      tipo: 'mandatorio',
      atendido: true
    };
    updateDados('requisitos_match', [...(dados.requisitos_match || []), novo]);
  };

  // Adicionar idioma
  const addIdioma = () => {
    updateDados('idiomas', [
      ...(dados.idiomas || []),
      { idioma: '', nivel: 'intermediario' }
    ]);
  };

  // Adicionar formação
  const addFormacao = () => {
    updateDados('formacao_academica', [
      ...(dados.formacao_academica || []),
      { tipo: 'graduacao', curso: '', instituicao: '', em_andamento: false }
    ]);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className={`text-white p-6 ${
          templateSelecionado === 'tsystems' 
            ? 'bg-gradient-to-r from-pink-600 to-pink-500' 
            : 'bg-gradient-to-r from-red-700 to-red-600'
        }`}>
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                📄 Gerador de CV Padronizado v2.0
              </h2>
              <p className="text-white/80 mt-1">{candidatoNome}</p>
              {vagaInfo && (
                <p className="text-white/60 text-sm mt-1">
                  {vagaInfo.titulo} {vagaInfo.codigo && `- ${vagaInfo.codigo}`}
                </p>
              )}
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white text-3xl">
              &times;
            </button>
          </div>

          {/* Progress */}
          <div className="flex gap-2 mt-6">
            {(['template', 'dados', 'requisitos', 'parecer', 'preview', 'finalizado'] as EtapaGeracao[]).map((e, i) => (
              <div key={e} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  etapa === e ? 'bg-white text-red-600' :
                  (['template', 'dados', 'requisitos', 'parecer', 'preview', 'finalizado'].indexOf(etapa) > i) 
                    ? 'bg-white/40 text-white' : 'bg-white/20 text-white/50'
                }`}>
                  {i + 1}
                </div>
                {i < 5 && <div className="w-6 h-0.5 bg-white/30 mx-1" />}
              </div>
            ))}
          </div>
        </div>

        {/* Erro */}
        {error && (
          <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {/* Etapa 1: Seleção de Template */}
          {etapa === 'template' && (
            <div className="space-y-6">
              <h3 className="text-xl font-bold text-center mb-8">Selecione o Template</h3>
              
              <div className="grid grid-cols-2 gap-6 max-w-2xl mx-auto">
                {/* Template Techfor */}
                <div
                  onClick={() => setTemplateSelecionado('techfor')}
                  className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
                    templateSelecionado === 'techfor' 
                      ? 'border-red-500 ring-2 ring-red-200' 
                      : 'border-gray-200 hover:border-red-300'
                  }`}
                >
                  <div className="h-32 bg-gradient-to-br from-red-700 to-red-600 rounded-lg mb-4 flex items-center justify-center">
                    <span className="text-white font-bold text-xl">TechFor</span>
                  </div>
                  <h4 className="font-bold text-lg">Template Techfor</h4>
                  <p className="text-sm text-gray-500 mt-1">
                    Padrão da Techfor com tabela de requisitos e parecer de seleção
                  </p>
                  <div className="flex flex-wrap gap-1 mt-3">
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">Parecer</span>
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">Requisitos</span>
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">Rodapé</span>
                  </div>
                </div>

                {/* Template T-Systems */}
                <div
                  onClick={() => setTemplateSelecionado('tsystems')}
                  className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
                    templateSelecionado === 'tsystems' 
                      ? 'border-pink-500 ring-2 ring-pink-200' 
                      : 'border-gray-200 hover:border-pink-300'
                  }`}
                >
                  <div className="h-32 bg-gradient-to-br from-pink-600 to-pink-500 rounded-lg mb-4 flex items-center justify-center">
                    <span className="text-white font-bold text-xl">T Systems</span>
                  </div>
                  <h4 className="font-bold text-lg">Template T-Systems</h4>
                  <p className="text-sm text-gray-500 mt-1">
                    Layout T-Systems com capa e tabela de hard skills
                  </p>
                  <div className="flex flex-wrap gap-1 mt-3">
                    <span className="text-xs bg-pink-100 text-pink-700 px-2 py-1 rounded">Capa</span>
                    <span className="text-xs bg-pink-100 text-pink-700 px-2 py-1 rounded">Hard Skills</span>
                    <span className="text-xs bg-pink-100 text-pink-700 px-2 py-1 rounded">Protocolo</span>
                  </div>
                </div>
              </div>

              {/* 🆕 v57.2: Configuração de Nome e Privacidade */}
              <div className="max-w-2xl mx-auto mt-8 p-4 bg-gray-50 rounded-xl border border-gray-200">
                <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                  🔒 Configuração de Privacidade do Candidato
                </h4>
                
                {/* Seletor de Tipo de Nome */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Como o nome será exibido no CV?
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {/* Nome Completo */}
                    <div
                      onClick={() => setTipoNome('completo')}
                      className={`border-2 rounded-lg p-3 cursor-pointer transition-all text-center ${
                        tipoNome === 'completo'
                          ? 'border-green-500 bg-green-50'
                          : 'border-gray-200 hover:border-green-300'
                      }`}
                    >
                      <div className="text-2xl mb-1">👤</div>
                      <div className="font-medium text-sm">Nome Completo</div>
                      <div className="text-xs text-gray-500 mt-1">{candidatoNome}</div>
                    </div>
                    
                    {/* Nome Parcial */}
                    <div
                      onClick={() => setTipoNome('parcial')}
                      className={`border-2 rounded-lg p-3 cursor-pointer transition-all text-center ${
                        tipoNome === 'parcial'
                          ? 'border-yellow-500 bg-yellow-50'
                          : 'border-gray-200 hover:border-yellow-300'
                      }`}
                    >
                      <div className="text-2xl mb-1">🔓</div>
                      <div className="font-medium text-sm">Parcialmente Anônimo</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {pessoaDados?.nome_anoni_parcial || 'Primeiro nome + iniciais'}
                      </div>
                    </div>
                    
                    {/* Nome Totalmente Anônimo */}
                    <div
                      onClick={() => setTipoNome('anonimo')}
                      className={`border-2 rounded-lg p-3 cursor-pointer transition-all text-center ${
                        tipoNome === 'anonimo'
                          ? 'border-red-500 bg-red-50'
                          : 'border-gray-200 hover:border-red-300'
                      }`}
                    >
                      <div className="text-2xl mb-1">🔒</div>
                      <div className="font-medium text-sm">Totalmente Anônimo</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {pessoaDados?.nome_anoni_total || 'Apenas iniciais'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Checkbox de Contato - só aparece se nome completo */}
                {tipoNome === 'completo' && (
                  <div className="mt-4 p-3 bg-white rounded-lg border border-gray-200">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={exibirContato}
                        onChange={(e) => setExibirContato(e.target.checked)}
                        className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <div>
                        <span className="font-medium text-gray-800">Exibir dados de contato</span>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Inclui: celular, email, cidade e estado
                        </p>
                      </div>
                    </label>
                    
                    {exibirContato && (
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600 bg-gray-50 p-2 rounded">
                        <div>📧 {pessoaDados?.email || 'Não informado'}</div>
                        <div>📱 {pessoaDados?.telefone || 'Não informado'}</div>
                        <div>📍 {pessoaDados?.cidade || 'Não informado'}</div>
                        <div>🗺️ {pessoaDados?.estado || 'Não informado'}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Aviso para nomes anonimizados */}
                {tipoNome !== 'completo' && (
                  <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <p className="text-sm text-amber-800">
                      ⚠️ <strong>Dados de contato ocultados</strong>: Ao selecionar nome parcial ou anônimo, 
                      os dados de contato (email, telefone, cidade, estado) não serão exibidos no CV.
                    </p>
                  </div>
                )}

                {/* Preview do nome selecionado */}
                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-800">
                    <strong>Nome no CV:</strong> {nomeParaCV()}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Etapa 2: Dados Pessoais */}
          {etapa === 'dados' && (
            <div className="space-y-6">
              <h3 className="text-xl font-bold mb-4">Dados do Candidato</h3>

              {/* Informações da Vaga */}
              <div className="bg-blue-50 rounded-lg p-4">
                <h4 className="font-bold text-blue-800 mb-3">📋 Informações da Vaga</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-600">Título da Vaga</label>
                    <input
                      type="text"
                      value={dados.titulo_vaga || ''}
                      onChange={e => updateDados('titulo_vaga', e.target.value)}
                      className="w-full border rounded p-2 mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Código/Protocolo</label>
                    <input
                      type="text"
                      value={dados.codigo_vaga || ''}
                      onChange={e => updateDados('codigo_vaga', e.target.value)}
                      className="w-full border rounded p-2 mt-1"
                      placeholder="Ex: VTI-225"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Cliente Destino</label>
                    <input
                      type="text"
                      value={dados.cliente_destino || ''}
                      onChange={e => updateDados('cliente_destino', e.target.value)}
                      className="w-full border rounded p-2 mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Gestor/Contato</label>
                    <input
                      type="text"
                      value={dados.gestor_destino || ''}
                      onChange={e => updateDados('gestor_destino', e.target.value)}
                      className="w-full border rounded p-2 mt-1"
                    />
                  </div>
                </div>
              </div>

              {/* Dados Pessoais */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-bold text-gray-700 mb-3">👤 Dados Pessoais</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <label className="text-sm text-gray-600">Nome Completo</label>
                    <input
                      type="text"
                      value={dados.nome}
                      onChange={e => updateDados('nome', e.target.value)}
                      className="w-full border rounded p-2 mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Idade</label>
                    <input
                      type="number"
                      value={dados.idade || ''}
                      onChange={e => updateDados('idade', parseInt(e.target.value) || undefined)}
                      className="w-full border rounded p-2 mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Estado Civil</label>
                    <select
                      value={dados.estado_civil || ''}
                      onChange={e => updateDados('estado_civil', e.target.value as any)}
                      className="w-full border rounded p-2 mt-1"
                    >
                      <option value="">Selecione...</option>
                      {ESTADOS_CIVIS.map(ec => (
                        <option key={ec.value} value={ec.value}>{ec.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Cidade</label>
                    <input
                      type="text"
                      value={dados.cidade || ''}
                      onChange={e => updateDados('cidade', e.target.value)}
                      className="w-full border rounded p-2 mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Estado (UF)</label>
                    <input
                      type="text"
                      value={dados.estado || ''}
                      onChange={e => updateDados('estado', e.target.value)}
                      className="w-full border rounded p-2 mt-1"
                      maxLength={2}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Disponibilidade</label>
                    <input
                      type="text"
                      value={dados.disponibilidade || ''}
                      onChange={e => updateDados('disponibilidade', e.target.value)}
                      className="w-full border rounded p-2 mt-1"
                      placeholder="Imediata, 15 dias, etc."
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Modalidade</label>
                    <select
                      value={dados.modalidade_trabalho || ''}
                      onChange={e => updateDados('modalidade_trabalho', e.target.value as any)}
                      className="w-full border rounded p-2 mt-1"
                    >
                      <option value="">Selecione...</option>
                      {MODALIDADES_TRABALHO.map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Nível Hierárquico</label>
                    <select
                      value={dados.nivel_hierarquico || ''}
                      onChange={e => updateDados('nivel_hierarquico', e.target.value as any)}
                      className="w-full border rounded p-2 mt-1"
                    >
                      <option value="">Selecione...</option>
                      {NIVEIS_HIERARQUICOS.map(n => (
                        <option key={n.value} value={n.value}>{n.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Título e Resumo */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-bold text-gray-700 mb-3">💼 Perfil Profissional</h4>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-gray-600">Título Profissional</label>
                    <input
                      type="text"
                      value={dados.titulo_profissional || ''}
                      onChange={e => updateDados('titulo_profissional', e.target.value)}
                      className="w-full border rounded p-2 mt-1"
                      placeholder="Ex: Desenvolvedor Full Stack Senior"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Resumo Profissional</label>
                    <textarea
                      value={dados.resumo || ''}
                      onChange={e => updateDados('resumo', e.target.value)}
                      className="w-full border rounded p-2 mt-1 h-24"
                      placeholder="Resumo das competências e experiência..."
                    />
                  </div>
                </div>
              </div>

              {/* Hard Skills (Tabela) */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-bold text-gray-700">🛠️ Hard Skills (Tabela)</h4>
                  <button onClick={addHardSkill} className="text-blue-600 text-sm hover:underline">
                    + Adicionar Skill
                  </button>
                </div>
                <div className="space-y-2">
                  {dados.hard_skills_tabela?.map((skill, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={skill.tecnologia}
                        onChange={e => {
                          const lista = [...(dados.hard_skills_tabela || [])];
                          lista[i] = { ...lista[i], tecnologia: e.target.value };
                          updateDados('hard_skills_tabela', lista);
                        }}
                        className="flex-1 border rounded p-2 text-sm"
                        placeholder="Tecnologia"
                      />
                      <input
                        type="text"
                        value={skill.tempo_experiencia}
                        onChange={e => {
                          const lista = [...(dados.hard_skills_tabela || [])];
                          lista[i] = { ...lista[i], tempo_experiencia: e.target.value };
                          updateDados('hard_skills_tabela', lista);
                        }}
                        className="w-32 border rounded p-2 text-sm"
                        placeholder="+ X anos"
                      />
                      <button
                        onClick={() => removeHardSkill(i)}
                        className="text-red-500 hover:text-red-700"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Etapa 3: Requisitos Match */}
          {etapa === 'requisitos' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold">Requisitos x Experiência</h3>
                <button onClick={addRequisito} className="bg-blue-600 text-white px-3 py-1 rounded text-sm">
                  + Adicionar Requisito
                </button>
              </div>
              
              <p className="text-gray-500 text-sm">
                Preencha a tabela comparando os requisitos da vaga com a experiência do candidato.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-yellow-100">
                      <th className="border p-2 text-left">Tecnologia/Requisito</th>
                      <th className="border p-2 text-left w-32">Tempo Exp.</th>
                      <th className="border p-2 text-left">Observação</th>
                      <th className="border p-2 w-16">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.requisitos_match?.map((req, i) => (
                      <tr key={i}>
                        <td className="border p-1">
                          <textarea
                            value={req.tecnologia}
                            onChange={e => {
                              const lista = [...(dados.requisitos_match || [])];
                              lista[i] = { ...lista[i], tecnologia: e.target.value };
                              updateDados('requisitos_match', lista);
                            }}
                            className="w-full border-0 p-1 text-sm resize-none"
                            rows={2}
                          />
                        </td>
                        <td className="border p-1">
                          <input
                            type="text"
                            value={req.tempo_experiencia}
                            onChange={e => {
                              const lista = [...(dados.requisitos_match || [])];
                              lista[i] = { ...lista[i], tempo_experiencia: e.target.value };
                              updateDados('requisitos_match', lista);
                            }}
                            className="w-full border-0 p-1 text-sm"
                            placeholder="X anos"
                          />
                        </td>
                        <td className="border p-1">
                          <textarea
                            value={req.observacao}
                            onChange={e => {
                              const lista = [...(dados.requisitos_match || [])];
                              lista[i] = { ...lista[i], observacao: e.target.value };
                              updateDados('requisitos_match', lista);
                            }}
                            className="w-full border-0 p-1 text-sm resize-none"
                            rows={2}
                          />
                        </td>
                        <td className="border p-1 text-center">
                          <button
                            onClick={() => {
                              const lista = [...(dados.requisitos_match || [])];
                              lista.splice(i, 1);
                              updateDados('requisitos_match', lista);
                            }}
                            className="text-red-500 hover:text-red-700"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {(!dados.requisitos_match || dados.requisitos_match.length === 0) && (
                <div className="text-center py-8 text-gray-400">
                  Nenhum requisito adicionado. Clique em "+ Adicionar Requisito" para começar.
                </div>
              )}
            </div>
          )}

          {/* Etapa 4: Parecer de Seleção */}
          {etapa === 'parecer' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold">Parecer de Seleção</h3>
                <button 
                  onClick={handleGerarParecer}
                  disabled={loading}
                  className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 disabled:opacity-50"
                >
                  {loading ? 'Gerando...' : '🤖 Gerar com IA'}
                </button>
              </div>
              
              <p className="text-gray-500 text-sm">
                O parecer de seleção é o texto do recrutador sobre o candidato. Você pode gerá-lo com IA ou escrever manualmente.
              </p>

              <textarea
                value={dados.parecer_selecao || ''}
                onChange={e => updateDados('parecer_selecao', e.target.value)}
                className="w-full border rounded p-4 h-64 text-sm"
                placeholder="Profissional com X anos de experiência na área de TI, atuando em empresas do segmento de: ...

Neste período desenvolveu competências em: ...

Em situação de entrevista demonstrou: ...

Brasileiro, XX anos, estado civil. Reside em Cidade, UF.

Recomendamos o(a) [NOME]..."
              />

              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-bold text-gray-700 mb-3">Recomendação Final</h4>
                <textarea
                  value={dados.recomendacao_final || ''}
                  onChange={e => updateDados('recomendacao_final', e.target.value)}
                  className="w-full border rounded p-3 h-20 text-sm"
                  placeholder="Recomendamos o(a) [NOME], pois demonstrou ser um(a) profissional com experiência considerável..."
                />
              </div>
            </div>
          )}

          {/* Etapa 5: Preview */}
          {etapa === 'preview' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold">Preview do CV</h3>
                <div className="flex gap-2">
                  {htmlCapa && (
                    <button className="text-purple-600 hover:underline text-sm">
                      📄 Ver Capa
                    </button>
                  )}
                  <button 
                    onClick={handleBaixarDocx}
                    disabled={loading}
                    className="text-green-600 hover:underline text-sm disabled:opacity-50"
                  >
                    {loading ? '⏳ Gerando...' : '📥 Baixar DOCX'}
                  </button>
                  <button onClick={() => setEtapa('parecer')} className="text-blue-600 hover:underline text-sm">
                    ← Voltar e editar
                  </button>
                </div>
              </div>

              <div className="border rounded-lg shadow-lg overflow-hidden bg-white">
                <iframe
                  srcDoc={htmlPreview}
                  className="w-full h-[700px]"
                  title="Preview CV"
                />
              </div>
            </div>
          )}

          {/* Etapa 6: Finalizado */}
          {etapa === 'finalizado' && (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">✅</div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">CV Gerado com Sucesso!</h3>
              <p className="text-gray-500 mb-4">
                O CV foi gerado no formato {templateSelecionado === 'tsystems' ? 'T-Systems' : 'Techfor'}
              </p>
              
              {/* ✅ NOVO: Info do CV salvo no Supabase */}
              {cvSalvoId && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 max-w-md mx-auto">
                  <p className="text-green-800 text-sm">
                    💾 <strong>CV salvo no banco de dados</strong>
                  </p>
                  <p className="text-green-600 text-xs mt-1">
                    ID: {cvSalvoId} | Versão: {cvAtual?.versao || 1}
                  </p>
                </div>
              )}

              <div className="flex justify-center gap-4 flex-wrap">
                <button 
                  onClick={handleBaixarDocx}
                  disabled={loading}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? '⏳ Gerando DOCX...' : '📥 Baixar DOCX (Word)'}
                </button>
                <button 
                  onClick={() => setEtapa('preview')}
                  className="px-6 py-3 border rounded-lg hover:bg-gray-50"
                >
                  👁️ Ver Preview
                </button>
                
                {/* ✅ NOVO: Botão de aprovar CV */}
                {cvSalvoId && !cvAtual?.aprovado && (
                  <button 
                    onClick={async () => {
                      if (currentUserId && cvSalvoId) {
                        const sucesso = await aprovarCV(cvSalvoId, currentUserId);
                        if (sucesso) {
                          alert('✅ CV aprovado para envio ao cliente!');
                        }
                      }
                    }}
                    className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    ✓ Aprovar para Envio
                  </button>
                )}
                
                {cvAtual?.aprovado && (
                  <span className="px-6 py-3 bg-green-100 text-green-800 rounded-lg flex items-center">
                    ✓ CV Aprovado
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t bg-gray-50 px-6 py-4 flex justify-between items-center">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-800">
            {etapa === 'finalizado' ? 'Fechar' : 'Cancelar'}
          </button>

          <div className="flex gap-3">
            {etapa === 'template' && (
              <button
                onClick={handleExtrairDados}
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Processando...' : 'Próximo →'}
              </button>
            )}

            {etapa === 'dados' && (
              <>
                <button onClick={() => setEtapa('template')} className="px-4 py-2 border rounded-lg">
                  ← Voltar
                </button>
                <button
                  onClick={() => setEtapa(templateSelecionado === 'techfor' ? 'requisitos' : 'parecer')}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Próximo →
                </button>
              </>
            )}

            {etapa === 'requisitos' && (
              <>
                <button onClick={() => setEtapa('dados')} className="px-4 py-2 border rounded-lg">
                  ← Voltar
                </button>
                <button
                  onClick={() => setEtapa('parecer')}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Próximo →
                </button>
              </>
            )}

            {etapa === 'parecer' && (
              <>
                <button 
                  onClick={() => setEtapa(templateSelecionado === 'techfor' ? 'requisitos' : 'dados')} 
                  className="px-4 py-2 border rounded-lg"
                >
                  ← Voltar
                </button>
                <button
                  onClick={handleGerarPreview}
                  disabled={loading}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Gerando...' : 'Gerar Preview →'}
                </button>
              </>
            )}

            {etapa === 'preview' && (
              <>
                <button onClick={() => setEtapa('parecer')} className="px-4 py-2 border rounded-lg">
                  ← Editar
                </button>
                <button
                  onClick={handleFinalizarCV}
                  disabled={loading || loadingCV}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {loading || loadingCV ? '💾 Salvando...' : '✓ Finalizar CV'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CVGeneratorV2;
