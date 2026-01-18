/**
 * CVGeneratorV2.tsx - Gerador de CV Padronizado v59.0
 * 
 * 🆕 v59.0 - NOVOS RECURSOS:
 * - 3 Templates: TechFor Simples, TechFor Detalhado, T-Systems
 * - Nova etapa "detalhes" para editar Observações e Motivos de Saída
 * - Coluna "Observação" nos Requisitos Mandatórios (template detalhado)
 * - Campo "Motivo de Saída" em cada experiência (template detalhado)
 * - Fundo padrão TechFor aplicado
 * - Persistência completa no Supabase
 * 
 * FLUXO DE ETAPAS:
 * 1. template → Seleciona template
 * 2. dados → Edita dados pessoais
 * 3. requisitos → Edita requisitos (simples ou detalhado)
 * 4. detalhes → Edita observações e motivos de saída (só detalhado) ← NOVO!
 * 5. parecer → Edita parecer de seleção
 * 6. preview → Visualiza CV
 * 7. finalizado → CV salvo
 * 
 * Versão: 59.0
 * Data: 18/01/2026
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  DadosCandidatoTechfor, 
  ExperienciaCV, 
  FormacaoCV, 
  RequisitoMatch,
  RequisitoDesejavel,
  IdiomaCV,
  TemplateType,
  ESTADOS_CIVIS,
  NIVEIS_HIERARQUICOS,
  TIPOS_FORMACAO,
  NIVEIS_IDIOMA,
  MODALIDADES_TRABALHO,
  TEMPLATES_DISPONIVEIS,
  TEMPLATE_TECHFOR_SIMPLES,
  TEMPLATE_TECHFOR_DETALHADO,
  TEMPLATE_TSYSTEMS
} from '@/types/cvTypes';

// Hooks de integração Supabase
import { useCVGenerator } from '@/hooks/supabase/useCVGenerator';
import { useCVTemplates } from '@/hooks/supabase/useCVTemplates';

// Ícones
import { 
  FileText, 
  User, 
  Briefcase, 
  GraduationCap, 
  Languages, 
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Save,
  X,
  Plus,
  Trash2,
  Edit3,
  MessageSquare
} from 'lucide-react';

// ============================================
// TIPOS
// ============================================

interface CVGeneratorV2Props {
  candidaturaId: number;
  candidatoNome: string;
  pessoaDados?: {
    nome_anoni_parcial?: string;
    nome_anoni_total?: string;
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

type TipoNomeCV = 'completo' | 'parcial' | 'anonimo';

// 🆕 v59.0: Nova etapa "detalhes" para observações e motivos
type EtapaGeracao = 'template' | 'dados' | 'requisitos' | 'detalhes' | 'parecer' | 'preview' | 'finalizado';

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const CVGeneratorV2: React.FC<CVGeneratorV2Props> = ({
  candidaturaId,
  candidatoNome,
  pessoaDados,
  vagaInfo,
  cvOriginalTexto,
  onClose,
  onCVGerado,
  currentUserId
}) => {
  // Hooks Supabase
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
  const [templateSelecionado, setTemplateSelecionado] = useState<TemplateType>('techfor_simples');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cvSalvoId, setCvSalvoId] = useState<number | null>(null);
  
  // Estados para configuração de nome e contato
  const [tipoNome, setTipoNome] = useState<TipoNomeCV>('completo');
  const [exibirContato, setExibirContato] = useState<boolean>(true);
  
  // HTML gerado
  const [htmlPreview, setHtmlPreview] = useState<string>('');
  const [htmlCapa, setHtmlCapa] = useState<string>('');

  // Nome a ser usado no CV
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
    requisitos_desejaveis: [],
    experiencias: [],
    formacao_academica: [],
    formacao_complementar: [],
    hard_skills_tabela: [],
    idiomas: []
  });

  // Atualizar nome quando tipo muda
  useEffect(() => {
    setDados(prev => ({
      ...prev,
      nome: nomeParaCV(),
      email: (tipoNome === 'completo' && exibirContato) ? pessoaDados?.email || prev.email : '',
      telefone: (tipoNome === 'completo' && exibirContato) ? pessoaDados?.telefone || prev.telefone : ''
    }));
  }, [tipoNome, exibirContato]);

  // Função para atualizar dados
  const updateDados = useCallback((campo: keyof DadosCandidatoTechfor, valor: any) => {
    setDados(prev => ({ ...prev, [campo]: valor }));
  }, []);

  // ============================================
  // FUNÇÕES DE REQUISITOS
  // ============================================

  const adicionarRequisito = (tipo: 'mandatorio' | 'desejavel') => {
    if (tipo === 'mandatorio') {
      const novoRequisito: RequisitoMatch = {
        tecnologia: '',
        requerido: true,
        atendido: true,
        tempo_experiencia: '',
        observacao: '',
        ordem: (dados.requisitos_match?.length || 0) + 1
      };
      updateDados('requisitos_match', [...(dados.requisitos_match || []), novoRequisito]);
    } else {
      const novoRequisito: RequisitoDesejavel = {
        tecnologia: '',
        tempo_experiencia: '',
        atendido: true,
        ordem: (dados.requisitos_desejaveis?.length || 0) + 1
      };
      updateDados('requisitos_desejaveis', [...(dados.requisitos_desejaveis || []), novoRequisito]);
    }
  };

  const atualizarRequisito = (
    tipo: 'mandatorio' | 'desejavel', 
    index: number, 
    campo: string, 
    valor: any
  ) => {
    if (tipo === 'mandatorio') {
      const novos = [...(dados.requisitos_match || [])];
      novos[index] = { ...novos[index], [campo]: valor };
      updateDados('requisitos_match', novos);
    } else {
      const novos = [...(dados.requisitos_desejaveis || [])];
      novos[index] = { ...novos[index], [campo]: valor };
      updateDados('requisitos_desejaveis', novos);
    }
  };

  const removerRequisito = (tipo: 'mandatorio' | 'desejavel', index: number) => {
    if (tipo === 'mandatorio') {
      const novos = (dados.requisitos_match || []).filter((_, i) => i !== index);
      updateDados('requisitos_match', novos);
    } else {
      const novos = (dados.requisitos_desejaveis || []).filter((_, i) => i !== index);
      updateDados('requisitos_desejaveis', novos);
    }
  };

  // ============================================
  // FUNÇÕES DE EXPERIÊNCIAS
  // ============================================

  const adicionarExperiencia = () => {
    const novaExp: ExperienciaCV = {
      empresa: '',
      cargo: '',
      data_inicio: '',
      data_fim: '',
      atual: false,
      principais_atividades: [],
      motivo_saida: '',
      ordem: (dados.experiencias?.length || 0) + 1
    };
    updateDados('experiencias', [...(dados.experiencias || []), novaExp]);
  };

  const atualizarExperiencia = (index: number, campo: string, valor: any) => {
    const novas = [...(dados.experiencias || [])];
    novas[index] = { ...novas[index], [campo]: valor };
    updateDados('experiencias', novas);
  };

  const removerExperiencia = (index: number) => {
    const novas = (dados.experiencias || []).filter((_, i) => i !== index);
    updateDados('experiencias', novas);
  };

  // ============================================
  // EXTRAÇÃO DE DADOS VIA IA
  // ============================================

  const handleExtrairDados = async () => {
    if (!cvOriginalTexto && !vagaInfo?.requisitos) {
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

      const result = await response.json();
      
      if (result.dados) {
        setDados(prev => ({
          ...prev,
          ...result.dados,
          nome: nomeParaCV(),
          titulo_vaga: vagaInfo?.titulo || result.dados.titulo_profissional,
          cliente_destino: vagaInfo?.cliente,
          gestor_destino: vagaInfo?.gestor
        }));
      }

      setEtapa('dados');
    } catch (err: any) {
      console.error('Erro na extração:', err);
      setError(err.message);
      setEtapa('dados');
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // GERAÇÃO DE PREVIEW
  // ============================================

  const handleGerarPreview = async () => {
    setLoading(true);
    setError(null);

    try {
      // Determinar action baseado no template
      let action = 'gerar_html_techfor_simples';
      if (templateSelecionado === 'techfor_detalhado') {
        action = 'gerar_html_techfor_detalhado';
      } else if (templateSelecionado === 'tsystems') {
        action = 'gerar_html_tsystems';
      }

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

  // ============================================
  // FINALIZAÇÃO E SALVAMENTO
  // ============================================

  const handleFinalizarCV = async () => {
    setLoading(true);
    setError(null);

    try {
      let templateId: number | undefined;
      const templateNome = templateSelecionado === 'tsystems' ? 'T-Systems' : 
                          templateSelecionado === 'techfor_detalhado' ? 'TechFor Detalhado' : 'TechFor Simples';
      const templateDB = await getTemplateByNome(templateNome);
      if (templateDB) {
        templateId = templateDB.id;
      }

      const cvSalvo = await saveCV({
        candidatura_id: candidaturaId,
        template_id: templateId,
        cv_original_url: undefined,
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
        console.log(`✅ CV salvo (ID: ${cvSalvo.id}, versão: ${cvSalvo.versao})`);
        
        if (onCVGerado) {
          onCVGerado(cvSalvo.id);
        }

        setEtapa('finalizado');
      } else {
        throw new Error('Falha ao salvar CV');
      }
    } catch (err: any) {
      console.error('❌ Erro ao finalizar CV:', err);
      setError(err.message || 'Erro ao salvar CV');
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // DOWNLOAD PDF
  // ============================================

  const handleBaixarPDF = () => {
    if (!htmlPreview) {
      alert('Nenhum CV gerado para baixar.');
      return;
    }

    const htmlCompleto = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>CV - ${dados.nome || candidatoNome}</title>
          <style>
            @media print {
              body { margin: 0; padding: 0; }
              @page { size: A4; margin: 10mm; }
            }
          </style>
        </head>
        <body>
          ${htmlCapa ? htmlCapa + '<div style="page-break-after: always;"></div>' : ''}
          ${htmlPreview}
        </body>
      </html>
    `;

    const blob = new Blob([htmlCompleto], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const printWindow = window.open(url, '_blank');
    
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  };

  // ============================================
  // NAVEGAÇÃO ENTRE ETAPAS
  // ============================================

  const getProximaEtapa = (): EtapaGeracao => {
    switch (etapa) {
      case 'template': return 'dados';
      case 'dados': return 'requisitos';
      case 'requisitos': 
        // Se for template detalhado, vai para etapa de detalhes
        return templateSelecionado === 'techfor_detalhado' ? 'detalhes' : 'parecer';
      case 'detalhes': return 'parecer';
      case 'parecer': return 'preview';
      case 'preview': return 'finalizado';
      default: return 'template';
    }
  };

  const getEtapaAnterior = (): EtapaGeracao => {
    switch (etapa) {
      case 'dados': return 'template';
      case 'requisitos': return 'dados';
      case 'detalhes': return 'requisitos';
      case 'parecer': 
        return templateSelecionado === 'techfor_detalhado' ? 'detalhes' : 'requisitos';
      case 'preview': return 'parecer';
      default: return 'template';
    }
  };

  // ============================================
  // LISTA DE ETAPAS PARA PROGRESS BAR
  // ============================================

  const getEtapasVisiveis = (): EtapaGeracao[] => {
    const base: EtapaGeracao[] = ['template', 'dados', 'requisitos'];
    
    // Adiciona etapa de detalhes se for template detalhado
    if (templateSelecionado === 'techfor_detalhado') {
      base.push('detalhes');
    }
    
    base.push('parecer', 'preview', 'finalizado');
    return base;
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className={`text-white p-6 ${
          templateSelecionado === 'tsystems' 
            ? 'bg-gradient-to-r from-pink-600 to-pink-500' 
            : 'bg-gradient-to-r from-red-700 to-red-600'
        }`}>
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                📄 Gerador de CV Padronizado v59.0
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

          {/* Progress Bar */}
          <div className="flex gap-2 mt-6">
            {getEtapasVisiveis().map((e, i) => (
              <div key={e} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  etapa === e ? 'bg-white text-red-600' :
                  getEtapasVisiveis().indexOf(etapa) > i 
                    ? 'bg-white/40 text-white' : 'bg-white/20 text-white/50'
                }`}>
                  {i + 1}
                </div>
                {i < getEtapasVisiveis().length - 1 && <div className="w-6 h-0.5 bg-white/30 mx-1" />}
              </div>
            ))}
          </div>
        </div>

        {/* Erro */}
        {error && (
          <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {/* ============================================ */}
          {/* ETAPA 1: SELEÇÃO DE TEMPLATE */}
          {/* ============================================ */}
          {etapa === 'template' && (
            <div className="space-y-6">
              <h3 className="text-xl font-bold text-center mb-8">Selecione o Template</h3>
              
              {/* Grid de 3 Templates */}
              <div className="grid grid-cols-3 gap-4 max-w-4xl mx-auto">
                
                {/* Template TechFor Simples */}
                <div
                  onClick={() => setTemplateSelecionado('techfor_simples')}
                  className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
                    templateSelecionado === 'techfor_simples' 
                      ? 'border-red-500 ring-2 ring-red-200' 
                      : 'border-gray-200 hover:border-red-300'
                  }`}
                >
                  <div className="h-28 bg-gradient-to-br from-red-700 to-red-600 rounded-lg mb-3 flex items-center justify-center">
                    <span className="text-white font-bold text-lg">TechFor</span>
                  </div>
                  <h4 className="font-bold">TechFor Simples</h4>
                  <p className="text-xs text-gray-500 mt-1">
                    Tabela de requisitos básica
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Parecer</span>
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Requisitos</span>
                  </div>
                </div>

                {/* Template TechFor Detalhado - NOVO! */}
                <div
                  onClick={() => setTemplateSelecionado('techfor_detalhado')}
                  className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
                    templateSelecionado === 'techfor_detalhado' 
                      ? 'border-red-500 ring-2 ring-red-200' 
                      : 'border-gray-200 hover:border-red-300'
                  }`}
                >
                  <div className="h-28 bg-gradient-to-br from-red-800 to-red-700 rounded-lg mb-3 flex items-center justify-center relative">
                    <span className="text-white font-bold text-lg">TechFor</span>
                    <span className="absolute top-2 right-2 bg-yellow-400 text-yellow-900 text-xs px-1.5 py-0.5 rounded font-bold">
                      NOVO
                    </span>
                  </div>
                  <h4 className="font-bold">TechFor Detalhado</h4>
                  <p className="text-xs text-gray-500 mt-1">
                    Com observações e motivos de saída
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">Observações</span>
                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">Motivo Saída</span>
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
                  <div className="h-28 bg-gradient-to-br from-pink-600 to-pink-500 rounded-lg mb-3 flex items-center justify-center">
                    <span className="text-white font-bold text-lg">T-Systems</span>
                  </div>
                  <h4 className="font-bold">T-Systems</h4>
                  <p className="text-xs text-gray-500 mt-1">
                    Layout com capa e hard skills
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    <span className="text-xs bg-pink-100 text-pink-700 px-2 py-0.5 rounded">Capa</span>
                    <span className="text-xs bg-pink-100 text-pink-700 px-2 py-0.5 rounded">Hard Skills</span>
                  </div>
                </div>
              </div>

              {/* Configuração de Privacidade */}
              <div className="max-w-2xl mx-auto mt-8 p-4 bg-gray-50 rounded-xl border border-gray-200">
                <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                  🔒 Configuração de Privacidade
                </h4>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Como o nome será exibido no CV?
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="radio" 
                        name="tipoNome" 
                        checked={tipoNome === 'completo'}
                        onChange={() => setTipoNome('completo')}
                        className="text-red-600"
                      />
                      <span className="text-sm">Nome Completo</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="radio" 
                        name="tipoNome" 
                        checked={tipoNome === 'parcial'}
                        onChange={() => setTipoNome('parcial')}
                        className="text-red-600"
                      />
                      <span className="text-sm">Parcial (José S.X.)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="radio" 
                        name="tipoNome" 
                        checked={tipoNome === 'anonimo'}
                        onChange={() => setTipoNome('anonimo')}
                        className="text-red-600"
                      />
                      <span className="text-sm">Anônimo (J.S.X.)</span>
                    </label>
                  </div>
                </div>

                {tipoNome === 'completo' && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={exibirContato}
                      onChange={e => setExibirContato(e.target.checked)}
                      className="rounded text-red-600"
                    />
                    <span className="text-sm text-gray-700">Exibir e-mail e telefone</span>
                  </label>
                )}
              </div>
            </div>
          )}

          {/* ============================================ */}
          {/* ETAPA 2: DADOS PESSOAIS */}
          {/* ============================================ */}
          {etapa === 'dados' && (
            <div className="space-y-6">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <User className="w-6 h-6" /> Dados Pessoais
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                  <input
                    type="text"
                    value={dados.nome || ''}
                    onChange={e => updateDados('nome', e.target.value)}
                    className="w-full border rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Título Profissional</label>
                  <input
                    type="text"
                    value={dados.titulo_profissional || ''}
                    onChange={e => updateDados('titulo_profissional', e.target.value)}
                    className="w-full border rounded-lg p-2"
                    placeholder="Ex: Desenvolvedor Full Stack Sênior"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Idade</label>
                  <input
                    type="number"
                    value={dados.idade || ''}
                    onChange={e => updateDados('idade', parseInt(e.target.value) || undefined)}
                    className="w-full border rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estado Civil</label>
                  <select
                    value={dados.estado_civil || ''}
                    onChange={e => updateDados('estado_civil', e.target.value)}
                    className="w-full border rounded-lg p-2"
                  >
                    <option value="">Selecione...</option>
                    {ESTADOS_CIVIS.map(ec => (
                      <option key={ec.value} value={ec.value}>{ec.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
                  <input
                    type="text"
                    value={dados.cidade || ''}
                    onChange={e => updateDados('cidade', e.target.value)}
                    className="w-full border rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estado (UF)</label>
                  <input
                    type="text"
                    value={dados.estado || ''}
                    onChange={e => updateDados('estado', e.target.value)}
                    className="w-full border rounded-lg p-2"
                    maxLength={2}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Disponibilidade</label>
                  <input
                    type="text"
                    value={dados.disponibilidade || ''}
                    onChange={e => updateDados('disponibilidade', e.target.value)}
                    className="w-full border rounded-lg p-2"
                    placeholder="Imediato, 15 dias, 30 dias..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gestor / Cliente</label>
                  <input
                    type="text"
                    value={`${dados.gestor_destino || ''}${dados.cliente_destino ? '/' + dados.cliente_destino : ''}`}
                    onChange={e => {
                      const [gestor, cliente] = e.target.value.split('/');
                      updateDados('gestor_destino', gestor?.trim());
                      updateDados('cliente_destino', cliente?.trim());
                    }}
                    className="w-full border rounded-lg p-2"
                    placeholder="Nome Gestor / Nome Cliente"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ============================================ */}
          {/* ETAPA 3: REQUISITOS */}
          {/* ============================================ */}
          {etapa === 'requisitos' && (
            <div className="space-y-6">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <CheckCircle className="w-6 h-6" /> Requisitos
              </h3>

              {/* Requisitos Mandatórios */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-bold text-yellow-800">Requisitos Mandatórios</h4>
                  <button
                    onClick={() => adicionarRequisito('mandatorio')}
                    className="text-sm bg-yellow-600 text-white px-3 py-1 rounded hover:bg-yellow-700 flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" /> Adicionar
                  </button>
                </div>

                <div className="space-y-2">
                  {/* Header da tabela */}
                  <div className={`grid gap-2 text-sm font-medium text-gray-600 px-2 ${
                    templateSelecionado === 'techfor_detalhado' 
                      ? 'grid-cols-[1fr_120px_1fr_40px]' 
                      : 'grid-cols-[1fr_120px_40px]'
                  }`}>
                    <span>Tecnologia</span>
                    <span>Tempo</span>
                    {templateSelecionado === 'techfor_detalhado' && <span>Observação</span>}
                    <span></span>
                  </div>

                  {(dados.requisitos_match || []).map((req, idx) => (
                    <div key={idx} className={`grid gap-2 items-start ${
                      templateSelecionado === 'techfor_detalhado' 
                        ? 'grid-cols-[1fr_120px_1fr_40px]' 
                        : 'grid-cols-[1fr_120px_40px]'
                    }`}>
                      <input
                        type="text"
                        value={req.tecnologia}
                        onChange={e => atualizarRequisito('mandatorio', idx, 'tecnologia', e.target.value)}
                        className="border rounded p-2 text-sm"
                        placeholder="Ex: React"
                      />
                      <input
                        type="text"
                        value={req.tempo_experiencia || ''}
                        onChange={e => atualizarRequisito('mandatorio', idx, 'tempo_experiencia', e.target.value)}
                        className="border rounded p-2 text-sm"
                        placeholder="+ 3 anos"
                      />
                      {templateSelecionado === 'techfor_detalhado' && (
                        <textarea
                          value={req.observacao || ''}
                          onChange={e => atualizarRequisito('mandatorio', idx, 'observacao', e.target.value)}
                          className="border rounded p-2 text-sm resize-none"
                          placeholder="Observação detalhada..."
                          rows={2}
                        />
                      )}
                      <button
                        onClick={() => removerRequisito('mandatorio', idx)}
                        className="text-red-500 hover:text-red-700 p-2"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  {(dados.requisitos_match || []).length === 0 && (
                    <p className="text-gray-400 text-sm text-center py-4">
                      Nenhum requisito mandatório adicionado
                    </p>
                  )}
                </div>
              </div>

              {/* Requisitos Desejáveis */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-bold text-blue-800">Requisitos Desejáveis</h4>
                  <button
                    onClick={() => adicionarRequisito('desejavel')}
                    className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" /> Adicionar
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_120px_40px] gap-2 text-sm font-medium text-gray-600 px-2">
                    <span>Tecnologia</span>
                    <span>Tempo</span>
                    <span></span>
                  </div>

                  {(dados.requisitos_desejaveis || []).map((req, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_120px_40px] gap-2 items-center">
                      <input
                        type="text"
                        value={req.tecnologia}
                        onChange={e => atualizarRequisito('desejavel', idx, 'tecnologia', e.target.value)}
                        className="border rounded p-2 text-sm"
                        placeholder="Ex: Docker"
                      />
                      <input
                        type="text"
                        value={req.tempo_experiencia || ''}
                        onChange={e => atualizarRequisito('desejavel', idx, 'tempo_experiencia', e.target.value)}
                        className="border rounded p-2 text-sm"
                        placeholder="+ 1 ano"
                      />
                      <button
                        onClick={() => removerRequisito('desejavel', idx)}
                        className="text-red-500 hover:text-red-700 p-2"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  {(dados.requisitos_desejaveis || []).length === 0 && (
                    <p className="text-gray-400 text-sm text-center py-4">
                      Nenhum requisito desejável adicionado
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ============================================ */}
          {/* ETAPA 4: DETALHES (OBSERVAÇÕES E MOTIVOS) - NOVO! */}
          {/* ============================================ */}
          {etapa === 'detalhes' && templateSelecionado === 'techfor_detalhado' && (
            <div className="space-y-6">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Edit3 className="w-6 h-6" /> Detalhes Adicionais
              </h3>
              
              <p className="text-gray-600 text-sm">
                Preencha as observações detalhadas para cada requisito e o motivo de saída para cada experiência profissional.
              </p>

              {/* Seção: Observações dos Requisitos */}
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <h4 className="font-bold text-orange-800 mb-4 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" /> Observações dos Requisitos Mandatórios
                </h4>
                
                {(dados.requisitos_match || []).length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-4">
                    Nenhum requisito mandatório cadastrado. Volte à etapa anterior.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {(dados.requisitos_match || []).map((req, idx) => (
                      <div key={idx} className="bg-white rounded-lg p-3 border">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-medium text-gray-800">{req.tecnologia || `Requisito ${idx + 1}`}</span>
                          <span className="text-sm text-gray-500">{req.tempo_experiencia}</span>
                        </div>
                        <textarea
                          value={req.observacao || ''}
                          onChange={e => atualizarRequisito('mandatorio', idx, 'observacao', e.target.value)}
                          className="w-full border rounded p-2 text-sm"
                          placeholder="Descreva a experiência do candidato com esta tecnologia, projetos relevantes, nível de proficiência..."
                          rows={3}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Seção: Motivos de Saída */}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <h4 className="font-bold text-purple-800 mb-4 flex items-center gap-2">
                  <Briefcase className="w-5 h-5" /> Motivo de Saída por Experiência
                </h4>

                {(dados.experiencias || []).length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-gray-400 text-sm mb-2">
                      Nenhuma experiência cadastrada.
                    </p>
                    <button
                      onClick={adicionarExperiencia}
                      className="text-sm bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700"
                    >
                      + Adicionar Experiência
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(dados.experiencias || []).map((exp, idx) => (
                      <div key={idx} className="bg-white rounded-lg p-4 border">
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Empresa</label>
                            <input
                              type="text"
                              value={exp.empresa}
                              onChange={e => atualizarExperiencia(idx, 'empresa', e.target.value)}
                              className="w-full border rounded p-2 text-sm"
                              placeholder="Nome da empresa"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Cargo</label>
                            <input
                              type="text"
                              value={exp.cargo}
                              onChange={e => atualizarExperiencia(idx, 'cargo', e.target.value)}
                              className="w-full border rounded p-2 text-sm"
                              placeholder="Cargo ocupado"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Período</label>
                            <div className="flex gap-2 items-center">
                              <input
                                type="text"
                                value={exp.data_inicio}
                                onChange={e => atualizarExperiencia(idx, 'data_inicio', e.target.value)}
                                className="w-24 border rounded p-2 text-sm"
                                placeholder="MM/AAAA"
                              />
                              <span className="text-gray-400">até</span>
                              <input
                                type="text"
                                value={exp.data_fim || ''}
                                onChange={e => atualizarExperiencia(idx, 'data_fim', e.target.value)}
                                className="w-24 border rounded p-2 text-sm"
                                placeholder={exp.atual ? 'Atual' : 'MM/AAAA'}
                                disabled={exp.atual}
                              />
                              <label className="flex items-center gap-1 text-sm text-gray-600">
                                <input
                                  type="checkbox"
                                  checked={exp.atual}
                                  onChange={e => atualizarExperiencia(idx, 'atual', e.target.checked)}
                                  className="rounded"
                                />
                                Atual
                              </label>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Cliente (se consultoria)</label>
                            <input
                              type="text"
                              value={exp.cliente || ''}
                              onChange={e => atualizarExperiencia(idx, 'cliente', e.target.value)}
                              className="w-full border rounded p-2 text-sm"
                              placeholder="Nome do cliente onde estava alocado"
                            />
                          </div>
                        </div>

                        <div className="mb-3">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Principais Atividades</label>
                          <textarea
                            value={(exp.principais_atividades || []).join('\n')}
                            onChange={e => atualizarExperiencia(idx, 'principais_atividades', e.target.value.split('\n').filter(a => a.trim()))}
                            className="w-full border rounded p-2 text-sm"
                            placeholder="Uma atividade por linha..."
                            rows={3}
                          />
                        </div>

                        {/* Campo Motivo de Saída */}
                        {!exp.atual && (
                          <div className="bg-purple-100 rounded p-3">
                            <label className="block text-xs font-medium text-purple-700 mb-1">
                              📝 Motivo de Saída
                            </label>
                            <textarea
                              value={exp.motivo_saida || ''}
                              onChange={e => atualizarExperiencia(idx, 'motivo_saida', e.target.value)}
                              className="w-full border border-purple-300 rounded p-2 text-sm"
                              placeholder="Ex: Reestruturação da empresa, proposta mais atrativa, término de contrato..."
                              rows={2}
                            />
                          </div>
                        )}

                        <div className="flex justify-end mt-2">
                          <button
                            onClick={() => removerExperiencia(idx)}
                            className="text-sm text-red-600 hover:text-red-800 flex items-center gap-1"
                          >
                            <Trash2 className="w-4 h-4" /> Remover
                          </button>
                        </div>
                      </div>
                    ))}

                    <button
                      onClick={adicionarExperiencia}
                      className="w-full text-sm border-2 border-dashed border-purple-300 text-purple-600 px-4 py-3 rounded-lg hover:bg-purple-50 flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" /> Adicionar Experiência
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============================================ */}
          {/* ETAPA 5: PARECER DE SELEÇÃO */}
          {/* ============================================ */}
          {etapa === 'parecer' && (
            <div className="space-y-6">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <FileText className="w-6 h-6" /> Parecer de Seleção
              </h3>

              <p className="text-gray-600 text-sm">
                Escreva o parecer de seleção do candidato.
              </p>

              <textarea
                value={dados.parecer_selecao || ''}
                onChange={e => updateDados('parecer_selecao', e.target.value)}
                className="w-full border rounded p-4 h-64 text-sm"
                placeholder={`Profissional com X anos de experiência na área de TI, atuando em empresas do segmento de: ...

