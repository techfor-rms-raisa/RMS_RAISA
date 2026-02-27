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
 * - 🆕 v57.0: Campo de Analista de R&S no modal para atribuir exclusividade
 * 
 * Versão: 3.1 (Plano B - Exclusividade Manual)
 * Data: 13/01/2026
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Pessoa } from '../../types/types_models';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../contexts/AuthContext';
import CVImportIA from './CVImportIA';
import { 
  Plus, Upload, Search, Filter, User, Briefcase, 
  GraduationCap, Code, Eye, Edit3, Trash2, 
  CheckCircle, XCircle, ChevronDown, ChevronUp,
  Sparkles, FileText, Globe, Phone, Mail, Linkedin,
  Lock, Clock, Users, Paperclip, Download, X, Loader2, RefreshCw
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
    origem?: string;
    total_candidaturas?: number;  // 🆕 Para controlar botão excluir
    linkedin_url?: string;
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
    // 🆕 v56.0: Obter usuário logado
    const { user } = useAuth();
    
    // Estados de filtro
    const [searchTerm, setSearchTerm] = useState('');
    const [filtroSenioridade, setFiltroSenioridade] = useState<string>('');
    const [filtroDisponibilidade, setFiltroDisponibilidade] = useState<string>('');
    const [filtroCVProcessado, setFiltroCVProcessado] = useState<string>('');
    const [filtroSkill, setFiltroSkill] = useState<string>('');
    // 🆕 v57.2: Filtro de exclusividade - Admin/Gestão de R&S veem todos por padrão
    const [filtroExclusividade, setFiltroExclusividade] = useState<'meus' | 'disponiveis' | 'todos'>('meus');
    
    // Estados de modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isImportIAOpen, setIsImportIAOpen] = useState(false);
    const [editingPessoa, setEditingPessoa] = useState<PessoaExpanded | null>(null);
    
    // Estado de detalhes
    const [detailsPessoa, setDetailsPessoa] = useState<PessoaExpanded | null>(null);
    const [detailsSkills, setDetailsSkills] = useState<SkillInfo[]>([]);
    const [detailsExperiencias, setDetailsExperiencias] = useState<ExperienciaInfo[]>([]);
    const [detailsFormacao, setDetailsFormacao] = useState<any[]>([]);
    const [detailsIdiomas, setDetailsIdiomas] = useState<any[]>([]);
    const [loadingDetails, setLoadingDetails] = useState(false);
    
    // 🆕 Anexos do candidato
    const [anexosOpen, setAnexosOpen] = useState<number | null>(null); // pessoa_id com modal aberto
    const [anexos, setAnexos] = useState<any[]>([]);
    const [loadingAnexos, setLoadingAnexos] = useState(false);
    const [uploadingAnexo, setUploadingAnexo] = useState(false);
    const [refreshingId, setRefreshingId] = useState<number | null>(null);
    
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
        estado: '',
        id_analista_rs: undefined  // 🆕 v57.0: Campo de analista para exclusividade
    });

    // 🆕 v57.2: Ajustar filtro inicial quando usuário carregar
    useEffect(() => {
        if (user?.tipo_usuario === 'Administrador' || user?.tipo_usuario === 'Gestão de R&S') {
            setFiltroExclusividade('todos');
        }
    }, [user?.tipo_usuario]);

    // ============================================
    // FILTROS
    // ============================================

    const pessoasFiltradas = useMemo(() => {
        return (pessoas || []).filter(p => {
            const pessoa = p as PessoaExpanded;
            const agora = new Date();
            
            // 🆕 v56.0: Filtro de exclusividade
            let matchExclusividade = true;
            if (filtroExclusividade === 'meus' && user?.id) {
                // Apenas candidatos do analista logado
                matchExclusividade = pessoa.id_analista_rs === user.id;
            } else if (filtroExclusividade === 'disponiveis') {
                // Candidatos sem exclusividade OU com exclusividade expirada
                const dataFinal = pessoa.data_final_exclusividade ? new Date(pessoa.data_final_exclusividade) : null;
                matchExclusividade = !pessoa.id_analista_rs || (dataFinal !== null && dataFinal < agora);
            }
            // 'todos' - não filtra (apenas para Supervisor/Admin)
            
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
            
            return matchExclusividade && matchSearch && matchSenioridade && matchDisponibilidade && matchCV;
        });
    }, [pessoas, searchTerm, filtroSenioridade, filtroDisponibilidade, filtroCVProcessado, filtroExclusividade, user?.id]);

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
                estado: p.estado || '',
                id_analista_rs: p.id_analista_rs || undefined  // 🆕 v57.0: Manter analista existente
            });
        } else {
            setEditingPessoa(null);
            setFormData({
                nome: '', email: '', telefone: '', cpf: '', linkedin_url: '',
                titulo_profissional: '', senioridade: '', disponibilidade: '',
                modalidade_preferida: '', pretensao_salarial: undefined,
                cidade: '', estado: '',
                id_analista_rs: user?.id  // 🆕 v57.0: Novo cadastro usa analista logado
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
        // 🆕 Verificar se tem candidaturas antes de excluir
        const { count } = await supabase
            .from('candidaturas')
            .select('*', { count: 'exact', head: true })
            .eq('pessoa_id', parseInt(pessoa.id));

        if (count && count > 0) {
            alert(`Não é possível excluir ${pessoa.nome}.\n\nEste candidato possui ${count} candidatura(s) ativa(s). Remova as candidaturas primeiro.`);
            return;
        }

        if (!confirm(`Excluir ${pessoa.nome}?`)) return;
        
        if (deletePessoa) {
            deletePessoa(pessoa.id);
        }
    };

    // ============================================
    // 🆕 REFRESH INDIVIDUAL DO CANDIDATO
    // ============================================

    const handleRefreshPessoa = async (pessoa: PessoaExpanded) => {
        setRefreshingId(pessoa.id);
        try {
            // Recarregar lista completa via callback do pai
            if (onRefresh) {
                await onRefresh();
                console.log(`🔄 Dados atualizados: ${pessoa.nome}`);
            }
        } catch (err) {
            console.error('Erro ao atualizar dados:', err);
        } finally {
            setTimeout(() => setRefreshingId(null), 500);
        }
    };

    // ============================================
    // 🆕 FUNÇÕES DE ANEXOS
    // ============================================
    
    const carregarAnexos = async (pessoaId: number) => {
        setLoadingAnexos(true);
        try {
            const { data, error } = await supabase
                .from('pessoa_anexos')
                .select('*')
                .eq('pessoa_id', pessoaId)
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            setAnexos(data || []);
        } catch (err) {
            console.error('Erro ao carregar anexos:', err);
            setAnexos([]);
        } finally {
            setLoadingAnexos(false);
        }
    };

    const handleAbrirAnexos = async (pessoaId: number) => {
        setAnexosOpen(pessoaId);
        await carregarAnexos(pessoaId);
    };

    const handleUploadAnexo = async (e: React.ChangeEvent<HTMLInputElement>, pessoaId: number) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const extensoesPermitidas = ['pdf', 'docx', 'doc', 'jpg', 'jpeg', 'png', 'txt', 'xlsx', 'xls'];
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        if (!extensoesPermitidas.includes(ext)) {
            alert(`Formato .${ext} não suportado.\nPermitidos: ${extensoesPermitidas.join(', ')}`);
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            alert('Arquivo muito grande. Máximo 10MB.');
            return;
        }

        setUploadingAnexo(true);
        try {
            // Upload para Supabase Storage
            const timestamp = Date.now();
            const filePath = `pessoa_${pessoaId}/${timestamp}_${file.name}`;
            
            const { error: uploadError } = await supabase.storage
                .from('pessoa-anexos')
                .upload(filePath, file, { upsert: false });

            if (uploadError) throw uploadError;

            // Obter URL pública
            const { data: urlData } = supabase.storage
                .from('pessoa-anexos')
                .getPublicUrl(filePath);

            // Registrar na tabela
            const { error: insertError } = await supabase
                .from('pessoa_anexos')
                .insert({
                    pessoa_id: pessoaId,
                    nome_arquivo: file.name,
                    tipo_arquivo: ext,
                    tamanho_bytes: file.size,
                    storage_path: filePath,
                    url_publica: urlData.publicUrl,
                    uploaded_por: user?.id || null
                });

            if (insertError) throw insertError;

            console.log(`✅ Anexo uploaded: ${file.name}`);
            await carregarAnexos(pessoaId);
        } catch (err: any) {
            console.error('Erro no upload:', err);
            alert('Erro ao enviar arquivo: ' + (err.message || 'Tente novamente'));
        } finally {
            setUploadingAnexo(false);
            // Limpar input
            e.target.value = '';
        }
    };

    const handleExcluirAnexo = async (anexo: any) => {
        if (!confirm(`Excluir "${anexo.nome_arquivo}"?`)) return;

        try {
            // Excluir do Storage
            await supabase.storage
                .from('pessoa-anexos')
                .remove([anexo.storage_path]);

            // Excluir do banco
            await supabase
                .from('pessoa_anexos')
                .delete()
                .eq('id', anexo.id);

            setAnexos(prev => prev.filter(a => a.id !== anexo.id));
            console.log(`🗑️ Anexo excluído: ${anexo.nome_arquivo}`);
        } catch (err) {
            console.error('Erro ao excluir anexo:', err);
            alert('Erro ao excluir arquivo');
        }
    };

    const getIconeArquivo = (tipo: string) => {
        const icones: Record<string, string> = {
            pdf: '📕', docx: '📘', doc: '📘', 
            jpg: '🖼️', jpeg: '🖼️', png: '🖼️',
            xlsx: '📗', xls: '📗', txt: '📄'
        };
        return icones[tipo] || '📎';
    };

    const formatarTamanho = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    // Abrir detalhes
    const handleOpenDetails = async (pessoa: PessoaExpanded) => {
        setDetailsPessoa(pessoa);
        setLoadingDetails(true);
        
        try {
            // Carregar skills (ordenado por anos de experiência desc)
            const { data: skills } = await supabase
                .from('pessoa_skills')
                .select('*')
                .eq('pessoa_id', parseInt(pessoa.id))
                .order('anos_experiencia', { ascending: false, nullsFirst: false });
            
            setDetailsSkills(skills || []);

            // Carregar experiências
            const { data: experiencias } = await supabase
                .from('pessoa_experiencias')
                .select('*')
                .eq('pessoa_id', parseInt(pessoa.id))
                .order('atual', { ascending: false });
            
            setDetailsExperiencias(experiencias || []);

            // Carregar formação
            const { data: formacao } = await supabase
                .from('pessoa_formacao')
                .select('*')
                .eq('pessoa_id', parseInt(pessoa.id))
                .order('ano_conclusao', { ascending: false, nullsFirst: false });
            
            setDetailsFormacao(formacao || []);

            // Carregar idiomas
            const { data: idiomas } = await supabase
                .from('pessoa_idiomas')
                .select('*')
                .eq('pessoa_id', parseInt(pessoa.id));
            
            setDetailsIdiomas(idiomas || []);

            // 🆕 Carregar contagem de candidaturas (para controlar botão excluir)
            const { count: totalCandidaturas } = await supabase
                .from('candidaturas')
                .select('*', { count: 'exact', head: true })
                .eq('pessoa_id', parseInt(pessoa.id));

            setDetailsPessoa(prev => prev ? { ...prev, total_candidaturas: totalCandidaturas || 0 } : prev);

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

            {/* 🆕 v56.0: Filtro de Exclusividade (Tabs) */}
            <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                    <Lock size={16} className="text-blue-600" />
                    <span className="font-medium text-gray-700">Visualização:</span>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setFiltroExclusividade('meus')}
                        className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${
                            filtroExclusividade === 'meus'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                    >
                        <User size={16} />
                        Meus Candidatos
                    </button>
                    <button
                        onClick={() => setFiltroExclusividade('disponiveis')}
                        className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${
                            filtroExclusividade === 'disponiveis'
                                ? 'bg-green-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                    >
                        <Users size={16} />
                        Disponíveis
                    </button>
                    {/* Mostrar "Todos" apenas para Supervisor/Admin */}
                    {(user?.tipo_usuario === 'Administrador' || user?.tipo_usuario === 'Gestão de R&S') && (
                        <button
                            onClick={() => setFiltroExclusividade('todos')}
                            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${
                                filtroExclusividade === 'todos'
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                        >
                            <Globe size={16} />
                            Todos
                        </button>
                    )}
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
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {/* Badge de origem LinkedIn */}
                                            {pessoa.origem === 'linkedin' && (
                                                <a 
                                                    href={pessoa.linkedin_url || '#'}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium hover:bg-blue-200 transition-colors"
                                                    title="Importado do LinkedIn - Clique para ver perfil"
                                                >
                                                    <Linkedin size={12} />
                                                    LinkedIn
                                                </a>
                                            )}
                                            {/* Badge CV IA */}
                                            {pessoa.cv_processado ? (
                                                <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                                    <CheckCircle size={12} />
                                                    CV IA
                                                </span>
                                            ) : (
                                                !pessoa.origem && (
                                                    <span className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-500 rounded-full text-xs">
                                                        <XCircle size={12} />
                                                        Sem CV
                                                    </span>
                                                )
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
                                        {/* 🆕 v56.0: Badge de Exclusividade */}
                                        {pessoa.id_analista_rs && (
                                            (() => {
                                                const dataFinal = pessoa.data_final_exclusividade ? new Date(pessoa.data_final_exclusividade) : null;
                                                const agora = new Date();
                                                const diasRestantes = dataFinal ? Math.ceil((dataFinal.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24)) : 0;
                                                
                                                if (!dataFinal || diasRestantes <= 0) {
                                                    return (
                                                        <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs flex items-center gap-1">
                                                            <Clock size={10} />
                                                            Expirado
                                                        </span>
                                                    );
                                                } else if (diasRestantes <= 5) {
                                                    return (
                                                        <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs flex items-center gap-1 animate-pulse">
                                                            <Lock size={10} />
                                                            {diasRestantes}d ⚠️
                                                        </span>
                                                    );
                                                } else if (diasRestantes <= 15) {
                                                    return (
                                                        <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs flex items-center gap-1">
                                                            <Lock size={10} />
                                                            {diasRestantes}d
                                                        </span>
                                                    );
                                                } else {
                                                    return (
                                                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs flex items-center gap-1">
                                                            <Lock size={10} />
                                                            {pessoa.id_analista_rs === user?.id ? 'Meu' : 'Exclusivo'}
                                                        </span>
                                                    );
                                                }
                                            })()
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
                                        {/* Link LinkedIn só aparece aqui se NÃO for origem linkedin (evita duplicação com badge) */}
                                        {pessoa.linkedin_url && pessoa.origem !== 'linkedin' && (
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
                                            onClick={() => handleRefreshPessoa(pessoa)}
                                            className={`p-2 text-green-600 hover:bg-green-50 rounded-lg transition-transform ${
                                                refreshingId === pessoa.id ? 'animate-spin' : ''
                                            }`}
                                            title="Atualizar dados do candidato"
                                            disabled={refreshingId === pessoa.id}
                                        >
                                            <RefreshCw size={18} />
                                        </button>
                                        <button
                                            onClick={() => handleAbrirAnexos(pessoa.id)}
                                            className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg"
                                            title="Anexos do candidato"
                                        >
                                            <Paperclip size={18} />
                                        </button>
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

                            {/* 🆕 v57.0: Exclusividade/Analista */}
                            <div className="border-t pt-4">
                                <h4 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
                                    <Lock size={16} />
                                    Exclusividade
                                </h4>
                                <div className="grid grid-cols-1 gap-4">
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">
                                            Analista de R&S Responsável
                                        </label>
                                        <div className="flex items-center gap-2 mt-1">
                                            <input 
                                                type="number"
                                                className="w-full border p-2 rounded" 
                                                placeholder="ID do Analista"
                                                value={formData.id_analista_rs || ''} 
                                                onChange={e => setFormData({
                                                    ...formData, 
                                                    id_analista_rs: e.target.value ? Number(e.target.value) : undefined
                                                })} 
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setFormData({...formData, id_analista_rs: user?.id})}
                                                className="px-3 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 whitespace-nowrap text-sm font-medium"
                                                title="Atribuir a mim"
                                            >
                                                👤 Eu ({user?.id})
                                            </button>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">
                                            O candidato ficará exclusivo para este analista por 60 dias.
                                            {!formData.id_analista_rs && (
                                                <span className="text-orange-600 font-medium"> ⚠️ Sem analista = sem exclusividade</span>
                                            )}
                                        </p>
                                        {editingPessoa?.data_final_exclusividade && (
                                            <p className="text-xs text-blue-600 mt-1">
                                                📅 Exclusividade atual até: {new Date(editingPessoa.data_final_exclusividade).toLocaleDateString('pt-BR')}
                                            </p>
                                        )}
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
                                            <span className="text-xs text-gray-500">Pretensão Salarial</span>
                                            <p className="font-medium">{formatarSalario(detailsPessoa.pretensao_salarial)}</p>
                                        </div>
                                    </div>

                                    {/* 🆕 Dados Pessoais Detalhados */}
                                    <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                                        <h4 className="font-bold text-gray-700 text-sm">👤 Dados Pessoais</h4>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            <div>
                                                <span className="text-xs text-gray-500">Data Nascimento</span>
                                                <p className="text-sm font-medium">
                                                    {detailsPessoa.data_nascimento 
                                                        ? new Date(detailsPessoa.data_nascimento + 'T00:00:00').toLocaleDateString('pt-BR')
                                                        : '-'}
                                                </p>
                                            </div>
                                            <div>
                                                <span className="text-xs text-gray-500">Estado Civil</span>
                                                <p className="text-sm font-medium capitalize">{detailsPessoa.estado_civil || '-'}</p>
                                            </div>
                                            <div>
                                                <span className="text-xs text-gray-500">CPF</span>
                                                <p className="text-sm font-medium">{detailsPessoa.cpf || '-'}</p>
                                            </div>
                                            <div>
                                                <span className="text-xs text-gray-500">RG</span>
                                                <p className="text-sm font-medium">{detailsPessoa.rg || '-'}</p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            <div>
                                                <span className="text-xs text-gray-500">Cidade/UF</span>
                                                <p className="text-sm font-medium">
                                                    {detailsPessoa.cidade ? `${detailsPessoa.cidade}/${detailsPessoa.estado}` : '-'}
                                                </p>
                                            </div>
                                            <div>
                                                <span className="text-xs text-gray-500">Bairro</span>
                                                <p className="text-sm font-medium">{detailsPessoa.bairro || '-'}</p>
                                            </div>
                                            <div>
                                                <span className="text-xs text-gray-500">CEP</span>
                                                <p className="text-sm font-medium">{detailsPessoa.cep || '-'}</p>
                                            </div>
                                            <div>
                                                <span className="text-xs text-gray-500">Telefone</span>
                                                <p className="text-sm font-medium">{detailsPessoa.telefone || '-'}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 🆕 Valores e Regime */}
                                    <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                                        <h4 className="font-bold text-gray-700 text-sm">💰 Valores e Regime de Contratação</h4>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                            <div>
                                                <span className="text-xs text-gray-500">Valor Hora Atual</span>
                                                <p className="text-sm font-medium">
                                                    {detailsPessoa.valor_hora_atual ? `R$ ${detailsPessoa.valor_hora_atual}` : '-'}
                                                </p>
                                            </div>
                                            <div>
                                                <span className="text-xs text-gray-500">Pretensão Valor Hora</span>
                                                <p className="text-sm font-medium">
                                                    {detailsPessoa.pretensao_valor_hora ? `R$ ${detailsPessoa.pretensao_valor_hora}` : '-'}
                                                </p>
                                            </div>
                                            <div>
                                                <span className="text-xs text-gray-500">Regime PJ</span>
                                                <div className="flex flex-wrap gap-1 mt-0.5">
                                                    {detailsPessoa.ja_trabalhou_pj && <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">Já trabalhou PJ</span>}
                                                    {detailsPessoa.aceita_pj && <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">Aceita PJ</span>}
                                                    {detailsPessoa.possui_empresa && <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded">Possui empresa</span>}
                                                    {detailsPessoa.aceita_abrir_empresa && <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded">Aceita abrir</span>}
                                                    {!detailsPessoa.ja_trabalhou_pj && !detailsPessoa.aceita_pj && <span className="text-xs text-gray-400">Não informado</span>}
                                                </div>
                                            </div>
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

                                    {/* Skills - Layout Melhorado */}
                                    <div>
                                        <h4 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
                                            <Code size={18} className="text-purple-600" />
                                            Skills ({detailsSkills.length})
                                        </h4>
                                        {detailsSkills.length > 0 ? (
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr className="bg-gray-100 text-left">
                                                            <th className="px-3 py-2 rounded-tl-lg">Skill</th>
                                                            <th className="px-3 py-2">Categoria</th>
                                                            <th className="px-3 py-2">Nível</th>
                                                            <th className="px-3 py-2 rounded-tr-lg text-center">Anos Exp.</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {detailsSkills.map((skill, i) => (
                                                            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                                                <td className="px-3 py-2 font-medium">
                                                                    <span className={`inline-block px-2 py-0.5 rounded text-xs mr-2 ${
                                                                        CATEGORIAS_SKILL[skill.skill_categoria as keyof typeof CATEGORIAS_SKILL]?.cor || 'bg-gray-100 text-gray-700'
                                                                    }`}>
                                                                        {skill.skill_nome}
                                                                    </span>
                                                                </td>
                                                                <td className="px-3 py-2 text-gray-600 capitalize">
                                                                    {CATEGORIAS_SKILL[skill.skill_categoria as keyof typeof CATEGORIAS_SKILL]?.label || skill.skill_categoria}
                                                                </td>
                                                                <td className="px-3 py-2">
                                                                    <span className={`px-2 py-0.5 rounded text-xs ${
                                                                        skill.nivel === 'especialista' ? 'bg-purple-100 text-purple-700' :
                                                                        skill.nivel === 'avancado' ? 'bg-green-100 text-green-700' :
                                                                        skill.nivel === 'intermediario' ? 'bg-blue-100 text-blue-700' :
                                                                        'bg-gray-100 text-gray-700'
                                                                    }`}>
                                                                        {skill.nivel === 'especialista' ? 'Especialista' :
                                                                         skill.nivel === 'avancado' ? 'Avançado' :
                                                                         skill.nivel === 'intermediario' ? 'Intermediário' :
                                                                         'Básico'}
                                                                    </span>
                                                                </td>
                                                                <td className="px-3 py-2 text-center font-semibold">
                                                                    {skill.anos_experiencia > 0 ? `${skill.anos_experiencia}` : '-'}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : (
                                            <p className="text-gray-500 text-sm">Nenhuma skill cadastrada</p>
                                        )}
                                    </div>

                                    {/* Formação Acadêmica e Certificações */}
                                    <div>
                                        <h4 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
                                            <GraduationCap size={18} className="text-blue-600" />
                                            Formação e Certificações ({detailsFormacao.length})
                                        </h4>
                                        {detailsFormacao.length > 0 ? (
                                            <div className="space-y-2">
                                                {/* Formação Acadêmica */}
                                                {detailsFormacao.filter(f => f.tipo !== 'certificacao').length > 0 && (
                                                    <div className="mb-4">
                                                        <h5 className="text-sm font-semibold text-gray-600 mb-2">Formação Acadêmica</h5>
                                                        {detailsFormacao.filter(f => f.tipo !== 'certificacao').map((form, i) => (
                                                            <div key={i} className="bg-blue-50 rounded-lg p-3 mb-2">
                                                                <div className="flex justify-between items-start">
                                                                    <div>
                                                                        <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 capitalize">
                                                                            {form.tipo?.replace('_', ' ')}
                                                                        </span>
                                                                        <h5 className="font-semibold text-gray-800 mt-1">{form.curso}</h5>
                                                                        <p className="text-sm text-gray-600">{form.instituicao}</p>
                                                                    </div>
                                                                    {form.ano_conclusao && (
                                                                        <span className="text-sm text-gray-500">{form.ano_conclusao}</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                
                                                {/* Certificações */}
                                                {detailsFormacao.filter(f => f.tipo === 'certificacao').length > 0 && (
                                                    <div>
                                                        <h5 className="text-sm font-semibold text-gray-600 mb-2">Certificações ({detailsFormacao.filter(f => f.tipo === 'certificacao').length})</h5>
                                                        <div className="flex flex-wrap gap-2">
                                                            {detailsFormacao.filter(f => f.tipo === 'certificacao').map((cert, i) => (
                                                                <span 
                                                                    key={i}
                                                                    className="px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-sm"
                                                                    title={cert.instituicao || ''}
                                                                >
                                                                    🏆 {cert.curso}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-gray-500 text-sm">Nenhuma formação cadastrada</p>
                                        )}
                                    </div>

                                    {/* Idiomas */}
                                    <div>
                                        <h4 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
                                            <Globe size={18} className="text-teal-600" />
                                            Idiomas ({detailsIdiomas.length})
                                        </h4>
                                        {detailsIdiomas.length > 0 ? (
                                            <div className="flex flex-wrap gap-3">
                                                {detailsIdiomas.map((idioma, i) => (
                                                    <div key={i} className="flex items-center gap-2 bg-teal-50 px-4 py-2 rounded-lg">
                                                        <span className="font-medium text-teal-800">{idioma.idioma}</span>
                                                        <span className={`px-2 py-0.5 rounded text-xs ${
                                                            idioma.nivel === 'fluente' || idioma.nivel === 'nativo' ? 'bg-teal-200 text-teal-800' :
                                                            idioma.nivel === 'avancado' ? 'bg-green-100 text-green-700' :
                                                            idioma.nivel === 'intermediario' ? 'bg-blue-100 text-blue-700' :
                                                            'bg-gray-100 text-gray-700'
                                                        }`}>
                                                            {idioma.nivel === 'fluente' ? 'Fluente' :
                                                             idioma.nivel === 'nativo' ? 'Nativo' :
                                                             idioma.nivel === 'avancado' ? 'Avançado' :
                                                             idioma.nivel === 'intermediario' ? 'Intermediário' :
                                                             'Básico'}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-gray-500 text-sm">Nenhum idioma cadastrado</p>
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
                                                        {exp.tecnologias_usadas && exp.tecnologias_usadas.length > 0 && (
                                                            <div className="flex flex-wrap gap-1 mt-2">
                                                                {exp.tecnologias_usadas.map((tech: string, j: number) => (
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

            {/* ============================================ */}
            {/* 🆕 MODAL DE ANEXOS */}
            {/* ============================================ */}
            {anexosOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b">
                            <div className="flex items-center gap-2">
                                <Paperclip size={20} className="text-amber-600" />
                                <h3 className="font-bold text-gray-800">
                                    Anexos do Candidato
                                </h3>
                                <span className="text-sm text-gray-400">({anexos.length})</span>
                            </div>
                            <button 
                                onClick={() => setAnexosOpen(null)}
                                className="p-1 hover:bg-gray-100 rounded"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Upload */}
                        <div className="p-4 border-b bg-gray-50">
                            <label className={`flex items-center justify-center gap-2 py-3 px-4 border-2 border-dashed 
                                rounded-lg cursor-pointer transition-colors ${
                                    uploadingAnexo 
                                        ? 'border-gray-300 bg-gray-100 cursor-wait' 
                                        : 'border-blue-300 hover:bg-blue-50 hover:border-blue-400'
                                }`}>
                                {uploadingAnexo ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin text-blue-500" />
                                        <span className="text-sm text-blue-600">Enviando...</span>
                                    </>
                                ) : (
                                    <>
                                        <Upload size={18} className="text-blue-500" />
                                        <span className="text-sm text-blue-600 font-medium">
                                            Enviar novo anexo
                                        </span>
                                        <span className="text-xs text-gray-400">
                                            (PDF, DOCX, JPG, PNG, XLS — máx. 10MB)
                                        </span>
                                    </>
                                )}
                                <input
                                    type="file"
                                    className="hidden"
                                    disabled={uploadingAnexo}
                                    accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.txt,.xlsx,.xls"
                                    onChange={(e) => handleUploadAnexo(e, anexosOpen)}
                                />
                            </label>
                        </div>

                        {/* Lista de Anexos */}
                        <div className="flex-1 overflow-y-auto p-4">
                            {loadingAnexos ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 size={24} className="animate-spin text-gray-400" />
                                </div>
                            ) : anexos.length === 0 ? (
                                <div className="text-center py-8 text-gray-400">
                                    <Paperclip size={40} className="mx-auto mb-2 opacity-30" />
                                    <p className="text-sm">Nenhum anexo encontrado</p>
                                    <p className="text-xs mt-1">Faça upload de documentos do candidato</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {anexos.map((anexo: any) => (
                                        <div key={anexo.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 group">
                                            <span className="text-lg">{getIconeArquivo(anexo.tipo_arquivo)}</span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-800 truncate">
                                                    {anexo.nome_arquivo}
                                                </p>
                                                <p className="text-xs text-gray-400">
                                                    {formatarTamanho(anexo.tamanho_bytes)} • {new Date(anexo.created_at).toLocaleDateString('pt-BR')}
                                                </p>
                                            </div>
                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <a
                                                    href={anexo.url_publica}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="p-1.5 text-blue-600 hover:bg-blue-100 rounded"
                                                    title="Baixar"
                                                >
                                                    <Download size={16} />
                                                </a>
                                                <button
                                                    onClick={() => handleExcluirAnexo(anexo)}
                                                    className="p-1.5 text-red-500 hover:bg-red-100 rounded"
                                                    title="Excluir"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BancoTalentos_v3;
