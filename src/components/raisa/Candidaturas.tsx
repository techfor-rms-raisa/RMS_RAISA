/**
 * Candidaturas.tsx - RMS RAISA v55.0
 * Componente de Gestão de Candidaturas (ATUALIZADO)
 * 
 * FLUXO DE STATUS (Processos Internos):
 * Triagem → Entrevista → Aprovado/Reprovado
 * Aprovado → Envio Cliente → Aguardando → Entrevista Cliente
 * Entrevista Cliente → Aprovado Cliente/Reprovado Cliente
 * Aprovado Cliente → Contratado → (Consultor Ativo após Ficha)
 * 
 * NOVIDADES v55.0:
 * - 🆕 Filtro por Cliente (dropdown)
 * - Modal de Detalhes da Candidatura ao clicar na linha
 * - Histórico de mudanças de status
 * - Ações rápidas para mudar status
 * - Motivo obrigatório para reprovação
 * - Fluxo ajustado conforme processos internos
 * 
 * Data: 08/01/2026
 */

import React, { useState, useMemo } from 'react';
import { 
  Plus, Filter, Search, RefreshCw, 
  User, Mail, Calendar, ChevronDown,
  FileText, Briefcase, Eye, Building2
} from 'lucide-react';
import { Candidatura, Vaga, Pessoa } from '@/types';
import NovaCandidaturaModal from './NovaCandidaturaModal';
import DetalhesCandidaturaModal from './DetalhesCandidaturaModal';

// ============================================
// TIPOS
// ============================================

// Tipo compatível com a interface Client do sistema
interface ClienteInfo {
    id: number | string;
    razao_social_cliente?: string; // Nome usado no sistema principal
    nome?: string; // Fallback
}

