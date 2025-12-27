/**
 * BancoTalentos_v3.tsx - Banco de Talentos com Importação IA
 * 
 * Funcionalidades:
 * - CRUD completo de talentos
 * - ✅ NOVO: Importar CV com IA (similar ao ImportModule de Relatórios)
 * - Visualização de skills extraídas
 * - Filtros avançados (senioridade, skills, disponibilidade)
 * - Indicador de CV processado
 * - Cards com informações completas
 * 
 * Versão: 3.0
 * Data: 27/12/2024
 */

import React, { useState, useMemo } from 'react';
import { Pessoa } from '../../types/types_models';
import { supabase } from '../../config/supabase';
import CVImportIA from './CVImportIA';
import { 
  Plus, Upload, Search, Filter, User, Briefcase, 
  GraduationCap, Code, Eye, Edit3, Trash2, 
  CheckCircle, XCircle, ChevronDown, ChevronUp,
  Sparkles, FileText, Globe, Phone, Mail, Linkedin
} from 'lucide-react';

// ============================================
// TIPOS
// ============================================

interface TalentosProps {
    pessoas: Pessoa[];
    addPessoa: (p: any) => void;
    updatePessoa: (p: Pessoa) => void;
    deletePessoa?: (id: string) => void;
    onRefresh?: () => void;
}

interface PessoaExpanded extends Pessoa {
    titulo_profissional?: string;
    senioridade?: string;
    disponibilidade?: string;
    modalidade_preferida?: string;
    pretensao_salarial?: number;
    cidade?: string;
    estado?: string;
    cv_processado?: boolean;
    cv_processado_em?: string;
    resumo_profissional?: string;
    top_skills?: string[];
    total_skills?: number;
    total_experiencias?: number;
}

interface SkillInfo {
    skill_nome: string;
    skill_categoria: string;
    nivel: string;
    anos_experiencia: number;
}

interface ExperienciaInfo {
    empresa: string;
    cargo: string;
    data_inicio: string;
    data_fim: string | null;
    atual: boolean;
    descricao: string;
    tecnologias: string[];
}

// ============================================
// CONSTANTES
// ============================================

