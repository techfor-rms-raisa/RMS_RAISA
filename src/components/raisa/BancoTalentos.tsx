import React, { useState } from 'react';
import { Pessoa } from '../types';

interface TalentosProps {
    pessoas: Pessoa[];
    addPessoa: (p: any) => void;
    updatePessoa: (p: Pessoa) => void;
}

const BancoTalentos: React.FC<TalentosProps> = ({ pessoas, addPessoa, updatePessoa }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPessoa, setEditingPessoa] = useState<Pessoa | null>(null);
    const [formData, setFormData] = useState<Partial<Pessoa>>({ nome: '', email: '', telefone: '', linkedin_url: '' });

    const filtered = pessoas.filter(p => 
        p.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const openModal = (p?: Pessoa) => {
        if (p) {
            setEditingPessoa(p);
            setFormData(p);
        } else {
            setEditingPessoa(null);
            setFormData({ nome: '', email: '', telefone: '', linkedin_url: '' });
        }
        setIsModalOpen(true);
    };

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        if (editingPessoa) {
            updatePessoa({ ...editingPessoa, ...formData } as Pessoa);
        } else {
            addPessoa(formData);
        }
        setIsModalOpen(false);
    };

    return (
        <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800">Banco de Talentos</h2>
                <button onClick={() => openModal()} className="bg-[#1E3A8A] text-white px-4 py-2 rounded">+ Novo Talento</button>
            </div>

            <div className="mb-6">
                <input 
                    className="w-full border p-3 rounded-lg bg-gray-50"
                    placeholder="Buscar por nome ou email..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Nome</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Contato</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">LinkedIn</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filtered.map(p => (
                            <tr key={p.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{p.nome}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    <div>{p.email}</div>
                                    <div className="text-xs">{p.telefone}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600">
                                    {p.linkedin_url && <a href={p.linkedin_url} target="_blank" rel="noreferrer">Perfil</a>}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <button onClick={() => openModal(p)} className="text-gray-600 hover:text-blue-600 font-medium">Editar</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg p-6 max-w-md w-full">
                        <h3 className="text-lg font-bold mb-4">{editingPessoa ? 'Editar' : 'Adicionar'} Talento</h3>
                        <form onSubmit={handleSave} className="space-y-4">
                            <input className="w-full border p-2 rounded" placeholder="Nome" value={formData.nome} onChange={e => setFormData({...formData, nome: e.target.value})} required />
                            <input className="w-full border p-2 rounded" placeholder="Email" type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} required />
                            <input className="w-full border p-2 rounded" placeholder="Telefone" value={formData.telefone} onChange={e => setFormData({...formData, telefone: e.target.value})} />
                            <input className="w-full border p-2 rounded" placeholder="URL LinkedIn" value={formData.linkedin_url} onChange={e => setFormData({...formData, linkedin_url: e.target.value})} />
                            <div className="flex justify-end gap-2 mt-6">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border rounded">Cancelar</button>
                                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Salvar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BancoTalentos;