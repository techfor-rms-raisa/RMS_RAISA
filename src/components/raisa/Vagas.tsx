import React, { useState } from 'react';
import { Vaga } from '../types';
import VagaPriorizacaoManager from './VagaPriorizacaoManager';

interface VagasProps {
    vagas: Vaga[];
    addVaga: (v: any) => void;
    updateVaga: (v: Vaga) => void;
    deleteVaga: (id: string) => void;
}

const Vagas: React.FC<VagasProps> = ({ vagas, addVaga, updateVaga, deleteVaga }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingVaga, setEditingVaga] = useState<Vaga | null>(null);
    const [priorizacaoVagaId, setPriorizacaoVagaId] = useState<string | null>(null);
    const [priorizacaoVagaTitulo, setPriorizacaoVagaTitulo] = useState<string>('');
    const [formData, setFormData] = useState<Partial<Vaga>>({
        titulo: '', descricao: '', senioridade: 'Pleno', stack_tecnologica: [], status: 'aberta'
    });
    const [techInput, setTechInput] = useState('');

    const openModal = (vaga?: Vaga) => {
        if (vaga) {
            setEditingVaga(vaga);
            setFormData(vaga);
        } else {
            setEditingVaga(null);
            setFormData({ titulo: '', descricao: '', senioridade: 'Pleno', stack_tecnologica: [], status: 'aberta' });
        }
        setIsModalOpen(true);
    };

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        if (editingVaga) {
            updateVaga({ ...editingVaga, ...formData } as Vaga);
        } else {
            addVaga(formData);
        }
        setIsModalOpen(false);
    };

    const addTech = () => {
        if (techInput && !formData.stack_tecnologica?.includes(techInput)) {
            setFormData({ ...formData, stack_tecnologica: [...(formData.stack_tecnologica || []), techInput] });
            setTechInput('');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">Gestão de Vagas</h2>
                <button onClick={() => openModal()} className="bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700">+ Nova Vaga</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {vagas.map(vaga => (
                    <div key={vaga.id} className="bg-white rounded-xl shadow-md p-6 border-l-4 border-orange-500 hover:shadow-lg transition-shadow">
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="font-bold text-lg text-gray-800">{vaga.titulo}</h3>
                            <span className={`px-2 py-1 rounded text-xs uppercase ${vaga.status === 'aberta' ? 'bg-green-100 text-green-800' : 'bg-gray-100'}`}>
                                {vaga.status}
                            </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-4 line-clamp-2">{vaga.descricao}</p>
                        <div className="mb-4">
                            <span className="text-xs font-semibold text-gray-500">Stack:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                                {vaga.stack_tecnologica.map(t => (
                                    <span key={t} className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded">{t}</span>
                                ))}
                            </div>
                        </div>
                        <div className="flex justify-between items-center pt-4 border-t">
                            <span className="text-sm font-medium text-gray-500">{vaga.senioridade}</span>
                            <div className="space-x-2">
                                <button onClick={() => { setPriorizacaoVagaId(vaga.id); setPriorizacaoVagaTitulo(vaga.titulo); }} className="text-orange-600 hover:underline text-sm font-semibold">🎯 Priorizar</button>
                                <button onClick={() => openModal(vaga)} className="text-blue-600 hover:underline text-sm">Editar</button>
                                <button onClick={() => deleteVaga(vaga.id)} className="text-red-600 hover:underline text-sm">Excluir</button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg p-8 max-w-2xl w-full">
                        <h3 className="text-xl font-bold mb-4">{editingVaga ? 'Editar' : 'Nova'} Vaga</h3>
                        <form onSubmit={handleSave} className="space-y-4">
                            <input className="w-full border p-2 rounded" placeholder="Título" value={formData.titulo} onChange={e => setFormData({...formData, titulo: e.target.value})} required />
                            <textarea className="w-full border p-2 rounded h-24" placeholder="Descrição" value={formData.descricao} onChange={e => setFormData({...formData, descricao: e.target.value})} required />
                            <div className="grid grid-cols-2 gap-4">
                                <select className="border p-2 rounded" value={formData.senioridade} onChange={e => setFormData({...formData, senioridade: e.target.value as any})}>
                                    <option>Junior</option><option>Pleno</option><option>Senior</option><option>Especialista</option>
                                </select>
                                <select className="border p-2 rounded" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as any})}>
                                    <option value="aberta">Aberta</option><option value="pausada">Pausada</option><option value="fechada">Fechada</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-sm font-bold">Stack Tecnológica</label>
                                <div className="flex gap-2 mt-1">
                                    <input className="border p-2 rounded flex-1" value={techInput} onChange={e => setTechInput(e.target.value)} placeholder="Ex: React" />
                                    <button type="button" onClick={addTech} className="bg-gray-200 px-3 rounded">Adicionar</button>
                                </div>
                                <div className="flex gap-1 mt-2 flex-wrap">
                                    {formData.stack_tecnologica?.map(t => <span key={t} className="bg-gray-100 px-2 rounded text-sm">{t}</span>)}
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 mt-6">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border rounded">Cancelar</button>
                                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Salvar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de Priorização */}
            {priorizacaoVagaId && (
                <VagaPriorizacaoManager
                    vagaId={priorizacaoVagaId}
                    vagaTitulo={priorizacaoVagaTitulo}
                    onClose={() => setPriorizacaoVagaId(null)}
                />
            )}
        </div>
    );
};
export default Vagas;;