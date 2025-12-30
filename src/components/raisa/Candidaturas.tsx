/**
 * Candidaturas.tsx - RMS RAISA v53.0
 * Componente de Gestão de Candidaturas (ATUALIZADO)
 * 
 * NOVIDADES v53.0:
 * - Botão "+ Nova Candidatura" com modal integrado
 * - Resumo visual de status no header
 * - Integração com NovaCandidaturaModal
 * - Salvamento automático no Banco de Talentos
 * 
 * Data: 30/12/2025
 */

import React, { useState, useMemo } from 'react';
import { 
  Plus, Filter, Search, RefreshCw, 
  User, Mail, Calendar, ChevronDown,
  FileText, Briefcase
} from 'lucide-react';
import { Candidatura, Vaga, Pessoa } from '@/types';
import NovaCandidaturaModal from './NovaCandidaturaModal';

// ============================================
// TIPOS
// ============================================

interface CandidaturasProps {
    candidaturas: Candidatura[];
    vagas: Vaga[];
    pessoas: Pessoa[];
    updateStatus: (id: string, status: any) => void;
    onReload?: () => void;
    currentUserId?: number;
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const Candidaturas: React.FC<CandidaturasProps> = ({ 
    candidaturas = [], 
    vagas = [], 
    pessoas = [], 
    updateStatus,
    onReload,
    currentUserId = 1
}) => {
    // Estados
    const [filterVaga, setFilterVaga] = useState<string>('all');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);

    // ✅ Garantir arrays seguros
    const safeCandidaturas = Array.isArray(candidaturas) ? candidaturas : [];
    const safeVagas = Array.isArray(vagas) ? vagas : [];
    const safePessoas = Array.isArray(pessoas) ? pessoas : [];

    // ============================================
    // CONTADORES POR STATUS
    // ============================================
    
    const contadores = useMemo(() => {
        return {
            triagem: safeCandidaturas.filter(c => c.status === 'triagem').length,
            entrevista: safeCandidaturas.filter(c => c.status === 'entrevista').length,
            teste_tecnico: safeCandidaturas.filter(c => c.status === 'teste_tecnico').length,
            enviado_cliente: safeCandidaturas.filter(c => c.status === 'enviado_cliente').length,
            aguardando_cliente: safeCandidaturas.filter(c => c.status === 'aguardando_cliente').length,
            aprovado: safeCandidaturas.filter(c => 
                c.status === 'aprovado' || 
                c.status === 'aprovado_interno' || 
                c.status === 'aprovado_cliente'
            ).length,
            reprovado: safeCandidaturas.filter(c => 
                c.status === 'reprovado' || 
                c.status === 'reprovado_interno' || 
                c.status === 'reprovado_cliente'
            ).length,
            total: safeCandidaturas.length
        };
    }, [safeCandidaturas]);

    // ============================================
    // FILTROS
    // ============================================

