/**
 * Candidaturas.tsx - RMS RAISA v52.7
 * Componente de Gestão de Candidaturas
 * 
 * CORREÇÃO v52.7: Alinhamento com campos do banco de dados Supabase
 * - Usa 'criado_em' ao invés de 'createdAt'
 * - Usa 'candidato_nome' diretamente ao invés de buscar em 'pessoas'
 * - Corrige comparação de vaga_id (number vs string)
 * - Adiciona tratamento seguro para dados undefined/null
 */

import React, { useState, useMemo } from 'react';
import { Candidatura, Vaga, Pessoa } from '../types';

interface CandidaturasProps {
    candidaturas: Candidatura[];
    vagas: Vaga[];
    pessoas: Pessoa[];
    updateStatus: (id: string, status: any) => void;
}

const Candidaturas: React.FC<CandidaturasProps> = ({ 
    candidaturas = [], 
    vagas = [], 
    pessoas = [], 
    updateStatus 
}) => {
    const [filterVaga, setFilterVaga] = useState<string>('all');

    // ✅ Garantir arrays seguros
    const safeCandidaturas = Array.isArray(candidaturas) ? candidaturas : [];
    const safeVagas = Array.isArray(vagas) ? vagas : [];
    const safePessoas = Array.isArray(pessoas) ? pessoas : [];

    // ✅ Filtrar candidaturas - comparação segura de tipos (number vs string)
    const filtered = useMemo(() => {
        if (filterVaga === 'all') return safeCandidaturas;
        
        return safeCandidaturas.filter(c => {
            // Comparar como string para garantir compatibilidade
            const candidaturaVagaId = String(c.vaga_id);
            return candidaturaVagaId === filterVaga;
        });
    }, [filterVaga, safeCandidaturas]);

    // ✅ Obter nome da vaga pelo ID - comparação segura
    const getVagaName = (vagaId: string | number | undefined): string => {
        if (!vagaId) return 'Vaga não definida';
        const vagaIdStr = String(vagaId);
        const vaga = safeVagas.find(v => String(v.id) === vagaIdStr);
        return vaga?.titulo || `Vaga #${vagaId}`;
    };

    // ✅ Obter nome do candidato - usa candidato_nome diretamente ou busca em pessoas
    const getCandidatoName = (candidatura: Candidatura): string => {
        // Primeiro tenta usar o campo candidato_nome que já vem preenchido
        if (candidatura.candidato_nome) {
            return candidatura.candidato_nome;
        }
        
        // Se não tiver, tenta buscar na lista de pessoas
        if (candidatura.pessoa_id) {
            const pessoaIdStr = String(candidatura.pessoa_id);
            const pessoa = safePessoas.find(p => String(p.id) === pessoaIdStr);
            if (pessoa?.nome) return pessoa.nome;
        }
        
        return 'Candidato não identificado';
    };

    // ✅ Formatar data de forma segura
    const formatDate = (dateStr: string | undefined): string => {
        if (!dateStr) return 'Data não informada';
        try {
            return new Date(dateStr).toLocaleDateString('pt-BR');
        } catch {
            return 'Data inválida';
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

    return (
        <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800">Candidaturas</h2>
                <select 
                    className="border border-gray-300 p-2 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" 
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
            </div>

            {filtered.length === 0 ? (
                <div className="text-center py-12">
                    <p className="text-gray-500 text-lg">
                        {filterVaga === 'all' 
                            ? 'Nenhuma candidatura encontrada.' 
                            : 'Nenhuma candidatura para esta vaga.'}
                    </p>
                    <p className="text-gray-400 text-sm mt-2">
                        As candidaturas aparecerão aqui quando forem criadas.
                    </p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Candidato
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Vaga
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Data
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Status
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Ações
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filtered.map(c => (
                                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="font-medium text-gray-900">
                                            {getCandidatoName(c)}
                                        </div>
                                        {c.candidato_email && (
                                            <div className="text-sm text-gray-500">
                                                {c.candidato_email}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                        {getVagaName(c.vaga_id)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {/* ✅ Usa criado_em ao invés de createdAt */}
                                        {formatDate((c as any).criado_em || c.createdAt)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 text-xs rounded uppercase font-bold ${statusColors[c.status] || 'bg-gray-100 text-gray-800'}`}>
                                            {statusLabels[c.status] || c.status?.replace(/_/g, ' ') || 'Indefinido'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <select 
                                            value={c.status || 'triagem'} 
                                            onChange={(e) => updateStatus(c.id, e.target.value)}
                                            className="border border-gray-300 rounded text-xs p-1 focus:ring-2 focus:ring-orange-500"
                                        >
                                            <option value="triagem">Triagem</option>
                                            <option value="entrevista">Entrevista</option>
                                            <option value="teste_tecnico">Teste Téc.</option>
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

            {/* Contador de resultados */}
            <div className="mt-4 text-sm text-gray-500 text-right">
                {filtered.length} candidatura{filtered.length !== 1 ? 's' : ''} encontrada{filtered.length !== 1 ? 's' : ''}
                {filterVaga !== 'all' && ` para "${getVagaName(filterVaga)}"`}
            </div>
        </div>
    );
};

export default Candidaturas;
