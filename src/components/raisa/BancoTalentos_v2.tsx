/**
 * BancoTalentos_v2.tsx - Banco de Talentos Expandido
 * 
 * Funcionalidades:
 * - CRUD completo de talentos
 * - Upload e processamento de CV com IA
 * - Visualização de skills extraídas
 * - Filtros avançados (senioridade, skills, disponibilidade)
 * - Indicador de CV processado
 * 
 * Versão: 2.0
 * Data: 26/12/2024
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Pessoa } from '@/types';
import CVUploadProcessor from './CVUploadProcessor';
import { supabase } from '@/config/supabase';

interface TalentosProps {
    pessoas: Pessoa[];
    addPessoa: (p: any) => void;
    updatePessoa: (p: Pessoa) => void;
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
    top_skills?: string[];
    total_skills?: number;
}

const BancoTalentos_v2: React.FC<TalentosProps> = ({ 
    pessoas, 
    addPessoa, 
    updatePessoa,
    onRefresh 
}) => {
    // Estados
    const [searchTerm, setSearchTerm] = useState('');
    const [filtroSenioridade, setFiltroSenioridade] = useState<string>('');
    const [filtroDisponibilidade, setFiltroDisponibilidade] = useState<string>('');
    const [filtroCVProcessado, setFiltroCVProcessado] = useState<string>('');
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPessoa, setEditingPessoa] = useState<PessoaExpanded | null>(null);
    
    // Estado do formulário expandido
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
    
    // Estado do processador de CV
    const [processandoCV, setProcessandoCV] = useState<{id: number, nome: string} | null>(null);
    
    // Skills do talento selecionado
    const [skillsDetalhes, setSkillsDetalhes] = useState<any[]>([]);
    const [loadingSkills, setLoadingSkills] = useState(false);
    const [modalSkillsPessoa, setModalSkillsPessoa] = useState<PessoaExpanded | null>(null);

    // Filtrar pessoas
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

    // Abrir processador de CV
    const handleProcessarCV = (pessoa: PessoaExpanded) => {
        setProcessandoCV({ id: parseInt(pessoa.id), nome: pessoa.nome });
    };

    // Quando processamento do CV completa
    const handleProcessamentoCompleto = (resultado: any) => {
        console.log('✅ Processamento completo:', resultado);
        setProcessandoCV(null);
        // Atualizar lista
        if (onRefresh) {
            onRefresh();
        }
    };

    // Carregar skills de uma pessoa
    const carregarSkills = async (pessoa: PessoaExpanded) => {
        setModalSkillsPessoa(pessoa);
        setLoadingSkills(true);
        
        try {
            const { data, error } = await supabase
                .from('pessoa_skills')
                .select('*')
                .eq('pessoa_id', parseInt(pessoa.id))
                .order('ordem');

            if (!error) {
                setSkillsDetalhes(data || []);
            }
        } catch (err) {
            console.error('Erro ao carregar skills:', err);
        } finally {
            setLoadingSkills(false);
        }
    };

    // Formatar salário
    const formatarSalario = (valor?: number) => {
        if (!valor) return '-';
        return `R$ ${valor.toLocaleString('pt-BR')}`;
    };

    return (
        <div className="bg-white rounded-lg shadow p-6">
            {/* Header */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Banco de Talentos</h2>
                    <p className="text-gray-500 text-sm">
                        {pessoasFiltradas.length} de {pessoas?.length || 0} talentos
                    </p>
                </div>
                <button 
                    onClick={() => openModal()} 
                    className="bg-[#1E3A8A] text-white px-4 py-2 rounded hover:bg-blue-800"
                >
                    + Novo Talento
                </button>
            </div>

            {/* Filtros */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                <div className="lg:col-span-2">
                    <input 
                        className="w-full border p-3 rounded-lg bg-gray-50"
                        placeholder="Buscar por nome, email ou título..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                <select
                    value={filtroSenioridade}
                    onChange={e => setFiltroSenioridade(e.target.value)}
                    className="border p-3 rounded-lg bg-gray-50"
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
                    className="border p-3 rounded-lg bg-gray-50"
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
                    className="border p-3 rounded-lg bg-gray-50"
                >
                    <option value="">CV Processado?</option>
                    <option value="sim">✅ Sim</option>
                    <option value="nao">❌ Não</option>
                </select>
            </div>

            {/* Tabela */}
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Nome</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Título</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Senioridade</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Disponibilidade</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Skills</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">CV</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {pessoasFiltradas.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                                    Nenhum talento encontrado
                                </td>
                            </tr>
                        ) : (
                            pessoasFiltradas.map(p => {
                                const pessoa = p as PessoaExpanded;
                                return (
                                    <tr key={pessoa.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-4 whitespace-nowrap">
                                            <div className="font-medium text-gray-900">{pessoa.nome}</div>
                                            <div className="text-xs text-gray-500">{pessoa.email}</div>
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-700">
                                                {pessoa.titulo_profissional || '-'}
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap">
                                            {pessoa.senioridade ? (
                                                <span className={`px-2 py-1 rounded text-xs uppercase font-medium ${
                                                    pessoa.senioridade === 'senior' ? 'bg-purple-100 text-purple-800' :
                                                    pessoa.senioridade === 'pleno' ? 'bg-blue-100 text-blue-800' :
                                                    pessoa.senioridade === 'junior' ? 'bg-green-100 text-green-800' :
                                                    'bg-orange-100 text-orange-800'
                                                }`}>
                                                    {pessoa.senioridade}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400 text-xs">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap">
                                            {pessoa.disponibilidade ? (
                                                <span className={`text-xs ${
                                                    pessoa.disponibilidade === 'imediata' 
                                                        ? 'text-green-600 font-medium' 
                                                        : 'text-gray-600'
                                                }`}>
                                                    {pessoa.disponibilidade.replace('_', ' ')}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400 text-xs">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-4">
                                            {pessoa.top_skills && pessoa.top_skills.length > 0 ? (
                                                <div className="flex flex-wrap gap-1 max-w-xs">
                                                    {pessoa.top_skills.slice(0, 3).map((skill, i) => (
                                                        <span 
                                                            key={i}
                                                            className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs"
                                                        >
                                                            {skill}
                                                        </span>
                                                    ))}
                                                    {pessoa.total_skills && pessoa.total_skills > 3 && (
                                                        <button
                                                            onClick={() => carregarSkills(pessoa)}
                                                            className="text-blue-600 text-xs hover:underline"
                                                        >
                                                            +{pessoa.total_skills - 3}
                                                        </button>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-gray-400 text-xs">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap">
                                            {pessoa.cv_processado ? (
                                                <span className="text-green-600" title="CV processado">✅</span>
                                            ) : (
                                                <span className="text-gray-400" title="CV não processado">⬜</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => handleProcessarCV(pessoa)} 
                                                    className="text-purple-600 hover:text-purple-800 font-medium"
                                                    title="Processar CV com IA"
                                                >
                                                    🤖 CV
                                                </button>
                                                <button 
                                                    onClick={() => openModal(pessoa)} 
                                                    className="text-blue-600 hover:text-blue-800"
                                                >
                                                    Editar
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal de Criação/Edição */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <h3 className="text-lg font-bold mb-4">
                            {editingPessoa ? 'Editar' : 'Adicionar'} Talento
                        </h3>
                        <form onSubmit={handleSave} className="space-y-4">
                            {/* Dados básicos */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
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
                                        className="w-full border p-2 rounded mt-1" 
                                        type="email"
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
                                        value={formData.linkedin_url} 
                                        onChange={e => setFormData({...formData, linkedin_url: e.target.value})} 
                                    />
                                </div>
                            </div>

                            {/* Dados profissionais */}
                            <div className="border-t pt-4 mt-4">
                                <h4 className="font-medium text-gray-700 mb-3">Dados Profissionais</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="col-span-2">
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
                            <div className="border-t pt-4 mt-4">
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

                            <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
                                <button 
                                    type="button" 
                                    onClick={() => setIsModalOpen(false)} 
                                    className="px-4 py-2 border rounded hover:bg-gray-50"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    type="submit" 
                                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                                >
                                    Salvar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de Skills */}
            {modalSkillsPessoa && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold">
                                Skills de {modalSkillsPessoa.nome}
                            </h3>
                            <button 
                                onClick={() => setModalSkillsPessoa(null)}
                                className="text-gray-500 hover:text-gray-700 text-2xl"
                            >
                                &times;
                            </button>
                        </div>
                        
                        {loadingSkills ? (
                            <div className="text-center py-4">Carregando...</div>
                        ) : skillsDetalhes.length === 0 ? (
                            <p className="text-gray-500 text-center py-4">
                                Nenhuma skill cadastrada. Processe o CV para extrair skills automaticamente.
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {skillsDetalhes.map((skill, i) => (
                                    <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                                        <div>
                                            <span className="font-medium">{skill.skill_nome}</span>
                                            <span className="text-xs text-gray-500 ml-2 capitalize">
                                                ({skill.skill_categoria})
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-xs px-2 py-1 rounded ${
                                                skill.nivel === 'especialista' ? 'bg-purple-100 text-purple-700' :
                                                skill.nivel === 'avancado' ? 'bg-blue-100 text-blue-700' :
                                                skill.nivel === 'intermediario' ? 'bg-green-100 text-green-700' :
                                                'bg-gray-100 text-gray-700'
                                            }`}>
                                                {skill.nivel}
                                            </span>
                                            {skill.anos_experiencia > 0 && (
                                                <span className="text-xs text-gray-500">
                                                    {skill.anos_experiencia}a
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Processador de CV */}
            {processandoCV && (
                <CVUploadProcessor
                    pessoaId={processandoCV.id}
                    pessoaNome={processandoCV.nome}
                    onProcessamentoCompleto={handleProcessamentoCompleto}
                    onClose={() => setProcessandoCV(null)}
                />
            )}
        </div>
    );
};

export default BancoTalentos_v2;