Neste período desenvolveu competências em: ...

Em situação de entrevista demonstrou: ...

Brasileiro, XX anos, estado civil. Reside em Cidade, UF.`}
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

              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dados.participando_outros_processos || false}
                    onChange={e => updateDados('participando_outros_processos', e.target.checked)}
                    className="rounded text-red-600"
                  />
                  <span className="text-sm">Participando de outros processos no mercado</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dados.participando_processo_cliente || false}
                    onChange={e => updateDados('participando_processo_cliente', e.target.checked)}
                    className="rounded text-red-600"
                  />
                  <span className="text-sm">Participando de processo neste cliente</span>
                </label>
              </div>
            </div>
          )}

          {/* ============================================ */}
          {/* ETAPA 6: PREVIEW */}
          {/* ============================================ */}
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
                    onClick={handleBaixarPDF}
                    className="text-green-600 hover:underline text-sm flex items-center gap-1"
                  >
                    <Download className="w-4 h-4" /> Imprimir/PDF
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

          {/* ============================================ */}
          {/* ETAPA 7: FINALIZADO */}
          {/* ============================================ */}
          {etapa === 'finalizado' && (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">✅</div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">CV Gerado com Sucesso!</h3>
              <p className="text-gray-500 mb-4">
                Template: {templateSelecionado === 'tsystems' ? 'T-Systems' : 
                          templateSelecionado === 'techfor_detalhado' ? 'TechFor Detalhado' : 'TechFor Simples'}
              </p>
              
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
                  onClick={handleBaixarPDF}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                >
                  <Download className="w-5 h-5" /> Baixar PDF
                </button>
                <button 
                  onClick={() => setEtapa('preview')}
                  className="px-6 py-3 border rounded-lg hover:bg-gray-50 flex items-center gap-2"
                >
                  <Eye className="w-5 h-5" /> Ver Preview
                </button>
                
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
                    className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                  >
                    <CheckCircle className="w-5 h-5" /> Aprovar para Envio
                  </button>
                )}
                
                {cvAtual?.aprovado && (
                  <span className="px-6 py-3 bg-green-100 text-green-800 rounded-lg flex items-center gap-2">
                    <CheckCircle className="w-5 h-5" /> CV Aprovado
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
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                {loading ? 'Processando...' : 'Próximo'}
              </button>
            )}

            {etapa === 'dados' && (
              <>
                <button onClick={() => setEtapa('template')} className="px-4 py-2 border rounded-lg flex items-center gap-1">
                  <ChevronLeft className="w-4 h-4" /> Voltar
                </button>
                <button
                  onClick={() => setEtapa('requisitos')}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"
                >
                  Próximo <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}

            {etapa === 'requisitos' && (
              <>
                <button onClick={() => setEtapa('dados')} className="px-4 py-2 border rounded-lg flex items-center gap-1">
                  <ChevronLeft className="w-4 h-4" /> Voltar
                </button>
                <button
                  onClick={() => setEtapa(getProximaEtapa())}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"
                >
                  Próximo <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}

            {etapa === 'detalhes' && (
              <>
                <button onClick={() => setEtapa('requisitos')} className="px-4 py-2 border rounded-lg flex items-center gap-1">
                  <ChevronLeft className="w-4 h-4" /> Voltar
                </button>
                <button
                  onClick={() => setEtapa('parecer')}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"
                >
                  Próximo <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}

            {etapa === 'parecer' && (
              <>
                <button 
                  onClick={() => setEtapa(getEtapaAnterior())} 
                  className="px-4 py-2 border rounded-lg flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" /> Voltar
                </button>
                <button
                  onClick={handleGerarPreview}
                  disabled={loading}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                  {loading ? 'Gerando...' : 'Gerar Preview'}
                </button>
              </>
            )}

            {etapa === 'preview' && (
              <>
                <button onClick={() => setEtapa('parecer')} className="px-4 py-2 border rounded-lg flex items-center gap-1">
                  <ChevronLeft className="w-4 h-4" /> Editar
                </button>
                <button
                  onClick={handleFinalizarCV}
                  disabled={loading || loadingCV}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {loading || loadingCV ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {loading || loadingCV ? 'Salvando...' : 'Finalizar CV'}
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
