import React from 'react';
import { Candidatura, Vaga, Pessoa } from '@/types';

interface PipelineProps {
    candidaturas: Candidatura[];
    vagas: Vaga[];
    pessoas: Pessoa[];
}

const Pipeline: React.FC<PipelineProps> = ({ candidaturas, vagas, pessoas }) => {
    const columns = [
        { id: 'triagem', label: 'Triagem', color: 'border-gray-400' },
        { id: 'entrevista', label: 'Entrevista', color: 'border-blue-500' },
        { id: 'teste_tecnico', label: 'Teste Técnico', color: 'border-yellow-500' },
        { id: 'aprovado', label: 'Aprovado', color: 'border-green-500' }
    ];

    const getPessoaName = (id: string) => pessoas.find(p => p.id === id)?.nome || 'Unknown';
    const getVagaTitle = (id: string) => vagas.find(v => v.id === id)?.titulo || 'Unknown';

    return (
        <div className="h-full overflow-x-auto">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">Pipeline de Contratação</h2>
            <div className="flex gap-4 min-w-[1000px] h-[calc(100vh-200px)]">
                {columns.map(col => {
                    const items = candidaturas.filter(c => c.status === col.id);
                    return (
                        <div key={col.id} className="flex-1 bg-gray-100 rounded-lg p-4 flex flex-col">
                            <div className={`border-b-4 ${col.color} pb-3 mb-4 flex justify-between items-center`}>
                                <h3 className="font-bold text-gray-700 uppercase">{col.label}</h3>
                                <span className="bg-white px-2 py-1 rounded text-sm font-bold shadow-sm">{items.length}</span>
                            </div>
                            <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                                {items.map(c => (
                                    <div key={c.id} className="bg-white p-4 rounded shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                                        <h4 className="font-bold text-gray-800">{getPessoaName(c.pessoa_id)}</h4>
                                        <p className="text-xs text-gray-500 mt-1">{getVagaTitle(c.vaga_id)}</p>
                                        <div className="mt-3 flex justify-between items-center text-xs text-gray-400">
                                            <span>{new Date(c.createdAt).toLocaleDateString()}</span>
                                            <span>#{c.id.slice(-4)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default Pipeline;