import React, { useState, useEffect } from 'react';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { Vaga, Client, User } from '../types';

interface VagasCriarProps {
  onVagaCriada: (novaVaga: Vaga) => void;
}

const VagasCriar: React.FC<VagasCriarProps> = ({ onVagaCriada }) => {
  const { clients, users, addVaga, loading: dataLoading, error: dataError } = useSupabaseData();
  const [novaVaga, setNovaVaga] = useState<Omit<Vaga, 'id'>>({
    titulo: '',
    descricao: '',
    senioridade: 'Junior',
    stack_tecnologica: [],
    status: 'aberta',
    cliente_id: null,
    analista_id: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gestoresComerciais = users.filter(u => u.tipo_usuario === 'Gestão Comercial');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setNovaVaga(prev => ({ ...prev, [name]: value }));
  };

  const handleStackChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setNovaVaga(prev => ({ ...prev, stack_tecnologica: value.split(',').map(s => s.trim()) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaVaga.cliente_id || !novaVaga.analista_id) {
      setError('Por favor, selecione um cliente e um gestor comercial.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const vagaCriada = await addVaga(novaVaga);
      onVagaCriada(vagaCriada);
      // Reset form
      setNovaVaga({
        titulo: '',
        descricao: '',
        senioridade: 'Junior',
        stack_tecnologica: [],
        status: 'aberta',
        cliente_id: null,
        analista_id: null,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4">Criar Nova Vaga</h2>
      {dataLoading && <p>Carregando dados...</p>}
      {dataError && <p className="text-red-500">Erro ao carregar dados: {dataError}</p>}
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Cliente</label>
            <select name="cliente_id" value={novaVaga.cliente_id || ''} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md" required>
              <option value="" disabled>Selecione o Cliente</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>{client.razao_social_cliente}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Gestor Comercial</label>
            <select name="analista_id" value={novaVaga.analista_id || ''} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md" required>
              <option value="" disabled>Selecione o Gestor</option>
              {gestoresComerciais.map(user => (
                <option key={user.id} value={user.id}>{user.nome_usuario}</option>
              ))}
            </select>
          </div>
          {/* Outros campos do formulário */}
        </div>
        <div className="mt-4">
          <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-md disabled:bg-gray-400">
            {loading ? 'Salvando...' : 'Salvar Vaga'}
          </button>
        </div>
        {error && <p className="text-red-500 mt-4">{error}</p>}
      </form>
    </div>
  );
};

export default VagasCriar;