    const candidaturasFiltradas = useMemo(() => {
        let filtered = safeCandidaturas;
        
        // Filtro por vaga
        if (filterVaga !== 'all') {
            filtered = filtered.filter(c => String(c.vaga_id) === filterVaga);
        }
        
        // Filtro por status
        if (filterStatus !== 'all') {
            filtered = filtered.filter(c => c.status === filterStatus);
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
    }, [filterVaga, filterStatus, searchTerm, safeCandidaturas]);

    // ============================================
    // HELPERS
    // ============================================

    const getVagaName = (vagaId: string | number | undefined): string => {
        if (!vagaId) return 'Vaga não definida';
        const vagaIdStr = String(vagaId);
        const vaga = safeVagas.find(v => String(v.id) === vagaIdStr);
        return vaga?.titulo || `Vaga #${vagaId}`;
    };

    const getCandidatoName = (candidatura: Candidatura): string => {
        if (candidatura.candidato_nome) {
            return candidatura.candidato_nome;
        }
        if (candidatura.pessoa_id) {
            const pessoaIdStr = String(candidatura.pessoa_id);
            const pessoa = safePessoas.find(p => String(p.id) === pessoaIdStr);
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

    // Cores dos status
    const statusColors: Record<string, string> = {
        'triagem': 'bg-gray-100 text-gray-800',
        'entrevista': 'bg-blue-100 text-blue-800',
        'teste_tecnico': 'bg-yellow-100 text-yellow-800',
        'aprovado': 'bg-green-100 text-green-800',
        'aprovado_interno': 'bg-green-100 text-green-800',
        'aprovado_cliente': 'bg-emerald-100 text-emerald-800',
        'reprovado': 'bg-red-100 text-red-800',
        'reprovado_interno': 'bg-red-100 text-red-800',
        'reprovado_cliente': 'bg-rose-100 text-rose-800',
        'enviado_cliente': 'bg-purple-100 text-purple-800',
        'aguardando_cliente': 'bg-orange-100 text-orange-800'
    };

    // Labels amigáveis para status
    const statusLabels: Record<string, string> = {
        'triagem': 'Triagem',
        'entrevista': 'Entrevista',
        'teste_tecnico': 'Teste Técnico',
        'aprovado': 'Aprovado',
        'aprovado_interno': 'Aprovado Interno',
        'aprovado_cliente': 'Aprovado Cliente',
        'reprovado': 'Reprovado',
        'reprovado_interno': 'Reprovado Interno',
        'reprovado_cliente': 'Reprovado Cliente',
        'enviado_cliente': 'Enviado ao Cliente',
        'aguardando_cliente': 'Aguardando Cliente'
    };

    // Handler para candidatura criada
    const handleCandidaturaCriada = (candidaturaId: number) => {
        console.log('✅ Nova candidatura criada:', candidaturaId);
        if (onReload) {
            onReload();
        }
    };

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
            {/* RESUMO DE STATUS */}
            {/* ============================================ */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                <div 
                    onClick={() => setFilterStatus('triagem')}
                    className={`bg-white rounded-xl p-4 border-2 cursor-pointer transition-all hover:shadow-md ${filterStatus === 'triagem' ? 'border-gray-500' : 'border-gray-100'}`}
                >
                    <p className="text-2xl font-bold text-gray-700">{contadores.triagem}</p>
                    <p className="text-xs text-gray-500">Triagem</p>
                </div>
                <div 
                    onClick={() => setFilterStatus('entrevista')}
                    className={`bg-white rounded-xl p-4 border-2 cursor-pointer transition-all hover:shadow-md ${filterStatus === 'entrevista' ? 'border-blue-500' : 'border-gray-100'}`}
                >
                    <p className="text-2xl font-bold text-blue-600">{contadores.entrevista}</p>
                    <p className="text-xs text-gray-500">Entrevista</p>
                </div>
                <div 
                    onClick={() => setFilterStatus('teste_tecnico')}
                    className={`bg-white rounded-xl p-4 border-2 cursor-pointer transition-all hover:shadow-md ${filterStatus === 'teste_tecnico' ? 'border-yellow-500' : 'border-gray-100'}`}
                >
                    <p className="text-2xl font-bold text-yellow-600">{contadores.teste_tecnico}</p>
                    <p className="text-xs text-gray-500">Teste Téc.</p>
                </div>
                <div 
                    onClick={() => setFilterStatus('enviado_cliente')}
                    className={`bg-white rounded-xl p-4 border-2 cursor-pointer transition-all hover:shadow-md ${filterStatus === 'enviado_cliente' ? 'border-purple-500' : 'border-gray-100'}`}
                >
                    <p className="text-2xl font-bold text-purple-600">{contadores.enviado_cliente}</p>
                    <p className="text-xs text-gray-500">Env. Cliente</p>
                </div>
                <div 
                    onClick={() => setFilterStatus('aguardando_cliente')}
                    className={`bg-white rounded-xl p-4 border-2 cursor-pointer transition-all hover:shadow-md ${filterStatus === 'aguardando_cliente' ? 'border-orange-500' : 'border-gray-100'}`}
                >
                    <p className="text-2xl font-bold text-orange-600">{contadores.aguardando_cliente}</p>
                    <p className="text-xs text-gray-500">Aguard.</p>
                </div>
                <div 
                    onClick={() => setFilterStatus('aprovado')}
                    className={`bg-white rounded-xl p-4 border-2 cursor-pointer transition-all hover:shadow-md ${filterStatus === 'aprovado' ? 'border-green-500' : 'border-gray-100'}`}
                >
                    <p className="text-2xl font-bold text-green-600">{contadores.aprovado}</p>
                    <p className="text-xs text-gray-500">Aprovados</p>
                </div>
                <div 
                    onClick={() => setFilterStatus('reprovado')}
                    className={`bg-white rounded-xl p-4 border-2 cursor-pointer transition-all hover:shadow-md ${filterStatus === 'reprovado' ? 'border-red-500' : 'border-gray-100'}`}
                >
                    <p className="text-2xl font-bold text-red-600">{contadores.reprovado}</p>
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
                    
                    {/* Filtro por Vaga */}
                    <select 
                        className="border border-gray-200 p-2 rounded-lg focus:ring-2 focus:ring-orange-500 min-w-[200px]" 
                        value={filterVaga} 
                        onChange={e => setFilterVaga(e.target.value)}
                    >
                        <option value="all">Todas as Vagas</option>
                        {safeVagas.map(v => (
                            <option key={v.id} value={String(v.id)}>
                                {v.titulo}
                            </option>
                        ))}
                    </select>
                    
                    {/* Filtro por Status */}
                    <select 
                        className="border border-gray-200 p-2 rounded-lg focus:ring-2 focus:ring-orange-500 min-w-[150px]" 
                        value={filterStatus} 
                        onChange={e => setFilterStatus(e.target.value)}
                    >
                        <option value="all">Todos os Status</option>
                        <option value="triagem">Triagem</option>
                        <option value="entrevista">Entrevista</option>
                        <option value="teste_tecnico">Teste Técnico</option>
                        <option value="enviado_cliente">Enviado Cliente</option>
                        <option value="aguardando_cliente">Aguardando Cliente</option>
                        <option value="aprovado">Aprovado</option>
                        <option value="reprovado">Reprovado</option>
                    </select>
                    
                    {/* Botão Limpar */}
                    {(filterVaga !== 'all' || filterStatus !== 'all' || searchTerm) && (
                        <button
                            onClick={() => {
                                setFilterVaga('all');
                                setFilterStatus('all');
                                setSearchTerm('');
                            }}
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
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        Data
                                    </th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        Ações
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {candidaturasFiltradas.map(c => (
                                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
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
                                        <td className="px-6 py-4 whitespace-nowrap text-right">
                                            <select 
                                                value={c.status || 'triagem'} 
                                                onChange={(e) => updateStatus(c.id, e.target.value)}
                                                className="border border-gray-200 rounded-lg text-sm p-2 focus:ring-2 focus:ring-orange-500 bg-white"
                                            >
                                                <option value="triagem">Triagem</option>
                                                <option value="entrevista">Entrevista</option>
                                                <option value="teste_tecnico">Teste Técnico</option>
                                                <option value="enviado_cliente">Enviado Cliente</option>
                                                <option value="aguardando_cliente">Aguard. Cliente</option>
                                                <option value="aprovado_interno">Aprovado Int.</option>
                                                <option value="aprovado_cliente">Aprovado Cliente</option>
                                                <option value="aprovado">Aprovado</option>
                                                <option value="reprovado_interno">Reprovado Int.</option>
                                                <option value="reprovado_cliente">Reprovado Cliente</option>
                                                <option value="reprovado">Reprovado</option>
                                            </select>
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
                            {filterVaga !== 'all' && ` para "${getVagaName(filterVaga)}"`}
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
        </div>
    );
};

export default Candidaturas;