interface CandidaturasProps {
    candidaturas: Candidatura[];
    vagas: Vaga[];
    pessoas: Pessoa[];
    clientes?: ClienteInfo[]; // 🆕 Lista de clientes (opcional)
    updateStatus: (id: string, status: any) => void;
    onReload?: () => void;
    currentUserId?: number;
    currentUserName?: string;
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const Candidaturas: React.FC<CandidaturasProps> = ({ 
    candidaturas = [], 
    vagas = [], 
    pessoas = [],
    clientes = [], // 🆕 
    updateStatus,
    onReload,
    currentUserId = 1,
    currentUserName = 'Usuário'
}) => {
    // Estados
    const [filterVaga, setFilterVaga] = useState<string>('all');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [filterCliente, setFilterCliente] = useState<string>('all'); // 🆕 Filtro por cliente
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    // Estado para modal de detalhes
    const [candidaturaSelecionada, setCandidaturaSelecionada] = useState<Candidatura | null>(null);
    const [isDetalhesModalOpen, setIsDetalhesModalOpen] = useState(false);

    // ✅ Garantir arrays seguros
    const safeCandidaturas = Array.isArray(candidaturas) ? candidaturas : [];
    const safeVagas = Array.isArray(vagas) ? vagas : [];
    const safePessoas = Array.isArray(pessoas) ? pessoas : [];
    const safeClientes = Array.isArray(clientes) ? clientes : [];

    // ============================================
    // 🆕 EXTRAIR CLIENTES ÚNICOS DAS VAGAS
    // ============================================
    
    const clientesDisponiveis = useMemo(() => {
        // Se temos lista de clientes via props, usar ela (prioridade)
        if (safeClientes.length > 0) {
            return safeClientes
                .filter(c => c.razao_social_cliente || c.nome) // Apenas com nome
                .map(c => ({
                    id: c.id,
                    nome: c.razao_social_cliente || c.nome || `Cliente #${c.id}`
                }))
                .sort((a, b) => a.nome.localeCompare(b.nome));
        }
        
        // Caso contrário, extrair das vagas
        const clientesMap = new Map<string, { id: string | number; nome: string }>();
        
        safeVagas.forEach(vaga => {
            const vagaAny = vaga as any;
            
            // Tentar diferentes formatos de cliente
            if (vagaAny.cliente_id && vagaAny.cliente_nome) {
                clientesMap.set(String(vagaAny.cliente_id), {
                    id: vagaAny.cliente_id,
                    nome: vagaAny.cliente_nome
                });
            } else if (vagaAny.cliente?.id && (vagaAny.cliente?.razao_social_cliente || vagaAny.cliente?.nome)) {
                clientesMap.set(String(vagaAny.cliente.id), {
                    id: vagaAny.cliente.id,
                    nome: vagaAny.cliente.razao_social_cliente || vagaAny.cliente.nome
                });
            } else if (vagaAny.cliente_id) {
                // Só temos o ID, buscar na lista de clientes se disponível
                const clienteEncontrado = safeClientes.find(c => 
                    String(c.id) === String(vagaAny.cliente_id)
                );
                clientesMap.set(String(vagaAny.cliente_id), {
                    id: vagaAny.cliente_id,
                    nome: clienteEncontrado?.razao_social_cliente || 
                          clienteEncontrado?.nome || 
                          `Cliente #${vagaAny.cliente_id}`
                });
            }
        });
        
        return Array.from(clientesMap.values()).sort((a, b) => 
            a.nome.localeCompare(b.nome)
        );
    }, [safeVagas, safeClientes]);

    // ============================================
    // HELPER: Obter cliente_id da vaga
    // ============================================
    
    const getClienteIdFromVaga = (vagaId: string | number | undefined): string | null => {
        if (!vagaId) return null;
        const vaga = safeVagas.find(v => String(v.id) === String(vagaId));
        if (!vaga) return null;
        
        const vagaAny = vaga as any;
        if (vagaAny.cliente_id) return String(vagaAny.cliente_id);
        if (vagaAny.cliente?.id) return String(vagaAny.cliente.id);
        return null;
    };

    const getClienteNomeFromVaga = (vagaId: string | number | undefined): string => {
        if (!vagaId) return '-';
        const vaga = safeVagas.find(v => String(v.id) === String(vagaId));
        if (!vaga) return '-';
        
        const vagaAny = vaga as any;
        
        // Tentar obter nome diretamente da vaga
        if (vagaAny.cliente_nome) return vagaAny.cliente_nome;
        if (vagaAny.cliente?.razao_social_cliente) return vagaAny.cliente.razao_social_cliente;
        if (vagaAny.cliente?.nome) return vagaAny.cliente.nome;
        
        // Se só tem ID, buscar na lista de clientes
        if (vagaAny.cliente_id) {
            const clienteEncontrado = safeClientes.find(c => 
                String(c.id) === String(vagaAny.cliente_id)
            );
            if (clienteEncontrado?.razao_social_cliente) return clienteEncontrado.razao_social_cliente;
            if (clienteEncontrado?.nome) return clienteEncontrado.nome;
            return `Cliente #${vagaAny.cliente_id}`;
        }
        
        return '-';
    };

    // ============================================
    // CONTADORES POR STATUS
    // ============================================
    
    const contadores = useMemo(() => {
        // Aplicar filtro de cliente aos contadores também
        let candidaturasParaContar = safeCandidaturas;
        
        if (filterCliente !== 'all') {
            candidaturasParaContar = candidaturasParaContar.filter(c => {
                const clienteId = getClienteIdFromVaga(c.vaga_id);
                return clienteId === filterCliente;
            });
        }
        
        return {
            triagem: candidaturasParaContar.filter(c => c.status === 'triagem').length,
            entrevista: candidaturasParaContar.filter(c => c.status === 'entrevista').length,
            aprovado: candidaturasParaContar.filter(c => c.status === 'aprovado').length,
            enviado_cliente: candidaturasParaContar.filter(c => c.status === 'enviado_cliente').length,
            aguardando_cliente: candidaturasParaContar.filter(c => c.status === 'aguardando_cliente').length,
            entrevista_cliente: candidaturasParaContar.filter(c => c.status === 'entrevista_cliente').length,
            aprovado_cliente: candidaturasParaContar.filter(c => c.status === 'aprovado_cliente').length,
            contratado: candidaturasParaContar.filter(c => c.status === 'contratado').length,
            reprovado: candidaturasParaContar.filter(c => 
                c.status === 'reprovado' || 
                c.status === 'reprovado_cliente'
            ).length,
            total: candidaturasParaContar.length
        };
    }, [safeCandidaturas, filterCliente, safeVagas]);

    // ============================================
    // FILTROS
    // ============================================

    const candidaturasFiltradas = useMemo(() => {
        let filtered = safeCandidaturas;
        
        // 🆕 Filtro por cliente
        if (filterCliente !== 'all') {
            filtered = filtered.filter(c => {
                const clienteId = getClienteIdFromVaga(c.vaga_id);
                return clienteId === filterCliente;
            });
        }
        
        // Filtro por vaga
        if (filterVaga !== 'all') {
            filtered = filtered.filter(c => String(c.vaga_id) === filterVaga);
        }
        
        // Filtro por status
        if (filterStatus !== 'all') {
            if (filterStatus === 'reprovado') {
                filtered = filtered.filter(c => 
                    c.status === 'reprovado' || 
                    c.status === 'reprovado_cliente'
                );
            } else {
                filtered = filtered.filter(c => c.status === filterStatus);
            }
        }
        
        // Filtro por busca
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(c => 
                (c.candidato_nome || '').toLowerCase().includes(term) ||
                (c.candidato_email || '').toLowerCase().includes(term)
            );
        }
        
        return filtered;
    }, [filterVaga, filterStatus, filterCliente, searchTerm, safeCandidaturas, safeVagas]);

