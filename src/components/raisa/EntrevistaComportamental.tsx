/**
 * EntrevistaComportamental.tsx - Aba de Entrevista Comportamental
 * Caminho: src/components/raisa/EntrevistaComportamental.tsx
 * 
 * Baseado no CVGeneratorV2.tsx - Adaptado para funcionar como aba
 * dentro do EntrevistaTecnicaInteligente.
 * 
 * Diferenças do CVGeneratorV2:
 * - NÃO é um modal (renderiza inline)
 * - Recebe candidatura/vaga do componente pai (seleção compartilhada)
 * - Título: "Entrevista Comportamental" (não "Gerador de CV")
 * - Mensagem final: "CV Parcial Gerado com Sucesso!"
 * - Botão verde: "Encerrar Entrevista"
 * - Salva CV parcial no Supabase
 * 
 * Versão: 1.0
 * Data: 25/02/2026
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
import { supabase } from '@/config/supabase';
import { useCVGenerator } from '@/hooks/supabase/useCVGenerator';
import { useCVTemplates } from '@/hooks/supabase/useCVTemplates';
import {
  Loader2, Save, Eye, ChevronLeft, ChevronRight, 
  Plus, Trash2, FileText, CheckCircle, Wand2
} from 'lucide-react';

// ============================================
// TIPOS
// ============================================

interface EntrevistaComportamentalProps {
  // Dados da candidatura selecionada (vem do pai)
  candidaturaId: number;
  candidatoNome: string;
  pessoaId?: number;
  vagaInfo?: {
    id: number;
    titulo: string;
    codigo?: string;
    cliente?: string;
    gestor?: string;
    requisitos?: string;
    requisitos_desejaveis?: string;
    stack_tecnologica?: string;
  };
  currentUserId?: number;
  onEntrevistaFinalizada?: (cvId: number) => void;
}

type TipoNomeCV = 'completo' | 'parcial' | 'anonimo';
type EtapaGeracao = 'template' | 'dados' | 'requisitos' | 'detalhes' | 'parecer' | 'preview' | 'finalizado';
type TemplateType = 'techfor' | 'techfor_simples' | 'tsystems';

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const EntrevistaComportamental: React.FC<EntrevistaComportamentalProps> = ({
  candidaturaId,
  candidatoNome,
  pessoaId,
  vagaInfo,
  currentUserId,
  onEntrevistaFinalizada
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
  const [templateSelecionado, setTemplateSelecionado] = useState<TemplateType>('techfor');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cvSalvoId, setCvSalvoId] = useState<number | null>(null);
  
  // Dados da pessoa (carregados do Supabase)
  const [pessoaDados, setPessoaDados] = useState<{
    nome_anoni_parcial?: string;
    nome_anoni_total?: string;
    email?: string;
    telefone?: string;
    cidade?: string;
    estado?: string;
  }>({});
  const [cvOriginalTexto, setCvOriginalTexto] = useState<string>('');

  // Configuração de nome
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
    email: '',
    telefone: '',
    cidade: '',
    estado: '',
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

  // Atualizar campo genérico
  const updateDados = <K extends keyof DadosCandidatoTechfor>(
    campo: K, 
    valor: DadosCandidatoTechfor[K]
  ) => {
    setDados(prev => ({ ...prev, [campo]: valor }));
  };

  // ============================================
  // PARSER: Texto livre → Itens de requisitos
  // ============================================

  /**
   * Converte texto livre de requisitos (separados por ;, \n, •, -, números)
   * em array de RequisitoMatch para pré-preencher o form
   */
  const parsearRequisitosTexto = (texto: string | undefined | string[], tipo: 'mandatorio' | 'desejavel'): RequisitoMatch[] => {
    if (!texto) return [];

    let itens: string[] = [];

    // Caso 1: Já é um array (veio parseado do Supabase)
    if (Array.isArray(texto)) {
      itens = texto.map(item => String(item).trim()).filter(item => item.length > 2);
    } else {
      const textoStr = String(texto).trim();
      if (textoStr === '') return [];

      // Caso 2: É uma string JSON de array → parsear ["item1", "item2"]
      if (textoStr.startsWith('[')) {
        try {
          const parsed = JSON.parse(textoStr);
          if (Array.isArray(parsed)) {
            itens = parsed.map((item: any) => String(item).trim()).filter((item: string) => item.length > 2);
          }
        } catch {
          // Se falhar o parse JSON, tratar como texto livre
        }
      }
      
      // Caso 3: Texto livre → separar por \n ; • · números
      if (itens.length === 0) {
        itens = textoStr
          .split(/[\n;•·]|(?:\d+\.\s)/)
          .map(item => item.replace(/^[-–—\s*]+/, '').trim())
          .filter(item => item.length > 2);
      }
    }

    return itens.map(item => {
      // Tentar extrair tempo de experiência do texto (ex: "Java +5 anos", "SAP ABAP (3 anos)")
      const tempoMatch = item.match(/[+>]?\s*(\d+)\s*(?:anos?|years?|a\.)/i);
      const tempo = tempoMatch ? `+ ${tempoMatch[1]} anos` : '';
      
      // Remover o tempo do nome da tecnologia para ficar limpo
      const tecnologia = item
        .replace(/[+>]?\s*\d+\s*(?:anos?|years?|a\.)\s*/gi, '')
        .replace(/\(?\s*\)?$/g, '')
        .trim();

      return {
        tecnologia,
        tempo_experiencia: tempo,
        observacao: '',
        tipo,
        atendido: false
      } as RequisitoMatch;
    });
  };

  /**
   * Converte stack_tecnologica (string, array ou JSON) em hard_skills_tabela
   */
  const parsearStackEmHardSkills = (stack: string | undefined | string[]): { tecnologia: string; tempo_experiencia: string; observacao?: string }[] => {
    if (!stack) return [];

    let itens: string[] = [];

    if (Array.isArray(stack)) {
      itens = stack.map(item => String(item).trim()).filter(item => item.length > 0);
    } else {
      const stackStr = String(stack).trim();
      if (stackStr === '') return [];

      // Tentar parse JSON
      if (stackStr.startsWith('[')) {
        try {
          const parsed = JSON.parse(stackStr);
          if (Array.isArray(parsed)) {
            itens = parsed.map((item: any) => String(item).trim()).filter((item: string) => item.length > 0);
          }
        } catch {
          // fallback
        }
      }

      // Fallback: separar por vírgula/ponto e vírgula
      if (itens.length === 0) {
        itens = stackStr.split(/[,;]/).map(item => item.trim()).filter(item => item.length > 0);
      }
    }

    return itens.map(item => ({
      tecnologia: item,
      tempo_experiencia: '',
      observacao: ''
    }));
  };

  // ============================================
  // CARREGAR DADOS INICIAIS
  // ============================================

  useEffect(() => {
    const init = async () => {
      // 1. Carregar templates
      await loadTemplates();
      
      // 2. Carregar dados da pessoa
      if (pessoaId) {
        const { data: pessoa } = await supabase
          .from('pessoas')
          .select('nome, email, telefone, cidade, estado, bairro, cep, cpf, rg, data_nascimento, pretensao_salarial, nome_anoni_parcial, nome_anoni_total, cv_texto_original')
          .eq('id', pessoaId)
          .single();

        if (pessoa) {
          setPessoaDados({
            nome_anoni_parcial: pessoa.nome_anoni_parcial,
            nome_anoni_total: pessoa.nome_anoni_total,
            email: pessoa.email,
            telefone: pessoa.telefone,
            cidade: pessoa.cidade,
            estado: pessoa.estado
          });
          setCvOriginalTexto(pessoa.cv_texto_original || '');
          
          // Calcular idade a partir da data de nascimento
          let idadeCalculada: number | undefined;
          if (pessoa.data_nascimento) {
            const nascimento = new Date(pessoa.data_nascimento);
            const hoje = new Date();
            idadeCalculada = hoje.getFullYear() - nascimento.getFullYear();
            const m = hoje.getMonth() - nascimento.getMonth();
            if (m < 0 || (m === 0 && hoje.getDate() < nascimento.getDate())) {
              idadeCalculada--;
            }
          }
          
          // Atualizar dados iniciais com info da pessoa
          setDados(prev => ({
            ...prev,
            nome: pessoa.nome || candidatoNome,
            email: pessoa.email || '',
            telefone: pessoa.telefone || '',
            cidade: pessoa.cidade || '',
            estado: pessoa.estado || '',
            bairro: pessoa.bairro || '',
            cep: pessoa.cep || '',
            cpf: pessoa.cpf || '',
            rg: pessoa.rg || '',
            data_nascimento: pessoa.data_nascimento || '',
            idade: idadeCalculada,
            pretensao_salarial: pessoa.pretensao_salarial ? String(pessoa.pretensao_salarial) : ''
          }));
        }
      }

      // 3. Carregar CV existente (se houver)
      const cvExistente = await loadCVByCandidatura(candidaturaId);
      if (cvExistente) {
        // Mesclar: dados do CV salvo + dados frescos da pessoa (email, telefone, etc.)
        // Prioridade: CV salvo para campos de conteúdo, pessoa para dados de contato vazios
        setDados(prev => {
          const cvDados = cvExistente.dados_processados;
          return {
            ...prev,          // dados iniciais (email, telefone da pessoa)
            ...cvDados,       // dados do CV salvo (experiencias, requisitos, etc.)
            // Garantir que dados de contato da pessoa prevaleçam se estiverem vazios no CV salvo
            email: cvDados.email || prev.email || '',
            telefone: cvDados.telefone || prev.telefone || '',
            cidade: cvDados.cidade || prev.cidade || '',
            estado: cvDados.estado || prev.estado || '',
            bairro: cvDados.bairro || prev.bairro || '',
            cep: cvDados.cep || prev.cep || '',
            cpf: cvDados.cpf || prev.cpf || '',
            rg: cvDados.rg || prev.rg || '',
            data_nascimento: cvDados.data_nascimento || prev.data_nascimento || '',
            idade: cvDados.idade || prev.idade,
            pretensao_salarial: cvDados.pretensao_salarial || prev.pretensao_salarial || '',
            estado_civil: cvDados.estado_civil || prev.estado_civil || ''
          };
        });
        console.log('📋 CV existente carregado (versão ' + cvExistente.versao + ')');
      } else {
        // ✅ CV NÃO existe: Pré-preencher requisitos a partir da vaga
        console.log('🔧 CV não encontrado, pré-preenchendo requisitos da vaga...');
        
        const requisitosMandatorios = parsearRequisitosTexto(vagaInfo?.requisitos, 'mandatorio');
        const requisitosDesejaveis = parsearRequisitosTexto(vagaInfo?.requisitos_desejaveis, 'desejavel');
        const hardSkills = parsearStackEmHardSkills(vagaInfo?.stack_tecnologica);

        if (requisitosMandatorios.length > 0 || requisitosDesejaveis.length > 0 || hardSkills.length > 0) {
          setDados(prev => ({
            ...prev,
            requisitos_match: requisitosMandatorios.length > 0 ? requisitosMandatorios : prev.requisitos_match,
            requisitos_desejaveis: requisitosDesejaveis.length > 0 ? requisitosDesejaveis : prev.requisitos_desejaveis,
            hard_skills_tabela: hardSkills.length > 0 ? hardSkills : prev.hard_skills_tabela
          }));
          console.log(`✅ Pré-preenchido: ${requisitosMandatorios.length} mandatórios, ${requisitosDesejaveis.length} desejáveis, ${hardSkills.length} hard skills`);
        }
      }
    };
    init();
  }, [candidaturaId, pessoaId, loadTemplates, loadCVByCandidatura]);

  // Atualizar nome quando tipo muda
  useEffect(() => {
    setDados(prev => ({
      ...prev,
      nome: nomeParaCV(),
      email: (tipoNome === 'completo' && exibirContato) ? (pessoaDados?.email || '') : '',
      telefone: (tipoNome === 'completo' && exibirContato) ? (pessoaDados?.telefone || '') : '',
      cidade: (tipoNome === 'completo' && exibirContato) ? (pessoaDados?.cidade || '') : '',
      estado: (tipoNome === 'completo' && exibirContato) ? (pessoaDados?.estado || '') : ''
    }));
  }, [tipoNome, exibirContato]);

  // ============================================
  // HANDLERS
  // ============================================

  // Extrair dados do CV com IA
  const handleExtrairDados = async () => {
    // Se CV já foi carregado do banco (versão existente), pular extração IA
    if (cvAtual && cvAtual.dados_processados) {
      console.log('📋 CV já carregado do banco, pulando extração IA');
      setEtapa('dados');
      return;
    }

    // Se não tem texto do CV original, ir direto para dados (preenchimento manual)
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
      // Se falhar a extração, não bloquear - permitir edição manual
      console.warn('⚠️ Extração IA falhou, permitindo edição manual:', err.message);
      setError('Extração automática falhou. Você pode preencher os dados manualmente.');
      setEtapa('dados');
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

  // Gerar preview HTML
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

  // Finalizar e salvar CV parcial
  const handleFinalizarEntrevista = async () => {
    setLoading(true);
    setError(null);

    try {
      // Buscar template_id
      let templateId: number | undefined;
      const templateNome = templateSelecionado === 'tsystems' ? 'T-Systems' : 'Techfor';
      const templateDB = await getTemplateByNome(templateNome);
      if (templateDB) {
        templateId = templateDB.id;
      }

      // ✅ Persistir novos campos na tabela pessoas (UPDATE)
      if (pessoaId) {
        const pessoaUpdate: Record<string, any> = {
          cidade: dados.cidade || null,
          estado: dados.estado || null,
          bairro: dados.bairro || null,
          cep: dados.cep || null,
          cpf: dados.cpf || null,
          rg: dados.rg || null,
          data_nascimento: dados.data_nascimento || null,
          valor_hora_atual: dados.valor_hora_atual || null,
          pretensao_valor_hora: dados.pretensao_valor_hora || null,
          ja_trabalhou_pj: dados.ja_trabalhou_pj || false,
          aceita_pj: dados.aceita_pj || false,
          possui_empresa: dados.possui_empresa || false,
          aceita_abrir_empresa: dados.aceita_abrir_empresa || false,
          telefone: dados.telefone || null,
          email: dados.email || null,
          atualizado_em: new Date().toISOString()
        };

        const { error: errPessoa } = await supabase
          .from('pessoas')
          .update(pessoaUpdate)
          .eq('id', pessoaId);

        if (errPessoa) {
          console.warn('⚠️ Erro ao atualizar pessoa (não bloqueante):', errPessoa);
        } else {
          console.log('✅ Dados da pessoa atualizados no Supabase');
        }
      }

      // Salvar CV parcial no Supabase
      const cvSalvo = await saveCV({
        candidatura_id: candidaturaId,
        template_id: templateId,
        dados_processados: dados,
        cv_html: htmlPreview,
        gerado_por: currentUserId,
        metadados: {
          template_tipo: templateSelecionado,
          tem_capa: !!htmlCapa,
          vaga_info: vagaInfo,
          tipo: 'cv_parcial',
          origem: 'entrevista_comportamental'
        }
      });

      if (cvSalvo) {
        setCvSalvoId(cvSalvo.id);
        console.log('✅ CV parcial salvo (ID: ' + cvSalvo.id + ')');
        
        if (onEntrevistaFinalizada) {
          onEntrevistaFinalizada(cvSalvo.id);
        }

        setEtapa('finalizado');
      } else {
        throw new Error('Falha ao salvar CV parcial');
      }
    } catch (err: any) {
      console.error('❌ Erro ao finalizar entrevista:', err);
      setError(err.message || 'Erro ao salvar CV parcial');
    } finally {
      setLoading(false);
    }
  };

  // Baixar/Imprimir PDF
  const handleBaixarPDF = () => {
    if (!htmlPreview) return;

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

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlCompleto);
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 500);
    }
  };

  // ============================================
  // ETAPAS DO WIZARD
  // ============================================

  const etapas: EtapaGeracao[] = ['template', 'dados', 'requisitos', 'detalhes', 'parecer', 'preview', 'finalizado'];
  const etapaIndex = etapas.indexOf(etapa);

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={`rounded-xl p-5 text-white ${
        templateSelecionado === 'tsystems' 
          ? 'bg-gradient-to-r from-pink-600 to-pink-500' 
          : 'bg-gradient-to-r from-red-700 to-red-600'
      }`}>
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              📋 Entrevista Comportamental
            </h2>
            <p className="text-white/80 mt-1">{candidatoNome}</p>
            {vagaInfo && (
              <p className="text-white/60 text-sm mt-1">
                {vagaInfo.titulo} {vagaInfo.codigo && `- ${vagaInfo.codigo}`}
              </p>
            )}
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex gap-2 mt-5">
          {etapas.filter(e => e !== 'finalizado').map((e, i) => (
            <div key={e} className="flex items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                etapa === e ? 'bg-white text-red-600' :
                etapaIndex > i ? 'bg-white/40 text-white' : 'bg-white/20 text-white/50'
              }`}>
                {etapaIndex > i ? '✓' : i + 1}
              </div>
              {i < etapas.length - 2 && <div className="w-5 h-0.5 bg-white/30 mx-1" />}
            </div>
          ))}
        </div>
      </div>

      {/* Erro */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* ============================================ */}
      {/* ETAPA 1: SELEÇÃO DE TEMPLATE */}
      {/* ============================================ */}
      {etapa === 'template' && (
        <div className="space-y-6">
          <h3 className="text-lg font-bold text-center">Selecione o Template do CV</h3>
          
          <div className="grid grid-cols-2 gap-6 max-w-2xl mx-auto">
            {/* Techfor */}
            <div
              onClick={() => setTemplateSelecionado('techfor')}
              className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
                templateSelecionado === 'techfor' || templateSelecionado === 'techfor_simples'
                  ? 'border-red-500 bg-red-50 shadow-lg' 
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="text-center">
                <div className="text-4xl mb-3">📄</div>
                <h4 className="font-bold text-gray-800">TechFor</h4>
                <p className="text-xs text-gray-500 mt-1">Padrão com requisitos e parecer</p>
              </div>
            </div>

            {/* T-Systems */}
            <div
              onClick={() => setTemplateSelecionado('tsystems')}
              className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
                templateSelecionado === 'tsystems' 
                  ? 'border-pink-500 bg-pink-50 shadow-lg' 
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="text-center">
                <div className="text-4xl mb-3">🎯</div>
                <h4 className="font-bold text-gray-800">T-Systems</h4>
                <p className="text-xs text-gray-500 mt-1">Layout magenta com capa</p>
              </div>
            </div>
          </div>

          {/* Config nome/contato */}
          <div className="bg-gray-50 rounded-lg p-4 max-w-2xl mx-auto">
            <h4 className="font-semibold text-gray-700 mb-3">Configuração do Nome</h4>
            <div className="flex gap-4">
              {(['completo', 'parcial', 'anonimo'] as TipoNomeCV[]).map(tipo => (
                <label key={tipo} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="tipoNome"
                    checked={tipoNome === tipo}
                    onChange={() => setTipoNome(tipo)}
                    className="text-blue-600"
                  />
                  <span className="text-sm capitalize">{tipo}</span>
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 mt-3 cursor-pointer">
              <input
                type="checkbox"
                checked={exibirContato}
                onChange={e => setExibirContato(e.target.checked)}
                className="text-blue-600"
              />
              <span className="text-sm text-gray-600">Exibir dados de contato</span>
            </label>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* ETAPA 2: DADOS PESSOAIS */}
      {/* ============================================ */}
      {etapa === 'dados' && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold">Dados do Candidato</h3>
          <p className="text-sm text-gray-500">
            Valide e complemente os dados durante a entrevista comportamental.
          </p>
          
          {/* Linha 1: Nome / Email / Telefone */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
              <input
                type="text"
                value={dados.nome || ''}
                onChange={e => updateDados('nome', e.target.value)}
                className="w-full border rounded-lg p-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={dados.email || ''}
                onChange={e => updateDados('email', e.target.value)}
                className="w-full border rounded-lg p-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
              <input
                type="text"
                value={dados.telefone || ''}
                onChange={e => updateDados('telefone', e.target.value)}
                className="w-full border rounded-lg p-2.5 text-sm"
              />
            </div>
          </div>
          
          {/* Linha 2: Cidade / Bairro / UF / CEP */}
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
              <input
                type="text"
                value={dados.cidade || ''}
                onChange={e => updateDados('cidade', e.target.value)}
                className="w-full border rounded-lg p-2.5 text-sm"
                placeholder="Cidade"
              />
            </div>
            <div className="col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Bairro</label>
              <input
                type="text"
                value={dados.bairro || ''}
                onChange={e => updateDados('bairro', e.target.value)}
                className="w-full border rounded-lg p-2.5 text-sm"
                placeholder="Bairro"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">UF</label>
              <input
                type="text"
                value={dados.estado || ''}
                onChange={e => updateDados('estado', e.target.value)}
                className="w-full border rounded-lg p-2.5 text-sm"
                placeholder="UF"
                maxLength={2}
              />
            </div>
            <div className="col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
              <input
                type="text"
                value={dados.cep || ''}
                onChange={e => updateDados('cep', e.target.value)}
                className="w-full border rounded-lg p-2.5 text-sm"
                placeholder="00000-000"
              />
            </div>
          </div>

          {/* Linha 3: Data Nascimento / Idade / Estado Civil */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data de Nascimento</label>
              <input
                type="date"
                value={dados.data_nascimento || ''}
                onChange={e => {
                  const dataNasc = e.target.value;
                  updateDados('data_nascimento', dataNasc);
                  // Calcular idade automaticamente
                  if (dataNasc) {
                    const nascimento = new Date(dataNasc);
                    const hoje = new Date();
                    let idadeCalc = hoje.getFullYear() - nascimento.getFullYear();
                    const m = hoje.getMonth() - nascimento.getMonth();
                    if (m < 0 || (m === 0 && hoje.getDate() < nascimento.getDate())) {
                      idadeCalc--;
                    }
                    updateDados('idade', idadeCalc);
                  }
                }}
                className="w-full border rounded-lg p-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Idade</label>
              <input
                type="number"
                value={dados.idade || ''}
                onChange={e => updateDados('idade', parseInt(e.target.value) || undefined)}
                className="w-full border rounded-lg p-2.5 text-sm bg-gray-50"
                readOnly={!!dados.data_nascimento}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estado Civil</label>
              <select
                value={dados.estado_civil || ''}
                onChange={e => updateDados('estado_civil', e.target.value)}
                className="w-full border rounded-lg p-2.5 text-sm"
              >
                <option value="">Selecione...</option>
                {ESTADOS_CIVIS.map(ec => (
                  <option key={ec.value} value={ec.value}>{ec.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Linha 4: CPF / RG */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">C.P.F.</label>
              <input
                type="text"
                value={dados.cpf || ''}
                onChange={e => updateDados('cpf', e.target.value)}
                className="w-full border rounded-lg p-2.5 text-sm"
                placeholder="000.000.000-00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">R.G.</label>
              <input
                type="text"
                value={dados.rg || ''}
                onChange={e => updateDados('rg', e.target.value)}
                className="w-full border rounded-lg p-2.5 text-sm"
                placeholder="00.000.000-0"
              />
            </div>
          </div>

          {/* Linha 5: Valor Hora Atual / Pretensão */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor Hora/Salário Atual (R$)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">R$</span>
                <input
                  type="number"
                  step="0.01"
                  value={dados.valor_hora_atual || ''}
                  onChange={e => updateDados('valor_hora_atual', parseFloat(e.target.value) || undefined)}
                  className="w-full border rounded-lg p-2.5 pl-10 text-sm"
                  placeholder="0,00"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pretensão Valor Hora/Salário (R$)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">R$</span>
                <input
                  type="number"
                  step="0.01"
                  value={dados.pretensao_valor_hora || ''}
                  onChange={e => updateDados('pretensao_valor_hora', parseFloat(e.target.value) || undefined)}
                  className="w-full border rounded-lg p-2.5 pl-10 text-sm"
                  placeholder="0,00"
                />
              </div>
            </div>
          </div>

          {/* Linha 6: Flags PJ - Já trabalhou / Aceita */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-6 border rounded-lg p-2.5">
              <label className="block text-sm font-medium text-gray-700">Já trabalhou como PJ?</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-1 text-sm cursor-pointer">
                  <input type="radio" name="ja_pj" checked={dados.ja_trabalhou_pj === true}
                    onChange={() => updateDados('ja_trabalhou_pj', true)} className="text-blue-600" /> Sim
                </label>
                <label className="flex items-center gap-1 text-sm cursor-pointer">
                  <input type="radio" name="ja_pj" checked={dados.ja_trabalhou_pj === false || dados.ja_trabalhou_pj === undefined}
                    onChange={() => updateDados('ja_trabalhou_pj', false)} className="text-blue-600" /> Não
                </label>
              </div>
            </div>
            <div className="flex items-center gap-6 border rounded-lg p-2.5">
              <label className="block text-sm font-medium text-gray-700">Aceita trabalhar como PJ?</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-1 text-sm cursor-pointer">
                  <input type="radio" name="aceita_pj" checked={dados.aceita_pj === true}
                    onChange={() => updateDados('aceita_pj', true)} className="text-blue-600" /> Sim
                </label>
                <label className="flex items-center gap-1 text-sm cursor-pointer">
                  <input type="radio" name="aceita_pj" checked={dados.aceita_pj === false || dados.aceita_pj === undefined}
                    onChange={() => updateDados('aceita_pj', false)} className="text-blue-600" /> Não
                </label>
              </div>
            </div>
          </div>

          {/* Linha 7: Flags PJ - Possui empresa / Aceita abrir */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-6 border rounded-lg p-2.5">
              <label className="block text-sm font-medium text-gray-700">Possui empresa aberta?</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-1 text-sm cursor-pointer">
                  <input type="radio" name="possui_emp" checked={dados.possui_empresa === true}
                    onChange={() => updateDados('possui_empresa', true)} className="text-blue-600" /> Sim
                </label>
                <label className="flex items-center gap-1 text-sm cursor-pointer">
                  <input type="radio" name="possui_emp" checked={dados.possui_empresa === false || dados.possui_empresa === undefined}
                    onChange={() => updateDados('possui_empresa', false)} className="text-blue-600" /> Não
                </label>
              </div>
            </div>
            <div className="flex items-center gap-6 border rounded-lg p-2.5">
              <label className="block text-sm font-medium text-gray-700">Aceita abrir empresa?</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-1 text-sm cursor-pointer">
                  <input type="radio" name="aceita_abrir" checked={dados.aceita_abrir_empresa === true}
                    onChange={() => updateDados('aceita_abrir_empresa', true)} className="text-blue-600" /> Sim
                </label>
                <label className="flex items-center gap-1 text-sm cursor-pointer">
                  <input type="radio" name="aceita_abrir" checked={dados.aceita_abrir_empresa === false || dados.aceita_abrir_empresa === undefined}
                    onChange={() => updateDados('aceita_abrir_empresa', false)} className="text-blue-600" /> Não
                </label>
              </div>
            </div>
          </div>

          {/* Linha 8: Disponibilidade / Modalidade */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Disponibilidade</label>
              <input
                type="text"
                value={dados.disponibilidade || ''}
                onChange={e => updateDados('disponibilidade', e.target.value)}
                className="w-full border rounded-lg p-2.5 text-sm"
                placeholder="Imediata, 15 dias, 30 dias..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Modalidade</label>
              <select
                value={dados.modalidade_trabalho || ''}
                onChange={e => updateDados('modalidade_trabalho', e.target.value)}
                className="w-full border rounded-lg p-2.5 text-sm"
              >
                <option value="">Selecione...</option>
                {MODALIDADES_TRABALHO.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Resumo Profissional */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Resumo Profissional</label>
            <textarea
              value={dados.resumo || ''}
              onChange={e => updateDados('resumo', e.target.value)}
              className="w-full border rounded-lg p-2.5 text-sm h-24"
              placeholder="Resumo profissional do candidato..."
            />
          </div>

          {/* Experiências */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-gray-700">Experiências Profissionais</label>
              <button
                onClick={() => updateDados('experiencias', [...(dados.experiencias || []), {
                  empresa: '', cargo: '', data_inicio: '', data_fim: '', atual: false,
                  descricao: '', principais_atividades: [], tecnologias: [], motivo_saida: ''
                } as ExperienciaCV])}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <Plus size={14} /> Adicionar
              </button>
            </div>
            {(dados.experiencias || []).map((exp, idx) => (
              <div key={idx} className="border rounded-lg p-3 mb-2 bg-gray-50">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-medium text-gray-500">Experiência {idx + 1}</span>
                  <button
                    onClick={() => {
                      const novas = [...(dados.experiencias || [])];
                      novas.splice(idx, 1);
                      updateDados('experiencias', novas);
                    }}
                    className="text-red-400 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={exp.empresa || ''}
                    onChange={e => {
                      const novas = [...(dados.experiencias || [])];
                      novas[idx] = { ...novas[idx], empresa: e.target.value };
                      updateDados('experiencias', novas);
                    }}
                    className="border rounded p-2 text-sm"
                    placeholder="Empresa"
                  />
                  <input
                    type="text"
                    value={exp.cargo || ''}
                    onChange={e => {
                      const novas = [...(dados.experiencias || [])];
                      novas[idx] = { ...novas[idx], cargo: e.target.value };
                      updateDados('experiencias', novas);
                    }}
                    className="border rounded p-2 text-sm"
                    placeholder="Cargo"
                  />
                  <input
                    type="text"
                    value={exp.data_inicio || ''}
                    onChange={e => {
                      const novas = [...(dados.experiencias || [])];
                      novas[idx] = { ...novas[idx], data_inicio: e.target.value };
                      updateDados('experiencias', novas);
                    }}
                    className="border rounded p-2 text-sm"
                    placeholder="Início (MM/AAAA)"
                  />
                  <input
                    type="text"
                    value={exp.data_fim || ''}
                    onChange={e => {
                      const novas = [...(dados.experiencias || [])];
                      novas[idx] = { ...novas[idx], data_fim: e.target.value };
                      updateDados('experiencias', novas);
                    }}
                    className="border rounded p-2 text-sm"
                    placeholder="Fim (MM/AAAA ou Atual)"
                  />
                </div>
                <textarea
                  value={exp.descricao || ''}
                  onChange={e => {
                    const novas = [...(dados.experiencias || [])];
                    novas[idx] = { ...novas[idx], descricao: e.target.value };
                    updateDados('experiencias', novas);
                  }}
                  className="w-full border rounded p-2 text-sm mt-2 h-16"
                  placeholder="Descrição das atividades..."
                />
                <input
                  type="text"
                  value={exp.motivo_saida || ''}
                  onChange={e => {
                    const novas = [...(dados.experiencias || [])];
                    novas[idx] = { ...novas[idx], motivo_saida: e.target.value };
                    updateDados('experiencias', novas);
                  }}
                  className="w-full border rounded p-2 text-sm mt-2"
                  placeholder="Motivo de saída (validar na entrevista)"
                />
              </div>
            ))}
          </div>

          {/* Formação */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-gray-700">Formação Acadêmica</label>
              <button
                onClick={() => updateDados('formacao_academica', [...(dados.formacao_academica || []), {
                  tipo: 'graduacao', curso: '', instituicao: '', data_conclusao: '', em_andamento: false
                } as FormacaoCV])}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <Plus size={14} /> Adicionar
              </button>
            </div>
            {(dados.formacao_academica || []).map((form, idx) => (
              <div key={idx} className="border rounded-lg p-3 mb-2 bg-gray-50">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-medium text-gray-500">Formação {idx + 1}</span>
                  <button
                    onClick={() => {
                      const novas = [...(dados.formacao_academica || [])];
                      novas.splice(idx, 1);
                      updateDados('formacao_academica', novas);
                    }}
                    className="text-red-400 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={form.tipo || ''}
                    onChange={e => {
                      const novas = [...(dados.formacao_academica || [])];
                      novas[idx] = { ...novas[idx], tipo: e.target.value };
                      updateDados('formacao_academica', novas);
                    }}
                    className="border rounded p-2 text-sm"
                  >
                    {TIPOS_FORMACAO.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={form.curso || ''}
                    onChange={e => {
                      const novas = [...(dados.formacao_academica || [])];
                      novas[idx] = { ...novas[idx], curso: e.target.value };
                      updateDados('formacao_academica', novas);
                    }}
                    className="border rounded p-2 text-sm"
                    placeholder="Curso"
                  />
                  <input
                    type="text"
                    value={form.instituicao || ''}
                    onChange={e => {
                      const novas = [...(dados.formacao_academica || [])];
                      novas[idx] = { ...novas[idx], instituicao: e.target.value };
                      updateDados('formacao_academica', novas);
                    }}
                    className="border rounded p-2 text-sm"
                    placeholder="Instituição"
                  />
                  <input
                    type="text"
                    value={form.data_conclusao || ''}
                    onChange={e => {
                      const novas = [...(dados.formacao_academica || [])];
                      novas[idx] = { ...novas[idx], data_conclusao: e.target.value };
                      updateDados('formacao_academica', novas);
                    }}
                    className="border rounded p-2 text-sm"
                    placeholder="Ano conclusão"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Idiomas */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-gray-700">Idiomas</label>
              <button
                onClick={() => updateDados('idiomas', [...(dados.idiomas || []), {
                  idioma: '', nivel: 'intermediario'
                } as IdiomaCV])}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <Plus size={14} /> Adicionar
              </button>
            </div>
            {(dados.idiomas || []).map((idi, idx) => (
              <div key={idx} className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={idi.idioma || ''}
                  onChange={e => {
                    const novos = [...(dados.idiomas || [])];
                    novos[idx] = { ...novos[idx], idioma: e.target.value };
                    updateDados('idiomas', novos);
                  }}
                  className="flex-1 border rounded p-2 text-sm"
                  placeholder="Idioma"
                />
                <select
                  value={idi.nivel || ''}
                  onChange={e => {
                    const novos = [...(dados.idiomas || [])];
                    novos[idx] = { ...novos[idx], nivel: e.target.value };
                    updateDados('idiomas', novos);
                  }}
                  className="border rounded p-2 text-sm"
                >
                  {NIVEIS_IDIOMA.map(n => (
                    <option key={n.value} value={n.value}>{n.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    const novos = [...(dados.idiomas || [])];
                    novos.splice(idx, 1);
                    updateDados('idiomas', novos);
                  }}
                  className="text-red-400 hover:text-red-600"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* ETAPA 3: REQUISITOS */}
      {/* ============================================ */}
      {etapa === 'requisitos' && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold">Requisitos Match</h3>
          <p className="text-sm text-gray-500">
            Valide os requisitos mandatórios e desejáveis com o candidato durante a entrevista.
          </p>

          {/* Requisitos Mandatórios */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-gray-700">Requisitos Mandatórios</label>
              <button
                onClick={() => updateDados('requisitos_match', [...(dados.requisitos_match || []), {
                  tecnologia: '', tempo_experiencia: '', requerido: true, atendido: false, observacao: ''
                } as RequisitoMatch])}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <Plus size={14} /> Adicionar
              </button>
            </div>
            <div className="space-y-2">
              {(dados.requisitos_match || []).map((req, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={req.tecnologia || ''}
                    onChange={e => {
                      const novos = [...(dados.requisitos_match || [])];
                      novos[idx] = { ...novos[idx], tecnologia: e.target.value };
                      updateDados('requisitos_match', novos);
                    }}
                    className="flex-1 border rounded p-2 text-sm"
                    placeholder="Tecnologia/Competência"
                  />
                  <input
                    type="text"
                    value={req.tempo_experiencia || ''}
                    onChange={e => {
                      const novos = [...(dados.requisitos_match || [])];
                      novos[idx] = { ...novos[idx], tempo_experiencia: e.target.value };
                      updateDados('requisitos_match', novos);
                    }}
                    className="w-28 border rounded p-2 text-sm"
                    placeholder="+ X anos"
                  />
                  <input
                    type="text"
                    value={req.observacao || ''}
                    onChange={e => {
                      const novos = [...(dados.requisitos_match || [])];
                      novos[idx] = { ...novos[idx], observacao: e.target.value };
                      updateDados('requisitos_match', novos);
                    }}
                    className="flex-1 border rounded p-2 text-sm"
                    placeholder="Observações"
                  />
                  <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={req.atendido || false}
                      onChange={e => {
                        const novos = [...(dados.requisitos_match || [])];
                        novos[idx] = { ...novos[idx], atendido: e.target.checked };
                        updateDados('requisitos_match', novos);
                      }}
                    />
                    Atende
                  </label>
                  <button
                    onClick={() => {
                      const novos = [...(dados.requisitos_match || [])];
                      novos.splice(idx, 1);
                      updateDados('requisitos_match', novos);
                    }}
                    className="text-red-400 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Requisitos Desejáveis */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-gray-700">Requisitos Desejáveis</label>
              <button
                onClick={() => updateDados('requisitos_desejaveis', [...(dados.requisitos_desejaveis || []), {
                  tecnologia: '', tempo_experiencia: '', atendido: false, observacao: ''
                }])}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <Plus size={14} /> Adicionar
              </button>
            </div>
            <div className="space-y-2">
              {(dados.requisitos_desejaveis || []).map((req, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={req.tecnologia || ''}
                    onChange={e => {
                      const novos = [...(dados.requisitos_desejaveis || [])];
                      novos[idx] = { ...novos[idx], tecnologia: e.target.value };
                      updateDados('requisitos_desejaveis', novos);
                    }}
                    className="flex-1 border rounded p-2 text-sm"
                    placeholder="Tecnologia/Competência"
                  />
                  <input
                    type="text"
                    value={req.tempo_experiencia || ''}
                    onChange={e => {
                      const novos = [...(dados.requisitos_desejaveis || [])];
                      novos[idx] = { ...novos[idx], tempo_experiencia: e.target.value };
                      updateDados('requisitos_desejaveis', novos);
                    }}
                    className="w-28 border rounded p-2 text-sm"
                    placeholder="+ X anos"
                  />
                  <input
                    type="text"
                    value={req.observacao || ''}
                    onChange={e => {
                      const novos = [...(dados.requisitos_desejaveis || [])];
                      novos[idx] = { ...novos[idx], observacao: e.target.value };
                      updateDados('requisitos_desejaveis', novos);
                    }}
                    className="flex-1 border rounded p-2 text-sm"
                    placeholder="Observações"
                  />
                  <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={req.atendido || false}
                      onChange={e => {
                        const novos = [...(dados.requisitos_desejaveis || [])];
                        novos[idx] = { ...novos[idx], atendido: e.target.checked };
                        updateDados('requisitos_desejaveis', novos);
                      }}
                    />
                    Atende
                  </label>
                  <button
                    onClick={() => {
                      const novos = [...(dados.requisitos_desejaveis || [])];
                      novos.splice(idx, 1);
                      updateDados('requisitos_desejaveis', novos);
                    }}
                    className="text-red-400 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Hard Skills */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-gray-700">Hard Skills</label>
              <button
                onClick={() => updateDados('hard_skills_tabela', [...(dados.hard_skills_tabela || []), {
                  tecnologia: '', tempo_experiencia: '', observacao: ''
                }])}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <Plus size={14} /> Adicionar
              </button>
            </div>
            <div className="space-y-2">
              {[...(dados.hard_skills_tabela || [])]
                .map((skill, originalIdx) => ({ ...skill, originalIdx }))
                .sort((a, b) => {
                  const parseAnos = (str: string) => {
                    const match = str?.match(/(\d+)/);
                    return match ? parseInt(match[1]) : 0;
                  };
                  return parseAnos(b.tempo_experiencia) - parseAnos(a.tempo_experiencia);
                })
                .map((skill) => (
                <div key={skill.originalIdx} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={skill.tecnologia || ''}
                    onChange={e => {
                      const novos = [...(dados.hard_skills_tabela || [])];
                      novos[skill.originalIdx] = { ...novos[skill.originalIdx], tecnologia: e.target.value };
                      updateDados('hard_skills_tabela', novos);
                    }}
                    className="flex-1 border rounded p-2 text-sm"
                    placeholder="Tecnologia"
                  />
                  <input
                    type="text"
                    value={skill.tempo_experiencia || ''}
                    onChange={e => {
                      const novos = [...(dados.hard_skills_tabela || [])];
                      novos[skill.originalIdx] = { ...novos[skill.originalIdx], tempo_experiencia: e.target.value };
                      updateDados('hard_skills_tabela', novos);
                    }}
                    className="w-28 border rounded p-2 text-sm"
                    placeholder="+ X anos"
                  />
                  <input
                    type="text"
                    value={skill.observacao || ''}
                    onChange={e => {
                      const novos = [...(dados.hard_skills_tabela || [])];
                      novos[skill.originalIdx] = { ...novos[skill.originalIdx], observacao: e.target.value };
                      updateDados('hard_skills_tabela', novos);
                    }}
                    className="flex-1 border rounded p-2 text-sm"
                    placeholder="Observações"
                  />
                  <button
                    onClick={() => {
                      const novos = [...(dados.hard_skills_tabela || [])];
                      novos.splice(skill.originalIdx, 1);
                      updateDados('hard_skills_tabela', novos);
                    }}
                    className="text-red-400 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* ETAPA 4: DETALHES (Observações por requisito) */}
      {/* ============================================ */}
      {etapa === 'detalhes' && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold">Detalhes e Observações</h3>
          <p className="text-sm text-gray-500">
            Adicione observações validadas durante a entrevista para cada requisito mandatório.
          </p>

          {(dados.requisitos_match || []).map((req, idx) => (
            <div key={idx} className="border rounded-lg p-3 bg-gray-50">
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-2 h-2 rounded-full ${req.atendido ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="font-medium text-sm">Requisitos</span>
                <span className="text-xs text-gray-500">— {req.tecnologia || 'Sem nome'} ({req.tempo_experiencia})</span>
              </div>
              <textarea
                value={req.observacao || ''}
                onChange={e => {
                  const novos = [...(dados.requisitos_match || [])];
                  novos[idx] = { ...novos[idx], observacao: e.target.value };
                  updateDados('requisitos_match', novos);
                }}
                className="w-full border rounded p-2 text-sm h-16"
                placeholder="Observações validadas na entrevista..."
              />
            </div>
          ))}

          {(dados.requisitos_match || []).length === 0 && (
            <div className="text-center text-gray-400 py-8">
              Nenhum requisito mandatório cadastrado. Volte à etapa anterior para adicionar.
            </div>
          )}
        </div>
      )}

      {/* ============================================ */}
      {/* ETAPA 5: PARECER DE SELEÇÃO */}
      {/* ============================================ */}
      {etapa === 'parecer' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold">Parecer de Seleção</h3>
            <button 
              onClick={handleGerarParecer}
              disabled={loading}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2 text-sm"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
              {loading ? 'Gerando...' : 'Gerar com IA'}
            </button>
          </div>
          
          <p className="text-sm text-gray-500">
            Escreva ou gere com IA o parecer de seleção baseado na entrevista comportamental.
          </p>

          <textarea
            value={dados.parecer_selecao || ''}
            onChange={e => updateDados('parecer_selecao', e.target.value)}
            className="w-full border rounded-lg p-4 h-64 text-sm"
            placeholder="Profissional com X anos de experiência na área de TI..."
          />

          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-bold text-gray-700 mb-2 text-sm">Recomendação Final</h4>
            <textarea
              value={dados.recomendacao_final || ''}
              onChange={e => updateDados('recomendacao_final', e.target.value)}
              className="w-full border rounded p-3 h-20 text-sm"
              placeholder="Recomendamos o(a) candidato(a) pois..."
            />
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* ETAPA 6: PREVIEW */}
      {/* ============================================ */}
      {etapa === 'preview' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold">Preview do CV Parcial</h3>
            <button onClick={handleBaixarPDF} className="text-green-600 hover:underline text-sm">
              🖨️ Imprimir/PDF
            </button>
          </div>

          <div className="border rounded-lg shadow-lg overflow-hidden bg-white">
            <iframe
              srcDoc={htmlPreview}
              className="w-full h-[600px]"
              title="Preview CV Parcial"
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
          <h3 className="text-2xl font-bold text-gray-800 mb-2">CV Parcial Gerado com Sucesso!</h3>
          <p className="text-gray-500 mb-4">
            O CV parcial foi salvo e poderá ser validado na Gestão de Candidaturas.
          </p>
          
          {cvSalvoId && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 max-w-md mx-auto">
              <p className="text-green-800 text-sm">
                💾 <strong>CV parcial salvo no banco de dados</strong>
              </p>
              <p className="text-green-600 text-xs mt-1">
                ID: {cvSalvoId} | Versão: {cvAtual?.versao || 1}
              </p>
            </div>
          )}

          <div className="flex justify-center gap-4">
            <button 
              onClick={handleBaixarPDF}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              📥 Baixar PDF
            </button>
            <button 
              onClick={() => setEtapa('preview')}
              className="px-6 py-3 border rounded-lg hover:bg-gray-50"
            >
              👁️ Ver Preview
            </button>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* FOOTER - NAVEGAÇÃO */}
      {/* ============================================ */}
      <div className="border-t pt-4 flex justify-between items-center">
        <div className="text-xs text-gray-400">
          Etapa {etapaIndex + 1} de {etapas.length}
        </div>

        <div className="flex gap-3">
          {etapa === 'template' && (
            <button
              onClick={handleExtrairDados}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? 'Processando...' : 'Próximo →'}
            </button>
          )}

          {etapa === 'dados' && (
            <>
              <button onClick={() => setEtapa('template')} className="px-4 py-2 border rounded-lg flex items-center gap-1">
                <ChevronLeft size={16} /> Voltar
              </button>
              <button
                onClick={() => setEtapa('requisitos')}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"
              >
                Próximo <ChevronRight size={16} />
              </button>
            </>
          )}

          {etapa === 'requisitos' && (
            <>
              <button onClick={() => setEtapa('dados')} className="px-4 py-2 border rounded-lg flex items-center gap-1">
                <ChevronLeft size={16} /> Voltar
              </button>
              <button
                onClick={() => setEtapa('detalhes')}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"
              >
                Próximo <ChevronRight size={16} />
              </button>
            </>
          )}

          {etapa === 'detalhes' && (
            <>
              <button onClick={() => setEtapa('requisitos')} className="px-4 py-2 border rounded-lg flex items-center gap-1">
                <ChevronLeft size={16} /> Voltar
              </button>
              <button
                onClick={() => setEtapa('parecer')}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"
              >
                Próximo <ChevronRight size={16} />
              </button>
            </>
          )}

          {etapa === 'parecer' && (
            <>
              <button onClick={() => setEtapa('detalhes')} className="px-4 py-2 border rounded-lg flex items-center gap-1">
                <ChevronLeft size={16} /> Voltar
              </button>
              <button
                onClick={handleGerarPreview}
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
                {loading ? 'Gerando...' : 'Gerar Preview'}
              </button>
            </>
          )}

          {etapa === 'preview' && (
            <>
              <button onClick={() => setEtapa('parecer')} className="px-4 py-2 border rounded-lg flex items-center gap-1">
                <ChevronLeft size={16} /> Editar
              </button>
              <button
                onClick={handleFinalizarEntrevista}
                disabled={loading || loadingCV}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
              >
                {loading || loadingCV ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {loading || loadingCV ? 'Salvando...' : 'Encerrar Entrevista'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default EntrevistaComportamental;