const CATEGORIAS_SKILL = {
    frontend: { label: 'Frontend', cor: 'bg-blue-100 text-blue-700' },
    backend: { label: 'Backend', cor: 'bg-green-100 text-green-700' },
    database: { label: 'Banco de Dados', cor: 'bg-purple-100 text-purple-700' },
    devops: { label: 'DevOps', cor: 'bg-orange-100 text-orange-700' },
    mobile: { label: 'Mobile', cor: 'bg-pink-100 text-pink-700' },
    soft_skill: { label: 'Soft Skill', cor: 'bg-yellow-100 text-yellow-700' },
    tool: { label: 'Ferramenta', cor: 'bg-gray-100 text-gray-700' },
    other: { label: 'Outro', cor: 'bg-slate-100 text-slate-700' }
};

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const BancoTalentos_v3: React.FC<TalentosProps> = ({ 
    pessoas, 
    addPessoa, 
    updatePessoa,
    deletePessoa,
    onRefresh 
}) => {
    // Estados de filtro
    const [searchTerm, setSearchTerm] = useState('');
    const [filtroSenioridade, setFiltroSenioridade] = useState<string>('');
    const [filtroDisponibilidade, setFiltroDisponibilidade] = useState<string>('');
    const [filtroCVProcessado, setFiltroCVProcessado] = useState<string>('');
    const [filtroSkill, setFiltroSkill] = useState<string>('');
    
    // Estados de modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isImportIAOpen, setIsImportIAOpen] = useState(false);
    const [editingPessoa, setEditingPessoa] = useState<PessoaExpanded | null>(null);
    
    // Estado de detalhes
    const [detailsPessoa, setDetailsPessoa] = useState<PessoaExpanded | null>(null);
    const [detailsSkills, setDetailsSkills] = useState<SkillInfo[]>([]);
    const [detailsExperiencias, setDetailsExperiencias] = useState<ExperienciaInfo[]>([]);
    const [loadingDetails, setLoadingDetails] = useState(false);
    
    // Estado do formulário
    const [formData, setFormData] = useState<Partial<PessoaExpanded>>({
        nome: '', 
        email: '', 
        telefone: '', 
        cpf: '',
        linkedin_url: '',
        titulo_profissional: '',
        senioridade: '',
        disponibilidade: '',
        modalidade_preferida: '',
        pretensao_salarial: undefined,
        cidade: '',
        estado: ''
    });

    // ============================================
    // FILTROS
    // ============================================

    const pessoasFiltradas = useMemo(() => {
        return (pessoas || []).filter(p => {
            const pessoa = p as PessoaExpanded;
            
            // Filtro de busca
            const matchSearch = !searchTerm || 
                pessoa.nome?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                pessoa.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                pessoa.titulo_profissional?.toLowerCase().includes(searchTerm.toLowerCase());
            
            // Filtro de senioridade
            const matchSenioridade = !filtroSenioridade || 
                pessoa.senioridade === filtroSenioridade;
            
            // Filtro de disponibilidade
            const matchDisponibilidade = !filtroDisponibilidade || 
                pessoa.disponibilidade === filtroDisponibilidade;
            
            // Filtro de CV processado
            const matchCV = !filtroCVProcessado || 
                (filtroCVProcessado === 'sim' && pessoa.cv_processado) ||
                (filtroCVProcessado === 'nao' && !pessoa.cv_processado);
            
            return matchSearch && matchSenioridade && matchDisponibilidade && matchCV;
        });
    }, [pessoas, searchTerm, filtroSenioridade, filtroDisponibilidade, filtroCVProcessado]);

    // Estatísticas
    const stats = useMemo(() => {
        const total = pessoas?.length || 0;
        const processados = (pessoas || []).filter((p: any) => p.cv_processado).length;
        const disponiveis = (pessoas || []).filter((p: any) => p.disponibilidade === 'imediata').length;
        return { total, processados, disponiveis };
    }, [pessoas]);

    // ============================================
    // HANDLERS
    // ============================================

    // Abrir modal de edição/criação
    const openModal = (p?: PessoaExpanded) => {
        if (p) {
            setEditingPessoa(p);
            setFormData({
                nome: p.nome || '',
                email: p.email || '',
                telefone: p.telefone || '',
                cpf: p.cpf || '',
                linkedin_url: p.linkedin_url || '',
                titulo_profissional: p.titulo_profissional || '',
                senioridade: p.senioridade || '',
                disponibilidade: p.disponibilidade || '',
                modalidade_preferida: p.modalidade_preferida || '',
                pretensao_salarial: p.pretensao_salarial,
                cidade: p.cidade || '',
                estado: p.estado || ''
            });
        } else {
            setEditingPessoa(null);
            setFormData({
                nome: '', email: '', telefone: '', cpf: '', linkedin_url: '',
                titulo_profissional: '', senioridade: '', disponibilidade: '',
                modalidade_preferida: '', pretensao_salarial: undefined,
                cidade: '', estado: ''
            });
        }
        setIsModalOpen(true);
    };

    // Salvar pessoa
    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        if (editingPessoa) {
            updatePessoa({ ...editingPessoa, ...formData } as Pessoa);
        } else {
            addPessoa(formData);
        }
        setIsModalOpen(false);
    };

    // Excluir pessoa
    const handleDelete = async (pessoa: PessoaExpanded) => {
        if (!confirm(`Excluir ${pessoa.nome}?`)) return;
        
        if (deletePessoa) {
            deletePessoa(pessoa.id);
        }
    };

    // Abrir detalhes
    const handleOpenDetails = async (pessoa: PessoaExpanded) => {
        setDetailsPessoa(pessoa);
        setLoadingDetails(true);
        
        try {
            // Carregar skills
            const { data: skills } = await supabase
                .from('pessoa_skills')
                .select('*')
                .eq('pessoa_id', parseInt(pessoa.id))
                .order('anos_experiencia', { ascending: false });
            
            setDetailsSkills(skills || []);

            // Carregar experiências
            const { data: experiencias } = await supabase
                .from('pessoa_experiencias')
                .select('*')
                .eq('pessoa_id', parseInt(pessoa.id))
                .order('atual', { ascending: false });
            
            setDetailsExperiencias(experiencias || []);

        } catch (err) {
            console.error('Erro ao carregar detalhes:', err);
        } finally {
            setLoadingDetails(false);
        }
    };

    // Callback de importação IA
    const handleImportComplete = (dados: any) => {
        console.log('✅ CV importado com sucesso:', dados);
        setIsImportIAOpen(false);
        if (onRefresh) {
            onRefresh();
        }
    };

    // Formatar salário
    const formatarSalario = (valor?: number) => {
        if (!valor) return '-';
        return `R$ ${valor.toLocaleString('pt-BR')}`;
    };

    // ============================================
    // RENDER
    // ============================================

    return (
        <div className="p-6 bg-gray-50 min-h-full">
            {/* Header */}
            <div className="mb-6">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800">Banco de Talentos</h1>
                        <p className="text-gray-500 mt-1">
                            {pessoasFiltradas.length} de {stats.total} talentos
                            {stats.processados > 0 && (
                                <span className="ml-2 text-green-600">
                                    • {stats.processados} com CV processado
                                </span>
                            )}
                        </p>
                    </div>
                    
                    {/* Botões de ação */}
                    <div className="flex gap-3">
                        <button 
                            onClick={() => setIsImportIAOpen(true)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 shadow-md font-medium"
                        >
                            <Sparkles size={18} />
                            Importar CV com IA
                        </button>
                        <button 
                            onClick={() => openModal()} 
                            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-md font-medium"
                        >
                            <Plus size={18} />
                            Cadastro Manual
                        </button>
                    </div>
                </div>

                {/* Cards de estatísticas */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
                    <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-blue-500">
                        <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
                        <div className="text-sm text-gray-500">Total de Talentos</div>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-green-500">
                        <div className="text-2xl font-bold text-green-600">{stats.processados}</div>
                        <div className="text-sm text-gray-500">CVs Processados</div>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-orange-500">
                        <div className="text-2xl font-bold text-orange-600">{stats.disponiveis}</div>
                        <div className="text-sm text-gray-500">Disponíveis Imediato</div>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-purple-500">
                        <div className="text-2xl font-bold text-purple-600">{pessoasFiltradas.length}</div>
                        <div className="text-sm text-gray-500">Filtrados</div>
                    </div>
                </div>
            </div>

            {/* Filtros */}
            <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div className="lg:col-span-2 relative">
                        <Search className="absolute left-3 top-3 text-gray-400" size={18} />
                        <input 
                            className="w-full border p-2.5 pl-10 rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500"
                            placeholder="Buscar por nome, email ou título..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <select
                        value={filtroSenioridade}
                        onChange={e => setFiltroSenioridade(e.target.value)}
                        className="border p-2.5 rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="">Todas Senioridades</option>
                        <option value="junior">Junior</option>
                        <option value="pleno">Pleno</option>
                        <option value="senior">Senior</option>
                        <option value="especialista">Especialista</option>
                    </select>
                    <select
                        value={filtroDisponibilidade}
                        onChange={e => setFiltroDisponibilidade(e.target.value)}
                        className="border p-2.5 rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="">Todas Disponibilidades</option>
                        <option value="imediata">Imediata</option>
                        <option value="15_dias">15 dias</option>
                        <option value="30_dias">30 dias</option>
                        <option value="empregado">Empregado</option>
                    </select>
                    <select
                        value={filtroCVProcessado}
                        onChange={e => setFiltroCVProcessado(e.target.value)}
                        className="border p-2.5 rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="">CV Processado?</option>
                        <option value="sim">✅ Processado</option>
                        <option value="nao">❌ Não processado</option>
                    </select>
                </div>
            </div>

            {/* Grid de Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pessoasFiltradas.length === 0 ? (
                    <div className="col-span-full text-center py-12 bg-white rounded-lg shadow-sm">
                        <User size={48} className="mx-auto text-gray-300 mb-4" />
                        <p className="text-gray-500 text-lg">Nenhum talento encontrado</p>
                        <p className="text-gray-400 text-sm mt-1">
                            Clique em "Importar CV com IA" para adicionar novos talentos
                        </p>
                    </div>
                ) : (
                    pessoasFiltradas.map(p => {
                        const pessoa = p as PessoaExpanded;
                        return (
                            <div 
                                key={pessoa.id} 
                                className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow overflow-hidden"
                            >
                                {/* Header do Card */}
                                <div className="p-5 border-b">
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                            <h3 className="font-bold text-lg text-gray-800">
                                                {pessoa.nome}
                                            </h3>
                                            <p className="text-gray-600 text-sm">
                                                {pessoa.titulo_profissional || 'Título não definido'}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {pessoa.cv_processado ? (
                                                <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                                    <CheckCircle size={12} />
                                                    CV IA
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-500 rounded-full text-xs">
                                                    <XCircle size={12} />
                                                    Sem CV
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {/* Badges */}
                                    <div className="flex flex-wrap gap-2 mt-3">
                                        {pessoa.senioridade && (
                                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs capitalize">
                                                {pessoa.senioridade}
                                            </span>
                                        )}
                                        {pessoa.disponibilidade && (
                                            <span className={`px-2 py-0.5 rounded text-xs ${
                                                pessoa.disponibilidade === 'imediata' 
                                                    ? 'bg-green-50 text-green-700'
                                                    : 'bg-orange-50 text-orange-700'
                                            }`}>
                                                {pessoa.disponibilidade.replace('_', ' ')}
                                            </span>
                                        )}
                                        {pessoa.modalidade_preferida && (
                                            <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-xs capitalize">
                                                {pessoa.modalidade_preferida}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Contato */}
                                <div className="px-5 py-3 bg-gray-50 border-b">
                                    <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                                        {pessoa.email && (
                                            <a href={`mailto:${pessoa.email}`} className="flex items-center gap-1 hover:text-blue-600">
                                                <Mail size={14} />
                                                <span className="truncate max-w-[150px]">{pessoa.email}</span>
                                            </a>
                                        )}
                                        {pessoa.telefone && (
                                            <span className="flex items-center gap-1">
                                                <Phone size={14} />
                                                {pessoa.telefone}
                                            </span>
                                        )}
                                        {pessoa.linkedin_url && (
                                            <a 
                                                href={pessoa.linkedin_url} 
                                                target="_blank" 
                                                rel="noreferrer"
                                                className="flex items-center gap-1 text-blue-600 hover:underline"
                                            >
                                                <Linkedin size={14} />
                                                LinkedIn
                                            </a>
                                        )}
                                    </div>
                                </div>

                                {/* Skills Preview */}
                                {pessoa.top_skills && pessoa.top_skills.length > 0 && (
                                    <div className="px-5 py-3 border-b">
                                        <div className="flex flex-wrap gap-1">
                                            {pessoa.top_skills.slice(0, 5).map((skill, i) => (
                                                <span 
                                                    key={i} 
                                                    className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs"
                                                >
                                                    {skill}
                                                </span>
                                            ))}
                                            {pessoa.top_skills.length > 5 && (
                                                <span className="px-2 py-0.5 text-gray-500 text-xs">
                                                    +{pessoa.top_skills.length - 5}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Ações */}
                                <div className="px-5 py-3 flex justify-between items-center">
                                    <div className="text-sm text-gray-500">
                                        {pessoa.cidade && pessoa.estado && (
                                            <span>{pessoa.cidade}/{pessoa.estado}</span>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleOpenDetails(pessoa)}
                                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                                            title="Ver detalhes"
                                        >
                                            <Eye size={18} />
                                        </button>
                                        <button
                                            onClick={() => openModal(pessoa)}
                                            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                                            title="Editar"
                                        >
                                            <Edit3 size={18} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(pessoa)}
                                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                                            title="Excluir"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Modal de Cadastro/Edição */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b">
                            <h3 className="text-xl font-bold">
                                {editingPessoa ? '✏️ Editar Talento' : '➕ Adicionar Talento'}
                            </h3>
                        </div>
                        
                        <form onSubmit={handleSave} className="p-6 space-y-6">
                            {/* Dados Pessoais */}
                            <div>
                                <h4 className="font-medium text-gray-700 mb-3">Dados Pessoais</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="md:col-span-2">
                                        <label className="text-sm font-medium text-gray-700">Nome *</label>
                                        <input 
                                            className="w-full border p-2 rounded mt-1" 
                                            value={formData.nome} 
                                            onChange={e => setFormData({...formData, nome: e.target.value})} 
                                            required 
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Email *</label>
                                        <input 
                                            type="email"
                                            className="w-full border p-2 rounded mt-1" 
                                            value={formData.email} 
                                            onChange={e => setFormData({...formData, email: e.target.value})} 
                                            required 
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Telefone</label>
                                        <input 
                                            className="w-full border p-2 rounded mt-1" 
                                            value={formData.telefone} 
                                            onChange={e => setFormData({...formData, telefone: e.target.value})} 
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">CPF</label>
                                        <input 
                                            className="w-full border p-2 rounded mt-1" 
                                            value={formData.cpf} 
                                            onChange={e => setFormData({...formData, cpf: e.target.value})} 
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">LinkedIn</label>
                                        <input 
                                            className="w-full border p-2 rounded mt-1" 
                                            placeholder="https://linkedin.com/in/..."
                                            value={formData.linkedin_url} 
                                            onChange={e => setFormData({...formData, linkedin_url: e.target.value})} 
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Dados Profissionais */}
                            <div className="border-t pt-4">
                                <h4 className="font-medium text-gray-700 mb-3">Dados Profissionais</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="md:col-span-2">
                                        <label className="text-sm font-medium text-gray-700">Título Profissional</label>
                                        <input 
                                            className="w-full border p-2 rounded mt-1" 
                                            placeholder="Ex: Desenvolvedor Full Stack"
                                            value={formData.titulo_profissional} 
                                            onChange={e => setFormData({...formData, titulo_profissional: e.target.value})} 
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Senioridade</label>
                                        <select 
                                            className="w-full border p-2 rounded mt-1"
                                            value={formData.senioridade} 
                                            onChange={e => setFormData({...formData, senioridade: e.target.value})}
                                        >
                                            <option value="">Selecione</option>
                                            <option value="junior">Junior</option>
                                            <option value="pleno">Pleno</option>
                                            <option value="senior">Senior</option>
                                            <option value="especialista">Especialista</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Disponibilidade</label>
                                        <select 
                                            className="w-full border p-2 rounded mt-1"
                                            value={formData.disponibilidade} 
                                            onChange={e => setFormData({...formData, disponibilidade: e.target.value})}
                                        >
                                            <option value="">Selecione</option>
                                            <option value="imediata">Imediata</option>
                                            <option value="15_dias">15 dias</option>
                                            <option value="30_dias">30 dias</option>
                                            <option value="empregado">Empregado</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Modalidade Preferida</label>
                                        <select 
                                            className="w-full border p-2 rounded mt-1"
                                            value={formData.modalidade_preferida} 
                                            onChange={e => setFormData({...formData, modalidade_preferida: e.target.value})}
                                        >
                                            <option value="">Selecione</option>
                                            <option value="presencial">Presencial</option>
                                            <option value="hibrido">Híbrido</option>
                                            <option value="remoto">Remoto</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Pretensão Salarial</label>
                                        <input 
                                            type="number"
                                            className="w-full border p-2 rounded mt-1" 
                                            placeholder="Ex: 8000"
                                            value={formData.pretensao_salarial || ''} 
                                            onChange={e => setFormData({...formData, pretensao_salarial: e.target.value ? Number(e.target.value) : undefined})} 
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Localização */}
                            <div className="border-t pt-4">
                                <h4 className="font-medium text-gray-700 mb-3">Localização</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Cidade</label>
                                        <input 
                                            className="w-full border p-2 rounded mt-1" 
                                            value={formData.cidade} 
                                            onChange={e => setFormData({...formData, cidade: e.target.value})} 
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Estado</label>
                                        <input 
                                            className="w-full border p-2 rounded mt-1" 
                                            maxLength={2}
                                            placeholder="SP"
                                            value={formData.estado} 
                                            onChange={e => setFormData({...formData, estado: e.target.value.toUpperCase()})} 
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t">
                                <button 
                                    type="button" 
                                    onClick={() => setIsModalOpen(false)} 
                                    className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    type="submit" 
                                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                >
                                    Salvar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de Detalhes */}
            {detailsPessoa && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
                        {/* Header */}
                        <div className="p-6 border-b bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-t-xl">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="text-2xl font-bold">{detailsPessoa.nome}</h3>
                                    <p className="text-blue-100">{detailsPessoa.titulo_profissional}</p>
                                </div>
                                <button 
                                    onClick={() => setDetailsPessoa(null)}
                                    className="text-white hover:bg-white/20 p-2 rounded-full"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        {/* Conteúdo */}
                        <div className="p-6 space-y-6">
                            {loadingDetails ? (
                                <div className="text-center py-8">
                                    <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
                                    <p className="text-gray-500 mt-2">Carregando detalhes...</p>
                                </div>
                            ) : (
                                <>
                                    {/* Info básica */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div>
                                            <span className="text-xs text-gray-500">Senioridade</span>
                                            <p className="font-medium capitalize">{detailsPessoa.senioridade || '-'}</p>
                                        </div>
                                        <div>
                                            <span className="text-xs text-gray-500">Disponibilidade</span>
                                            <p className="font-medium capitalize">{detailsPessoa.disponibilidade?.replace('_', ' ') || '-'}</p>
                                        </div>
                                        <div>
                                            <span className="text-xs text-gray-500">Modalidade</span>
                                            <p className="font-medium capitalize">{detailsPessoa.modalidade_preferida || '-'}</p>
                                        </div>
                                        <div>
                                            <span className="text-xs text-gray-500">Pretensão</span>
                                            <p className="font-medium">{formatarSalario(detailsPessoa.pretensao_salarial)}</p>
                                        </div>
                                    </div>

                                    {/* Resumo */}
                                    {detailsPessoa.resumo_profissional && (
                                        <div>
                                            <h4 className="font-bold text-gray-700 mb-2">📝 Resumo Profissional</h4>
                                            <p className="text-gray-600 bg-gray-50 p-4 rounded-lg">
                                                {detailsPessoa.resumo_profissional}
                                            </p>
                                        </div>
                                    )}

                                    {/* Skills */}
                                    <div>
                                        <h4 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
                                            <Code size={18} className="text-purple-600" />
                                            Skills ({detailsSkills.length})
                                        </h4>
                                        {detailsSkills.length > 0 ? (
                                            <div className="flex flex-wrap gap-2">
                                                {detailsSkills.map((skill, i) => (
                                                    <span 
                                                        key={i}
                                                        className={`px-3 py-1.5 rounded-full text-sm ${
                                                            CATEGORIAS_SKILL[skill.skill_categoria as keyof typeof CATEGORIAS_SKILL]?.cor || 'bg-gray-100 text-gray-700'
                                                        }`}
                                                    >
                                                        {skill.skill_nome}
                                                        {skill.anos_experiencia > 0 && (
                                                            <span className="ml-1 opacity-70">({skill.anos_experiencia}a)</span>
                                                        )}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-gray-500 text-sm">Nenhuma skill cadastrada</p>
                                        )}
                                    </div>

                                    {/* Experiências */}
                                    <div>
                                        <h4 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
                                            <Briefcase size={18} className="text-orange-600" />
                                            Experiências ({detailsExperiencias.length})
                                        </h4>
                                        {detailsExperiencias.length > 0 ? (
                                            <div className="space-y-3">
                                                {detailsExperiencias.map((exp, i) => (
                                                    <div key={i} className="bg-gray-50 rounded-lg p-4">
                                                        <div className="flex justify-between items-start">
                                                            <div>
                                                                <h5 className="font-bold text-gray-800">{exp.cargo}</h5>
                                                                <p className="text-gray-600">{exp.empresa}</p>
                                                            </div>
                                                            {exp.atual && (
                                                                <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
                                                                    Atual
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-sm text-gray-500 mt-1">
                                                            {exp.data_inicio} - {exp.atual ? 'Atual' : exp.data_fim}
                                                        </p>
                                                        {exp.descricao && (
                                                            <p className="text-sm text-gray-600 mt-2">{exp.descricao}</p>
                                                        )}
                                                        {exp.tecnologias && exp.tecnologias.length > 0 && (
                                                            <div className="flex flex-wrap gap-1 mt-2">
                                                                {exp.tecnologias.map((tech, j) => (
                                                                    <span key={j} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded">
                                                                        {tech}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-gray-500 text-sm">Nenhuma experiência cadastrada</p>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    setDetailsPessoa(null);
                                    openModal(detailsPessoa);
                                }}
                                className="px-4 py-2 border rounded-lg hover:bg-white flex items-center gap-2"
                            >
                                <Edit3 size={16} />
                                Editar
                            </button>
                            <button
                                onClick={() => setDetailsPessoa(null)}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Importação IA */}
            {isImportIAOpen && (
                <CVImportIA
                    onImportComplete={handleImportComplete}
                    onClose={() => setIsImportIAOpen(false)}
                />
            )}
        </div>
    );
};

export default BancoTalentos_v3;