    // ============================================
    // 🆕 VAGAS FILTRADAS POR CLIENTE
    // ============================================
    
    const vagasFiltradas = useMemo(() => {
        if (filterCliente === 'all') return safeVagas;
        
        return safeVagas.filter(vaga => {
            const vagaAny = vaga as any;
            const clienteId = vagaAny.cliente_id || vagaAny.cliente?.id;
            return String(clienteId) === filterCliente;
        });
    }, [safeVagas, filterCliente]);

    // ============================================
    // HELPERS
    // ============================================

    const getVagaName = (vagaId: string | number | undefined): string => {
        if (!vagaId) return 'Vaga não definida';
        const vagaIdStr = String(vagaId);
        const vaga = safeVagas.find(v => String(v.id) === vagaIdStr);
        return vaga?.titulo || `Vaga #${vagaId}`;
    };

    const getVagaById = (vagaId: string | number | undefined): Vaga | undefined => {
        if (!vagaId) return undefined;
        const vagaIdStr = String(vagaId);
        return safeVagas.find(v => String(v.id) === vagaIdStr);
    };

    const getPessoaById = (pessoaId: string | number | undefined): Pessoa | undefined => {
        if (!pessoaId) return undefined;
        const pessoaIdStr = String(pessoaId);
        return safePessoas.find(p => String(p.id) === pessoaIdStr);
    };

    const getCandidatoName = (candidatura: Candidatura): string => {
        if (candidatura.candidato_nome) {
            return candidatura.candidato_nome;
        }
        if (candidatura.pessoa_id) {
            const pessoa = getPessoaById(candidatura.pessoa_id);
            if (pessoa?.nome) return pessoa.nome;
        }
        return 'Candidato não identificado';
    };

    const formatDate = (dateStr: string | undefined): string => {
        if (!dateStr) return '-';
        try {
            return new Date(dateStr).toLocaleDateString('pt-BR');
        } catch {
            return '-';
        }
    };

    // Cores dos status - FLUXO ATUALIZADO
    const statusColors: Record<string, string> = {
        'triagem': 'bg-gray-100 text-gray-800',
        'entrevista': 'bg-blue-100 text-blue-800',
        'aprovado': 'bg-green-100 text-green-800',
        'reprovado': 'bg-red-100 text-red-800',
        'enviado_cliente': 'bg-purple-100 text-purple-800',
        'aguardando_cliente': 'bg-orange-100 text-orange-800',
        'entrevista_cliente': 'bg-indigo-100 text-indigo-800',
        'aprovado_cliente': 'bg-emerald-100 text-emerald-800',
        'reprovado_cliente': 'bg-rose-100 text-rose-800',
        'contratado': 'bg-teal-100 text-teal-800'
    };

