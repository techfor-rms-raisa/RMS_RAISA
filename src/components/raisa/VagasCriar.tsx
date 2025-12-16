import React, { useState, useMemo } from 'react';
import { Vaga, Cliente, User } from '../types';

interface VagasCriarProps {
    addVaga: (v: any) => void;
    clientes: Cliente[];
    users: User[];
}

const VagasCriar: React.FC<VagasCriarProps> = ({ addVaga, clientes, users }) => {
    const [formData, setFormData] = useState<Partial<Vaga>>({
        titulo: '', 
        descricao: '', 
        senioridade: 'Pleno', 
        stack_tecnologica: [], 
        status: 'aberta',
        cliente_id: undefined,
        analista_id: undefined
    });
    const [techInput, setTechInput] = useState('');

    const gestoresComerciais = useMemo(() => 
        users.filter(u => u.tipo_usuario === 'Gestão Comercial'), 
    [users]);

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.cliente_id) {
            alert('Por favor, selecione um cliente.');
            return;
        }
        if (!formData.analista_id) {
            alert('Por favor, selecione um gestor comercial.');
            return;
        }
        addVaga(formData);
        // Reset form after submission
        setFormData({ titulo: '', descricao: '', senioridade: 'Pleno', stack_tecnologica: [], status: 'aberta', cliente_id: undefined, analista_id: undefined });
    };

    const addTech = () => {
        if (techInput && !formData.stack_tecnologica?.includes(techInput)) {
            setFormData({ ...formData, stack_tecnologica: [...(formData.stack_tecnologica || []), techInput] });
            setTechInput('');
        }
    };

    return (
        <div className="p-6 bg-gray-50 min-h-full">
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Criar Nova Vaga</h1>
            <form onSubmit={handleSave} className="space-y-4 max-w-4xl mx-auto bg-white p-8 rounded-lg shadow">
                
                <input className="w-full border p-2 rounded" placeholder="Título da Vaga" value={formData.titulo} onChange={e => setFormData({...formData, titulo: e.target.value})} required />
                
                <textarea className="w-full border p-2 rounded h-32" placeholder="Descrição Detalhada da Vaga" value={formData.descricao} onChange={e => setFormData({...formData, descricao: e.target.value})} required />
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <select className="border p-2 rounded bg-white" value={formData.cliente_id || ''} onChange={e => setFormData({...formData, cliente_id: parseInt(e.target.value)})} required>
                        <option value="" disabled>Selecione o Cliente</option>
                        {clientes.map(c => <option key={c.id} value={c.id}>{c.nome_cliente}</option>)}
                    </select>

                    <select className="border p-2 rounded bg-white" value={formData.analista_id || ''} onChange={e => setFormData({...formData, analista_id: parseInt(e.target.value)})} required>
                        <option value="" disabled>Selecione o Gestor Comercial</option>
                        {gestoresComerciais.map(g => <option key={g.id} value={g.id}>{g.nome_usuario}</option>)}
                    </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <select className="border p-2 rounded bg-white" value={formData.senioridade} onChange={e => setFormData({...formData, senioridade: e.target.value as any})}>
                        <option>Junior</option><option>Pleno</option><option>Senior</option><option>Especialista</option>
                    </select>
                    <select className="border p-2 rounded bg-white" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as any})}>
                        <option value="aberta">Aberta</option><option value="pausada">Pausada</option><option value="fechada">Fechada</option>
                    </select>
                </div>
                
                <div>
                    <label className="text-sm font-bold text-gray-700">Stack Tecnológica</label>
                    <div className="flex gap-2 mt-1">
                        <input className="border p-2 rounded flex-1" value={techInput} onChange={e => setTechInput(e.target.value)} placeholder="Ex: React, Node.js, Python" />
                        <button type="button" onClick={addTech} className="bg-gray-200 px-4 rounded hover:bg-gray-300 font-semibold">Adicionar</button>
                    </div>
                    <div className="flex gap-2 mt-2 flex-wrap">
                        {formData.stack_tecnologica?.map((tech, index) => (
                            <span key={index} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm flex items-center">
                                {tech}
                                <button type="button" onClick={() => setFormData({...formData, stack_tecnologica: formData.stack_tecnologica?.filter(t => t !== tech)})} className="ml-2 text-blue-600 hover:text-blue-800">x</button>
                            </span>
                        ))}
                    </div>
                </div>

                <div className="flex justify-end gap-4 pt-4 mt-4 border-t">
                    <button type="button" onClick={() => setFormData({})} className="px-4 py-2 border rounded text-gray-700 hover:bg-gray-100">Limpar</button>
                    <button type="submit" className="px-6 py-2 bg-orange-600 text-white rounded font-bold hover:bg-orange-700">Salvar Vaga</button>
                </div>
            </form>
        </div>
    );
};

export default VagasCriar;
