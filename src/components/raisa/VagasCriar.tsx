/**
 * VagasCriar.tsx - Formulário Completo de Criação de Vagas
 * 
 * Funcionalidades:
 * - Todos os campos da tabela vagas
 * - Extração automática de stacks via IA
 * - Gestor do Cliente filtrado
 * - Campos: ocorrencia, vaga_faturavel, tipo_de_vaga
 * - Integração com modal de sugestões IA
 * - [NOVO v2.1] Extração automática de Requisitos Obrigatórios/Desejáveis via IA
 * - [NOVO v2.1] Auto-preenchimento de Gestor Comercial ao selecionar Cliente
 * - [NOVO v2.1] Extração refinada de Stack Tecnológica via Backend/Gemini
 * 
 * Versão: 2.1
 * Data: 06/01/2026
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { Vaga } from '../../types/types_models';
import { Client, User } from '../../types/types_users';
import { Plus, X, Sparkles, Loader2, Wand2, Eye, Save, ArrowLeft } from 'lucide-react';

// ============================================
// TIPOS
// ============================================

interface VagasCriarProps {
  onVagaCriada?: (novaVaga: Vaga) => void;
  onOpenSugestoesIA?: (vaga: Vaga) => void;
  vagaParaEditar?: Vaga | null;
  onCancelar?: () => void;
}

interface GestorCliente {
  id: number;
  nome_usuario_cliente: string;
  cargo_usuario_cliente: string;
  cliente_id: number;
}

// ============================================
// CONSTANTES
// ============================================

const SENIORIDADES = ['Junior', 'Pleno', 'Senior', 'Especialista', 'Gerente'];

const STATUS_VAGA = [
  { value: 'aberta', label: 'Aberta', color: 'bg-blue-100 text-blue-800' },
  { value: 'em_andamento', label: 'Em Andamento', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'fechada', label: 'Aprovada/Fechada', color: 'bg-green-100 text-green-800' },
  { value: 'cancelada', label: 'Cancelada', color: 'bg-gray-100 text-gray-800' },
  { value: 'perdida', label: 'Perdida', color: 'bg-red-100 text-red-800' },
];

const TIPOS_VAGA = [
  'Nova Posição',
  'Substituição',
  'Expansão',
  'Backfill',
  'Projeto',
  'Temporária'
];

const REGIMES_CONTRATACAO = ['PJ', 'CLT', 'CLT Flex', 'Cooperado', 'Autônomo', 'Estágio'];

const MODALIDADES = ['Remoto', 'Híbrido', 'Presencial'];

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const VagasCriar: React.FC<VagasCriarProps> = ({ 
  onVagaCriada, 
  onOpenSugestoesIA,
  vagaParaEditar,
  onCancelar 
}) => {
  const { 
    clients, 
    users, 
    usuariosCliente,
    addVaga, 
    updateVaga,
    loading: dataLoading, 
    error: dataError 
  } = useSupabaseData();
  
  // Estado inicial do formulário
  const getInitialState = (): Omit<Vaga, 'id' | 'criado_em' | 'atualizado_em' | 'created_at' | 'updated_at'> => ({
    titulo: '',
    descricao: '',
    senioridade: 'Pleno',
    stack_tecnologica: [],
    salario_min: null,
    salario_max: null,
    status: 'aberta',
    requisitos_obrigatorios: null,
    requisitos_desejaveis: null,
    regime_contratacao: 'PJ',
    modalidade: 'Remoto',
    beneficios: null,
    cliente_id: null,
    analista_id: null,
    urgente: false,
    prazo_fechamento: null,
    faturamento_mensal: null,
    tipo_de_vaga: 'Nova Posição',
    ocorrencia: null,
    vaga_faturavel: true,
  });

  const [formData, setFormData] = useState(getInitialState());
  const [stackInput, setStackInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [extractingStacks, setExtractingStacks] = useState(false);
  const [extractingRequisitos, setExtractingRequisitos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [gestorClienteId, setGestorClienteId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'basico' | 'requisitos' | 'contratacao' | 'config'>('basico');
  const [iaExtractionInfo, setIaExtractionInfo] = useState<{
    confianca?: number;
    observacoes?: string[];
    infoExtraidas?: any;
  } | null>(null);

  // Carregar dados da vaga para edição
  useEffect(() => {
    if (vagaParaEditar) {
      setFormData({
        titulo: vagaParaEditar.titulo || '',
        descricao: vagaParaEditar.descricao || '',
        senioridade: vagaParaEditar.senioridade || 'Pleno',
        stack_tecnologica: vagaParaEditar.stack_tecnologica || [],
        salario_min: vagaParaEditar.salario_min,
        salario_max: vagaParaEditar.salario_max,
        status: vagaParaEditar.status || 'aberta',
        requisitos_obrigatorios: vagaParaEditar.requisitos_obrigatorios,
        requisitos_desejaveis: vagaParaEditar.requisitos_desejaveis,
        regime_contratacao: vagaParaEditar.regime_contratacao || 'PJ',
        modalidade: vagaParaEditar.modalidade || 'Remoto',
        beneficios: vagaParaEditar.beneficios,
        cliente_id: vagaParaEditar.cliente_id,
        analista_id: vagaParaEditar.analista_id,
        urgente: vagaParaEditar.urgente || false,
        prazo_fechamento: vagaParaEditar.prazo_fechamento,
        faturamento_mensal: vagaParaEditar.faturamento_mensal,
        tipo_de_vaga: vagaParaEditar.tipo_de_vaga || 'Nova Posição',
        ocorrencia: vagaParaEditar.ocorrencia,
        vaga_faturavel: vagaParaEditar.vaga_faturavel !== false,
      });
    }
  }, [vagaParaEditar]);

  // Filtrar gestores do cliente selecionado
  const gestoresDoCliente = useMemo(() => {
    if (!formData.cliente_id) return [];
    return usuariosCliente.filter(g => g.cliente_id === formData.cliente_id);
  }, [formData.cliente_id, usuariosCliente]);

  // Gestores comerciais (analistas)
  const gestoresComerciais = useMemo(() => {
    return users.filter(u => 
      u.tipo_usuario === 'Gestão Comercial' || 
      u.tipo_usuario === 'Administrador'
    );
  }, [users]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else if (type === 'number') {
      setFormData(prev => ({ ...prev, [name]: value ? parseFloat(value) : null }));
    } else if (name === 'cliente_id') {
      // Resetar gestor do cliente ao mudar cliente
      setGestorClienteId(null);
      const clienteId = value ? parseInt(value) : null;
      
      // Auto-preencher gestor comercial associado ao cliente
      if (clienteId) {
        const clienteSelecionado = clients.find(c => c.id === clienteId);
        if (clienteSelecionado?.id_gestao_comercial) {
          setFormData(prev => ({ 
            ...prev, 
            cliente_id: clienteId,
            analista_id: clienteSelecionado.id_gestao_comercial 
          }));
          setSuccessMessage(`✅ Gestor comercial "${gestoresComerciais.find(g => g.id === clienteSelecionado.id_gestao_comercial)?.nome_usuario || 'associado'}" preenchido automaticamente`);
          setTimeout(() => setSuccessMessage(null), 3000);
          return;
        }
      }
      
      setFormData(prev => ({ ...prev, [name]: clienteId }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value || null }));
    }
  };

  const handleAddStack = () => {
    if (stackInput.trim()) {
      const stacks = stackInput.split(',').map(s => s.trim()).filter(s => s);
      setFormData(prev => ({
        ...prev,
        stack_tecnologica: [...new Set([...prev.stack_tecnologica, ...stacks])]
      }));
      setStackInput('');
    }
  };

  const handleRemoveStack = (index: number) => {
    setFormData(prev => ({
      ...prev,
      stack_tecnologica: prev.stack_tecnologica.filter((_, i) => i !== index)
    }));
  };

  // ============================================
  // EXTRAÇÃO DE REQUISITOS E STACKS VIA IA (BACKEND)
  // ============================================

  const extrairRequisitosComIA = async () => {
    const descricao = formData.descricao || '';
    
    if (!descricao.trim() || descricao.length < 50) {
      setError('Preencha a descrição da vaga com pelo menos 50 caracteres para a IA analisar.');
      return;
    }

    setExtractingRequisitos(true);
    setError(null);
    setIaExtractionInfo(null);

    try {
      console.log('🤖 Chamando API para extrair requisitos...');
      
      const response = await fetch('/api/gemini-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'extrair_requisitos_vaga',
          payload: {
            descricao: descricao,
            titulo: formData.titulo
          }
        })
      });

      const result = await response.json();

      if (!result.success || !result.data?.sucesso) {
        throw new Error(result.data?.erro || result.error || 'Erro na extração');
      }

      const dados = result.data;
      
      // Atualizar campos do formulário com dados extraídos
      setFormData(prev => ({
        ...prev,
        // Requisitos (apenas se não preenchidos ou se usuário confirmar)
        requisitos_obrigatorios: dados.requisitos_obrigatorios || prev.requisitos_obrigatorios,
        requisitos_desejaveis: dados.requisitos_desejaveis || prev.requisitos_desejaveis,
        // Stacks (merge com existentes)
        stack_tecnologica: [...new Set([...prev.stack_tecnologica, ...(dados.stack_tecnologica || [])])],
        // Informações adicionais (se não preenchidas)
        modalidade: dados.informacoes_extraidas?.modalidade || prev.modalidade,
        regime_contratacao: dados.informacoes_extraidas?.regime_contratacao || prev.regime_contratacao,
        senioridade: dados.informacoes_extraidas?.senioridade_detectada || prev.senioridade,
        prazo_fechamento: dados.informacoes_extraidas?.prazo_fechamento || prev.prazo_fechamento,
        salario_min: dados.informacoes_extraidas?.valor_hora || prev.salario_min,
      }));

      // Guardar info da extração
      setIaExtractionInfo({
        confianca: dados.confianca,
        observacoes: dados.observacoes,
        infoExtraidas: dados.informacoes_extraidas
      });

      const totalExtraido = (dados.stack_tecnologica?.length || 0);
      setSuccessMessage(`✅ IA extraiu: ${totalExtraido} tecnologias, requisitos obrigatórios e desejáveis! (Confiança: ${dados.confianca}%)`);
      
      // Mudar para aba de requisitos para o usuário revisar
      setActiveTab('requisitos');
      
      setTimeout(() => setSuccessMessage(null), 5000);

    } catch (err: any) {
      console.error('❌ Erro na extração:', err);
      setError('Erro ao extrair requisitos: ' + err.message);
    } finally {
      setExtractingRequisitos(false);
    }
  };

  // Função legacy para extração local (fallback)
  const extrairStacksComIA = async () => {
    const textoAnalise = `${formData.descricao || ''} ${formData.requisitos_obrigatorios || ''} ${formData.requisitos_desejaveis || ''}`;
    
    if (!textoAnalise.trim()) {
      setError('Preencha a descrição ou requisitos para extrair as stacks.');
      return;
    }

    setExtractingStacks(true);
    setError(null);

    try {
      // Simulação local de extração (em produção usaria a API Gemini)
      const stacksComuns = [
        'React', 'Angular', 'Vue', 'Node.js', 'Python', 'Java', 'C#', '.NET',
        'JavaScript', 'TypeScript', 'PHP', 'Laravel', 'Django', 'Spring',
        'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'AWS', 'Azure', 'GCP',
        'Docker', 'Kubernetes', 'Git', 'CI/CD', 'Agile', 'Scrum',
        'REST', 'API', 'GraphQL', 'Microservices', 'SQL', 'NoSQL',
        'HTML', 'CSS', 'Sass', 'Tailwind', 'Bootstrap', 'Figma',
        'Linux', 'DevOps', 'Jenkins', 'Terraform', 'Ansible',
        'Machine Learning', 'Data Science', 'Power BI', 'Tableau',
        'SAP', 'Salesforce', 'Oracle', 'ServiceNow', 'Jira',
        'Selenium', 'Cypress', 'Jest', 'JUnit', 'Postman'
      ];

      const textoLower = textoAnalise.toLowerCase();
      const stacksEncontradas: string[] = [];

      stacksComuns.forEach(stack => {
        if (textoLower.includes(stack.toLowerCase())) {
          stacksEncontradas.push(stack);
        }
      });

      // Extrair também padrões comuns
      const patterns = [
        /\b(react\.?js|reactjs)\b/gi,
        /\b(node\.?js|nodejs)\b/gi,
        /\b(vue\.?js|vuejs)\b/gi,
        /\b(next\.?js|nextjs)\b/gi,
        /\b(express\.?js|expressjs)\b/gi,
        /\bphp\s*\d+\.?\d*/gi,
        /\bjava\s*\d+/gi,
        /\bpython\s*\d+\.?\d*/gi,
        /\b\.net\s*(core|framework)?\s*\d*\.?\d*/gi,
        /\baws\b/gi,
        /\bazure\b/gi,
        /\bgcp\b/gi,
        /\bdocker\b/gi,
        /\bkubernetes\b/gi,
        /\bk8s\b/gi,
      ];

      patterns.forEach(pattern => {
        const matches = textoAnalise.match(pattern);
        if (matches) {
          matches.forEach(match => {
            const cleaned = match.trim();
            if (!stacksEncontradas.some(s => s.toLowerCase() === cleaned.toLowerCase())) {
              stacksEncontradas.push(cleaned);
            }
          });
        }
      });

      if (stacksEncontradas.length > 0) {
        setFormData(prev => ({
          ...prev,
          stack_tecnologica: [...new Set([...prev.stack_tecnologica, ...stacksEncontradas])]
        }));
        setSuccessMessage(`✅ ${stacksEncontradas.length} tecnologias identificadas!`);
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setError('Nenhuma tecnologia identificada automaticamente. Adicione manualmente.');
      }

    } catch (err: any) {
      setError('Erro ao extrair stacks: ' + err.message);
    } finally {
      setExtractingStacks(false);
    }
  };

  // ============================================
  // SUBMIT
  // ============================================

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validações
    if (!formData.titulo?.trim()) {
      setError('Título da vaga é obrigatório.');
      setActiveTab('basico');
      return;
    }
    
    if (!formData.cliente_id) {
      setError('Selecione um cliente.');
      setActiveTab('basico');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      let vagaSalva: Vaga;

      if (vagaParaEditar) {
        // Atualizar vaga existente
        vagaSalva = await updateVaga({ 
          ...vagaParaEditar, 
          ...formData,
          id: vagaParaEditar.id 
        } as Vaga);
        setSuccessMessage('✅ Vaga atualizada com sucesso!');
      } else {
        // Criar nova vaga
        vagaSalva = await addVaga(formData as any);
        setSuccessMessage('✅ Vaga criada com sucesso!');
        
        // Reset form
        setFormData(getInitialState());
        setStackInput('');
        setGestorClienteId(null);
      }
      
      if (onVagaCriada) {
        onVagaCriada(vagaSalva);
      }

      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar vaga');
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-t-xl shadow-sm border-b p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">
              {vagaParaEditar ? '✏️ Editar Vaga' : '➕ Nova Vaga'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Preencha os dados da vaga. A IA pode ajudar a extrair tecnologias automaticamente.
            </p>
          </div>
          {onCancelar && (
            <button
              onClick={onCancelar}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <ArrowLeft size={18} />
              Voltar
            </button>
          )}
        </div>
      </div>

      {/* Mensagens */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mx-6 mt-4 rounded">
          <p className="text-red-700">{error}</p>
        </div>
      )}
      {successMessage && (
        <div className="bg-green-50 border-l-4 border-green-500 p-4 mx-6 mt-4 rounded">
          <p className="text-green-700">{successMessage}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white border-b px-6">
        <div className="flex gap-1">
          {[
            { id: 'basico', label: '📋 Informações Básicas' },
            { id: 'requisitos', label: '📝 Requisitos & Stacks' },
            { id: 'contratacao', label: '💰 Contratação' },
            { id: 'config', label: '⚙️ Configurações' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-b-xl shadow-sm">
        <div className="p-6">
          
          {/* TAB: Informações Básicas */}
          {activeTab === 'basico' && (
            <div className="space-y-6">
              {/* Cliente e Gestor Comercial */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cliente <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="cliente_id"
                    value={formData.cliente_id || ''}
                    onChange={handleChange}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    <option value="">Selecione o Cliente</option>
                    {clients.filter(c => c.ativo_cliente !== false).map(client => (
                      <option key={client.id} value={client.id}>
                        {client.razao_social_cliente}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Gestor do Cliente
                  </label>
                  <select
                    value={gestorClienteId || ''}
                    onChange={(e) => setGestorClienteId(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={!formData.cliente_id}
                  >
                    <option value="">Selecione o Gestor</option>
                    {gestoresDoCliente.map(gestor => (
                      <option key={gestor.id} value={gestor.id}>
                        {gestor.nome_usuario_cliente} - {gestor.cargo_usuario_cliente}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">Gestor responsável pela vaga no cliente</p>
                </div>
              </div>

              {/* Título e Tipo */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Título da Vaga <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="titulo"
                    value={formData.titulo}
                    onChange={handleChange}
                    placeholder="Ex: VTI-225 Desenvolvedor React Sênior"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo de Vaga
                  </label>
                  <select
                    name="tipo_de_vaga"
                    value={formData.tipo_de_vaga || ''}
                    onChange={handleChange}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {TIPOS_VAGA.map(tipo => (
                      <option key={tipo} value={tipo}>{tipo}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Senioridade e Ocorrência */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Senioridade
                  </label>
                  <select
                    name="senioridade"
                    value={formData.senioridade}
                    onChange={handleChange}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {SENIORIDADES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nº Ocorrência (OC)
                  </label>
                  <input
                    type="number"
                    name="ocorrencia"
                    value={formData.ocorrencia || ''}
                    onChange={handleChange}
                    placeholder="Ex: 7330"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {STATUS_VAGA.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Descrição */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">
                    Descrição da Vaga
                  </label>
                  <button
                    type="button"
                    onClick={extrairRequisitosComIA}
                    disabled={extractingRequisitos || !formData.descricao || formData.descricao.length < 50}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all shadow-sm"
                    title="A IA irá extrair automaticamente: Requisitos Obrigatórios, Desejáveis e Stack Tecnológica"
                  >
                    {extractingRequisitos ? (
                      <>
                        <Loader2 className="animate-spin" size={16} />
                        Analisando...
                      </>
                    ) : (
                      <>
                        <Wand2 size={16} />
                        🤖 Extrair com IA
                      </>
                    )}
                  </button>
                </div>
                <textarea
                  name="descricao"
                  value={formData.descricao || ''}
                  onChange={handleChange}
                  placeholder="Cole aqui a descrição completa da vaga. A IA irá extrair automaticamente os requisitos obrigatórios, desejáveis e a stack tecnológica..."
                  rows={8}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  💡 Dica: Após colar a descrição, clique em "🤖 Extrair com IA" para preencher automaticamente requisitos e tecnologias
                </p>
                {iaExtractionInfo && (
                  <div className="mt-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    <div className="flex items-center gap-2 text-sm text-purple-700">
                      <Sparkles size={16} />
                      <span className="font-medium">IA extraiu dados com {iaExtractionInfo.confianca}% de confiança</span>
                    </div>
                    {iaExtractionInfo.infoExtraidas && (
                      <div className="mt-2 text-xs text-purple-600">
                        {iaExtractionInfo.infoExtraidas.tipo_projeto && (
                          <span className="inline-block bg-purple-100 px-2 py-0.5 rounded mr-2">
                            📁 {iaExtractionInfo.infoExtraidas.tipo_projeto}
                          </span>
                        )}
                        {iaExtractionInfo.infoExtraidas.modalidade && (
                          <span className="inline-block bg-purple-100 px-2 py-0.5 rounded mr-2">
                            🏠 {iaExtractionInfo.infoExtraidas.modalidade}
                          </span>
                        )}
                        {iaExtractionInfo.infoExtraidas.valor_hora && (
                          <span className="inline-block bg-green-100 px-2 py-0.5 rounded mr-2">
                            💰 R$ {iaExtractionInfo.infoExtraidas.valor_hora}/hora
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: Requisitos & Stacks */}
          {activeTab === 'requisitos' && (
            <div className="space-y-6">
              {/* Info box se foi extraído pela IA */}
              {iaExtractionInfo && (
                <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-purple-700">
                    <Sparkles size={20} />
                    <span className="font-medium">Requisitos e Stack extraídos pela IA</span>
                    <span className="ml-auto text-sm bg-purple-100 px-2 py-0.5 rounded">
                      Confiança: {iaExtractionInfo.confianca}%
                    </span>
                  </div>
                  <p className="text-xs text-purple-600 mt-1">
                    Revise os dados extraídos e faça ajustes se necessário antes de salvar.
                  </p>
                </div>
              )}

              {/* Requisitos Obrigatórios */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <label className="block text-sm font-medium text-gray-700">
                    📋 Requisitos Obrigatórios
                  </label>
                  {formData.requisitos_obrigatorios && iaExtractionInfo && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                      ✓ Extraído pela IA
                    </span>
                  )}
                </div>
                <textarea
                  name="requisitos_obrigatorios"
                  value={formData.requisitos_obrigatorios || ''}
                  onChange={handleChange}
                  placeholder="Liste os requisitos obrigatórios...&#10;• Requisito 1&#10;• Requisito 2&#10;• Requisito 3"
                  rows={6}
                  className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    formData.requisitos_obrigatorios && iaExtractionInfo 
                      ? 'border-green-300 bg-green-50/30' 
                      : 'border-gray-300'
                  }`}
                />
              </div>

              {/* Requisitos Desejáveis */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <label className="block text-sm font-medium text-gray-700">
                    ⭐ Requisitos Desejáveis
                  </label>
                  {formData.requisitos_desejaveis && iaExtractionInfo && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                      ✓ Extraído pela IA
                    </span>
                  )}
                </div>
                <textarea
                  name="requisitos_desejaveis"
                  value={formData.requisitos_desejaveis || ''}
                  onChange={handleChange}
                  placeholder="Liste os requisitos desejáveis...&#10;• Desejável 1&#10;• Desejável 2"
                  rows={5}
                  className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    formData.requisitos_desejaveis && iaExtractionInfo 
                      ? 'border-green-300 bg-green-50/30' 
                      : 'border-gray-300'
                  }`}
                />
              </div>

              {/* Stack Tecnológica */}
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-5 border border-purple-100">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <label className="block text-sm font-bold text-gray-800">
                        🔧 Stack Tecnológica
                      </label>
                      {formData.stack_tecnologica.length > 0 && iaExtractionInfo && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                          ✓ {formData.stack_tecnologica.length} extraídas
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">Tecnologias necessárias para a vaga</p>
                  </div>
                  <button
                    type="button"
                    onClick={extrairStacksComIA}
                    disabled={extractingStacks}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 transition-all shadow-md"
                  >
                    {extractingStacks ? (
                      <Loader2 className="animate-spin" size={18} />
                    ) : (
                      <Wand2 size={18} />
                    )}
                    {extractingStacks ? 'Extraindo...' : 'Extrair com IA'}
                  </button>
                </div>
                
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={stackInput}
                    onChange={(e) => setStackInput(e.target.value)}
                    placeholder="Digite tecnologias separadas por vírgula (Ex: React, Node.js, PostgreSQL)"
                    className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddStack())}
                  />
                  <button
                    type="button"
                    onClick={handleAddStack}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2"
                  >
                    <Plus size={18} /> Adicionar
                  </button>
                </div>

                {formData.stack_tecnologica.length > 0 ? (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {formData.stack_tecnologica.map((tech, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 bg-white text-purple-800 px-3 py-1.5 rounded-full border border-purple-200 shadow-sm"
                      >
                        <span className="font-medium">{tech}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveStack(index)}
                          className="hover:text-red-600 transition-colors"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic mt-2">
                    Nenhuma tecnologia adicionada. Use "Extrair com IA" ou adicione manualmente.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* TAB: Contratação */}
          {activeTab === 'contratacao' && (
            <div className="space-y-6">
              {/* Regime e Modalidade */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Regime de Contratação
                  </label>
                  <select
                    name="regime_contratacao"
                    value={formData.regime_contratacao || ''}
                    onChange={handleChange}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Selecione</option>
                    {REGIMES_CONTRATACAO.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Modalidade
                  </label>
                  <select
                    name="modalidade"
                    value={formData.modalidade || ''}
                    onChange={handleChange}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Selecione</option>
                    {MODALIDADES.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Salário */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Salário/Valor Mínimo (R$)
                  </label>
                  <input
                    type="number"
                    name="salario_min"
                    value={formData.salario_min || ''}
                    onChange={handleChange}
                    placeholder="0.00"
                    step="0.01"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Salário/Valor Máximo (R$)
                  </label>
                  <input
                    type="number"
                    name="salario_max"
                    value={formData.salario_max || ''}
                    onChange={handleChange}
                    placeholder="0.00"
                    step="0.01"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Faturamento */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Faturamento Mensal Estimado (R$)
                  </label>
                  <input
                    type="number"
                    name="faturamento_mensal"
                    value={formData.faturamento_mensal || ''}
                    onChange={handleChange}
                    placeholder="0.00"
                    step="0.01"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="flex items-center pt-6">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      name="vaga_faturavel"
                      checked={formData.vaga_faturavel !== false}
                      onChange={handleChange}
                      className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
                    />
                    <div>
                      <span className="font-medium text-gray-800">Vaga Faturável</span>
                      <p className="text-xs text-gray-500">Marque se esta vaga gera faturamento</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Benefícios */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Benefícios
                </label>
                <textarea
                  name="beneficios"
                  value={formData.beneficios || ''}
                  onChange={handleChange}
                  placeholder="Liste os benefícios oferecidos..."
                  rows={4}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {/* TAB: Configurações */}
          {activeTab === 'config' && (
            <div className="space-y-6">
              {/* Gestor Comercial e Prazo */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Gestor Comercial / Analista R&S
                  </label>
                  <select
                    name="analista_id"
                    value={formData.analista_id || ''}
                    onChange={handleChange}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Selecione</option>
                    {gestoresComerciais.map(user => (
                      <option key={user.id} value={user.id}>
                        {user.nome_usuario}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Prazo de Fechamento
                  </label>
                  <input
                    type="date"
                    name="prazo_fechamento"
                    value={formData.prazo_fechamento || ''}
                    onChange={handleChange}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Flags */}
              <div className="bg-gray-50 rounded-lg p-5">
                <h4 className="font-medium text-gray-800 mb-4">⚡ Configurações da Vaga</h4>
                <div className="space-y-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      name="urgente"
                      checked={formData.urgente}
                      onChange={handleChange}
                      className="w-5 h-5 text-red-600 rounded focus:ring-red-500"
                    />
                    <div>
                      <span className="font-medium text-gray-800">🚨 Vaga Urgente</span>
                      <p className="text-xs text-gray-500">Marque para priorizar esta vaga</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Preview */}
              {vagaParaEditar && onOpenSugestoesIA && (
                <div className="bg-purple-50 rounded-lg p-5 border border-purple-200">
                  <h4 className="font-medium text-purple-800 mb-2">🤖 Análise Inteligente</h4>
                  <p className="text-sm text-purple-600 mb-3">
                    Use a IA para analisar e melhorar esta vaga automaticamente.
                  </p>
                  <button
                    type="button"
                    onClick={() => onOpenSugestoesIA(vagaParaEditar)}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                  >
                    <Sparkles size={18} />
                    Abrir Sugestões IA
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer / Botões */}
        <div className="border-t bg-gray-50 px-6 py-4 flex justify-between items-center rounded-b-xl">
          <div className="text-sm text-gray-500">
            {formData.stack_tecnologica.length > 0 && (
              <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded">
                {formData.stack_tecnologica.length} tecnologias
              </span>
            )}
          </div>
          <div className="flex gap-3">
            {onCancelar && (
              <button
                type="button"
                onClick={onCancelar}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 font-medium"
              >
                Cancelar
              </button>
            )}
            <button
              type="submit"
              disabled={loading || dataLoading}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium shadow-md"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <Save size={18} />
              )}
              {loading ? 'Salvando...' : vagaParaEditar ? 'Atualizar Vaga' : 'Criar Vaga'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default VagasCriar;