    // Labels amigáveis para status - FLUXO ATUALIZADO
    const statusLabels: Record<string, string> = {
        'triagem': 'Triagem',
        'entrevista': 'Entrevista',
        'aprovado': 'Aprovado',
        'reprovado': 'Reprovado',
        'enviado_cliente': 'Enviado ao Cliente',
        'aguardando_cliente': 'Aguardando Cliente',
        'entrevista_cliente': 'Entrevista Cliente',
        'aprovado_cliente': 'Aprovado pelo Cliente',
        'reprovado_cliente': 'Reprovado pelo Cliente',
        'contratado': 'Contratado'
    };

    // 🆕 Labels para status_posicao da VAGA (posição no funil)
    const statusPosicaoLabels: Record<string, string> = {
        'triagem': '📋 Triagem',
        'entrevista': '🎯 Entrevista',
        'enviado_cliente': '📤 Enviado ao Cliente',
        'aguardando_cliente': '⏳ Aguardando Cliente',
        'entrevista_cliente': '🏢 Entrevista Cliente',
        'aprovado_cliente': '✅ Aprovado pelo Cliente',
        'contratado': '🎉 Contratado',
        'reprovado': '❌ Reprovado'
    };

    // 🆕 Cores para status_posicao da VAGA
    const statusPosicaoColors: Record<string, string> = {
        'triagem': 'bg-gray-100 text-gray-700',
        'entrevista': 'bg-blue-100 text-blue-700',
        'enviado_cliente': 'bg-purple-100 text-purple-700',
        'aguardando_cliente': 'bg-yellow-100 text-yellow-700',
        'entrevista_cliente': 'bg-indigo-100 text-indigo-700',
        'aprovado_cliente': 'bg-green-100 text-green-700',
        'contratado': 'bg-teal-100 text-teal-700',
        'reprovado': 'bg-red-100 text-red-700'
    };

    // ============================================
    // HANDLERS
    // ============================================

    const handleCandidaturaCriada = (candidaturaId: number) => {
        console.log('✅ Nova candidatura criada:', candidaturaId);
        if (onReload) {
            onReload();
        }
    };

    const handleAbrirDetalhes = (candidatura: Candidatura) => {
        setCandidaturaSelecionada(candidatura);
        setIsDetalhesModalOpen(true);
    };

    const handleStatusChange = (novoStatus: string, motivo?: string) => {
        if (candidaturaSelecionada) {
            updateStatus(candidaturaSelecionada.id, novoStatus);
            // Atualizar candidatura selecionada localmente
            setCandidaturaSelecionada({
                ...candidaturaSelecionada,
                status: novoStatus as any
            });
        }
    };

    const handleFecharDetalhes = () => {
        setIsDetalhesModalOpen(false);
        setCandidaturaSelecionada(null);
        if (onReload) {
            onReload();
        }
    };

    // 🆕 Handler para limpar todos os filtros
    const handleLimparFiltros = () => {
        setFilterVaga('all');
        setFilterStatus('all');
        setFilterCliente('all');
        setSearchTerm('');
    };

    // Verificar se há filtros ativos
    const temFiltrosAtivos = filterVaga !== 'all' || filterStatus !== 'all' || filterCliente !== 'all' || searchTerm;

    // ============================================
    // RENDER
    // ============================================

