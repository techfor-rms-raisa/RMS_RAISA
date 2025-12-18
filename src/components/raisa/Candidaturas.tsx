import React, { useState } from 'react';
import { Candidatura, Vaga, Pessoa } from '../types';

interface CandidaturasProps {
    candidaturas: Candidatura[];
    vagas: Vaga[];
    pessoas: Pessoa[];
    updateStatus: (id: string, status: any) => void;
}

const Candidaturas: React.FC<CandidaturasProps> = ({ candidaturas, vagas, pessoas, updateStatus }) => {
    const [filterVaga, setFilterVaga] = useState('all');

    const filtered = candidaturas.filter(c => filterVaga === 'all' || c.vaga_id === filterVaga);

    const getVagaName = (id: string) => vagas.find(v => v.id === id)?.titulo || 'Vaga desconhecida';
    const getPessoaName = (id: string) => pessoas.find(p => p.id === id)?.nome || 'Desconhecido';

    const statusColors: any = {
        'triagem': 'bg-gray-100 text-gray-800',
        'entrevista': 'bg-blue-100 text-blue-800',
        'teste_tecnico': 'bg-yellow-100 text-yellow-800',
        'aprovado': 'bg-green-100 text-green-800',
        'reprovado': 'bg-red-100 text-red-800'
    };

    return (
        <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800">Candidaturas</h2>
                <select className="border p-2 rounded" value={filterVaga} onChange={e => setFilterVaga(e.target.value)}>
                    <option value="all">Todas as Vagas</option>
                    {vagas.map(v => <option key={v.id} value={v.id}>{v.titulo}</option>)}
                </select>
            </div>

            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Candidato</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Vaga</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Data</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Status</th>
                        <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase">Ações</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {filtered.map(c => (
                        <tr key={c.id}>
                            <td className="px-6 py-4 whitespace-nowrap font-medium">{getPessoaName(c.pessoa_id)}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{getVagaName(c.vaga_id)}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(c.createdAt).toLocaleDateString()}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`px-2 py-1 text-xs rounded uppercase font-bold ${statusColors[c.status]}`}>
                                    {c.status.replace('_', ' ')}
                                </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <select 
                                    value={c.status} 
                                    onChange={(e) => updateStatus(c.id, e.target.value)}
                                    className="border rounded text-xs p-1"
                                >
                                    <option value="triagem">Triagem</option>
                                    <option value="entrevista">Entrevista</option>
                                    <option value="teste_tecnico">Teste Téc.</option>
                                    <option value="aprovado">Aprovado</option>
                                    <option value="reprovado">Reprovado</option>
                                </select>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default Candidaturas;