    return (
        <div className="p-6 space-y-6">
            
            {/* ============================================ */}
            {/* HEADER */}
            {/* ============================================ */}
            <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Briefcase className="w-7 h-7 text-orange-500" />
                        Gestão de Candidaturas
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">
                        Gerencie candidatos associados às vagas
                        {filterCliente !== 'all' && (
                            <span className="ml-2 text-orange-600 font-medium">
                                • Filtrando por: {clientesDisponiveis.find(c => String(c.id) === filterCliente)?.nome}
                            </span>
                        )}
                    </p>
                </div>
                
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-6 py-3 rounded-xl font-semibold hover:shadow-lg transition-all flex items-center gap-2"
                >
                    <Plus className="w-5 h-5" />
                    Nova Candidatura
                </button>
            </div>

            {/* ============================================ */}
            {/* RESUMO DE STATUS - FLUXO ATUALIZADO */}
            {/* ============================================ */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-2">
                <div 
                    onClick={() => setFilterStatus(filterStatus === 'triagem' ? 'all' : 'triagem')}
                    className={`bg-white rounded-xl p-3 border-2 cursor-pointer transition-all hover:shadow-md ${filterStatus === 'triagem' ? 'border-gray-500 shadow-md' : 'border-gray-100'}`}
                >
                    <p className="text-xl font-bold text-gray-700">{contadores.triagem}</p>
                    <p className="text-xs text-gray-500">Triagem</p>
                </div>
                <div 
                    onClick={() => setFilterStatus(filterStatus === 'entrevista' ? 'all' : 'entrevista')}
                    className={`bg-white rounded-xl p-3 border-2 cursor-pointer transition-all hover:shadow-md ${filterStatus === 'entrevista' ? 'border-blue-500 shadow-md' : 'border-gray-100'}`}
                >
                    <p className="text-xl font-bold text-blue-600">{contadores.entrevista}</p>
                    <p className="text-xs text-gray-500">Entrevista</p>
                </div>
                <div 
                    onClick={() => setFilterStatus(filterStatus === 'aprovado' ? 'all' : 'aprovado')}
                    className={`bg-white rounded-xl p-3 border-2 cursor-pointer transition-all hover:shadow-md ${filterStatus === 'aprovado' ? 'border-green-500 shadow-md' : 'border-gray-100'}`}
                >
                    <p className="text-xl font-bold text-green-600">{contadores.aprovado}</p>
                    <p className="text-xs text-gray-500">Aprovado</p>
                </div>
                <div 
                    onClick={() => setFilterStatus(filterStatus === 'enviado_cliente' ? 'all' : 'enviado_cliente')}
                    className={`bg-white rounded-xl p-3 border-2 cursor-pointer transition-all hover:shadow-md ${filterStatus === 'enviado_cliente' ? 'border-purple-500 shadow-md' : 'border-gray-100'}`}
                >
                    <p className="text-xl font-bold text-purple-600">{contadores.enviado_cliente}</p>
                    <p className="text-xs text-gray-500">Env. Cliente</p>
                </div>
                <div 
                    onClick={() => setFilterStatus(filterStatus === 'aguardando_cliente' ? 'all' : 'aguardando_cliente')}
                    className={`bg-white rounded-xl p-3 border-2 cursor-pointer transition-all hover:shadow-md ${filterStatus === 'aguardando_cliente' ? 'border-orange-500 shadow-md' : 'border-gray-100'}`}
                >
                    <p className="text-xl font-bold text-orange-600">{contadores.aguardando_cliente}</p>
                    <p className="text-xs text-gray-500">Aguard.</p>
                </div>
                <div 
                    onClick={() => setFilterStatus(filterStatus === 'entrevista_cliente' ? 'all' : 'entrevista_cliente')}
                    className={`bg-white rounded-xl p-3 border-2 cursor-pointer transition-all hover:shadow-md ${filterStatus === 'entrevista_cliente' ? 'border-indigo-500 shadow-md' : 'border-gray-100'}`}
                >
                    <p className="text-xl font-bold text-indigo-600">{contadores.entrevista_cliente}</p>
                    <p className="text-xs text-gray-500">Ent. Cliente</p>
                </div>
                <div 
                    onClick={() => setFilterStatus(filterStatus === 'aprovado_cliente' ? 'all' : 'aprovado_cliente')}
                    className={`bg-white rounded-xl p-3 border-2 cursor-pointer transition-all hover:shadow-md ${filterStatus === 'aprovado_cliente' ? 'border-emerald-500 shadow-md' : 'border-gray-100'}`}
                >
                    <p className="text-xl font-bold text-emerald-600">{contadores.aprovado_cliente}</p>
                    <p className="text-xs text-gray-500">Aprov. Cli.</p>
                </div>
                <div 
                    onClick={() => setFilterStatus(filterStatus === 'contratado' ? 'all' : 'contratado')}
                    className={`bg-white rounded-xl p-3 border-2 cursor-pointer transition-all hover:shadow-md ${filterStatus === 'contratado' ? 'border-teal-500 shadow-md' : 'border-gray-100'}`}
                >
                    <p className="text-xl font-bold text-teal-600">{contadores.contratado}</p>
                    <p className="text-xs text-gray-500">Contratado</p>
                </div>
                <div 
                    onClick={() => setFilterStatus(filterStatus === 'reprovado' ? 'all' : 'reprovado')}
                    className={`bg-white rounded-xl p-3 border-2 cursor-pointer transition-all hover:shadow-md ${filterStatus === 'reprovado' ? 'border-red-500 shadow-md' : 'border-gray-100'}`}
                >
                    <p className="text-xl font-bold text-red-600">{contadores.reprovado}</p>
                    <p className="text-xs text-gray-500">Reprovados</p>
                </div>
            </div>

            {/* ============================================ */}
            {/* FILTROS */}
            {/* ============================================ */}
            <div className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex flex-col md:flex-row gap-4">
                    {/* Busca */}
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar por nome ou email..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        />
                    </div>
                    
                    {/* 🆕 Filtro por Cliente */}
                    <div className="relative">
                        <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <select 
                            className="border border-gray-200 p-2 pl-9 rounded-lg focus:ring-2 focus:ring-orange-500 min-w-[180px] appearance-none bg-white" 
                            value={filterCliente} 
                            onChange={e => {
                                setFilterCliente(e.target.value);
                                // Limpar filtro de vaga quando mudar cliente
                                setFilterVaga('all');
                            }}
                        >
                            <option value="all">Todos os Clientes</option>
                            {clientesDisponiveis.map(c => (
                                <option key={c.id} value={String(c.id)}>
                                    {c.nome}
                                </option>
                            ))}
                        </select>
                    </div>
                    
                    {/* Filtro por Vaga (mostra vagas do cliente selecionado) */}
                    <select 
                        className="border border-gray-200 p-2 rounded-lg focus:ring-2 focus:ring-orange-500 min-w-[200px]" 
                        value={filterVaga} 
                        onChange={e => setFilterVaga(e.target.value)}
                    >
                        <option value="all">
                            {filterCliente !== 'all' ? 'Todas as Vagas do Cliente' : 'Todas as Vagas'}
                        </option>
                        {vagasFiltradas.map(v => (
                            <option key={v.id} value={String(v.id)}>
                                {v.titulo} {v.status_posicao ? `(${statusPosicaoLabels[v.status_posicao] || v.status_posicao})` : ''}
                            </option>
                        ))}
                    </select>
                    
                    {/* 🆕 Badge do Status Posição da Vaga Selecionada */}
                    {filterVaga !== 'all' && (() => {
                        const vagaSelecionada = safeVagas.find(v => String(v.id) === filterVaga);
                        const statusPosicao = vagaSelecionada?.status_posicao || 'triagem';
                        return (
                            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${statusPosicaoColors[statusPosicao] || 'bg-gray-100 text-gray-700'}`}>
                                <span>📍</span>
                                <span>{statusPosicaoLabels[statusPosicao] || statusPosicao}</span>
                            </div>
                        );
                    })()}
                    
                    {/* Filtro por Status - FLUXO ATUALIZADO */}
                    <select 
                        className="border border-gray-200 p-2 rounded-lg focus:ring-2 focus:ring-orange-500 min-w-[180px]" 
                        value={filterStatus} 
                        onChange={e => setFilterStatus(e.target.value)}
                    >
                        <option value="all">Todos os Status</option>
                        <option value="triagem">Triagem</option>
                        <option value="entrevista">Entrevista</option>
                        <option value="aprovado">Aprovado</option>
                        <option value="enviado_cliente">Enviado ao Cliente</option>
                        <option value="aguardando_cliente">Aguardando Cliente</option>
                        <option value="entrevista_cliente">Entrevista Cliente</option>
                        <option value="aprovado_cliente">Aprovado pelo Cliente</option>
                        <option value="contratado">Contratado</option>
                        <option value="reprovado">Reprovados (todos)</option>
                    </select>
                    
                    {/* Botão Limpar */}
                    {temFiltrosAtivos && (
                        <button
                            onClick={handleLimparFiltros}
                            className="text-gray-500 hover:text-gray-700 px-4 py-2 border border-gray-200 rounded-lg"
                        >
                            Limpar
                        </button>
                    )}
                </div>
            </div>

            {/* ============================================ */}
            {/* TABELA DE CANDIDATURAS */}
            {/* ============================================ */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                {candidaturasFiltradas.length === 0 ? (
                    <div className="text-center py-16">
                        <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500 text-lg">
                            {safeCandidaturas.length === 0 
                                ? 'Nenhuma candidatura encontrada.' 
                                : 'Nenhum resultado para os filtros aplicados.'}
                        </p>
                        <p className="text-gray-400 text-sm mt-2">
                            {safeCandidaturas.length === 0 
                                ? 'Clique em "Nova Candidatura" para começar.'
                                : 'Tente ajustar os filtros de busca.'}
                        </p>
                        {safeCandidaturas.length === 0 && (
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="mt-6 bg-orange-500 text-white px-6 py-2 rounded-lg hover:bg-orange-600 transition"
                            >
                                <Plus className="w-5 h-5 inline mr-2" />
                                Nova Candidatura
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        Candidato
                                    </th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        Vaga
                                    </th>
                                    {/* 🆕 Coluna Cliente */}
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        Cliente
                                    </th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        Data
                                    </th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        Ações
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {candidaturasFiltradas.map(c => (
                                    <tr 
                                        key={c.id} 
                                        className="hover:bg-orange-50 transition-colors cursor-pointer"
                                        onClick={() => handleAbrirDetalhes(c)}
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                                                    <User className="w-5 h-5 text-orange-600" />
                                                </div>
                                                <div>
                                                    <div className="font-medium text-gray-900">
                                                        {getCandidatoName(c)}
                                                    </div>
                                                    {c.candidato_email && (
                                                        <div className="text-sm text-gray-500 flex items-center gap-1">
                                                            <Mail className="w-3 h-3" />
                                                            {c.candidato_email}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-900">{getVagaName(c.vaga_id)}</div>
                                        </td>
                                        {/* 🆕 Célula Cliente */}
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-600 flex items-center gap-1">
                                                <Building2 className="w-3 h-3 text-gray-400" />
                                                {getClienteNomeFromVaga(c.vaga_id)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-500 flex items-center gap-1">
                                                <Calendar className="w-3 h-3" />
                                                {formatDate((c as any).criado_em || c.createdAt)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-3 py-1 text-xs rounded-full font-semibold ${statusColors[c.status] || 'bg-gray-100 text-gray-800'}`}>
                                                {statusLabels[c.status] || c.status?.replace(/_/g, ' ') || 'Indefinido'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleAbrirDetalhes(c);
                                                }}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition text-sm font-medium"
                                            >
                                                <Eye className="w-4 h-4" />
                                                Detalhes
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Footer da tabela */}
                {candidaturasFiltradas.length > 0 && (
                    <div className="px-6 py-4 bg-gray-50 border-t text-sm text-gray-500 flex justify-between items-center">
                        <span>
                            {candidaturasFiltradas.length} candidatura{candidaturasFiltradas.length !== 1 ? 's' : ''} encontrada{candidaturasFiltradas.length !== 1 ? 's' : ''}
                            {filterCliente !== 'all' && ` • ${clientesDisponiveis.find(c => String(c.id) === filterCliente)?.nome}`}
                            {filterVaga !== 'all' && ` • ${getVagaName(filterVaga)}`}
                        </span>
                        {onReload && (
                            <button
                                onClick={onReload}
                                className="text-orange-600 hover:text-orange-700 flex items-center gap-1"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Atualizar
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* ============================================ */}
            {/* MODAL NOVA CANDIDATURA */}
            {/* ============================================ */}
            <NovaCandidaturaModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                vagas={safeVagas}
                onCandidaturaCriada={handleCandidaturaCriada}
                currentUserId={currentUserId}
            />

            {/* ============================================ */}
            {/* MODAL DETALHES DA CANDIDATURA */}
            {/* ============================================ */}
            {candidaturaSelecionada && (
                <DetalhesCandidaturaModal
                    isOpen={isDetalhesModalOpen}
                    onClose={handleFecharDetalhes}
                    candidatura={candidaturaSelecionada}
                    vaga={getVagaById(candidaturaSelecionada.vaga_id)}
                    pessoa={getPessoaById(candidaturaSelecionada.pessoa_id)}
                    onStatusChange={handleStatusChange}
                    onReload={onReload}
                    currentUserId={currentUserId}
                    currentUserName={currentUserName}
                />
            )}
        </div>
    );
};

export default Candidaturas;
