import React, { useState, useEffect } from 'react';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { Vaga, Client, User } from '@/types';
import { Plus, X } from 'lucide-react';

interface VagasCriarProps {
  onVagaCriada?: (novaVaga: Vaga) => void;
}

const VagasCriar: React.FC<VagasCriarProps> = ({ onVagaCriada }) => {
  const { clients, users, addVaga, loading: dataLoading, error: dataError } = useSupabaseData();
  
  const [novaVaga, setNovaVaga] = useState<Omit<Vaga, 'id' | 'criado_em' | 'atualizado_em' | 'created_at' | 'updated_at'>>({
    titulo: '',
    descricao: '',
    senioridade: 'Junior',
    stack_tecnologica: [],
    salario_min: null,
    salario_max: null,
    status: 'aberta',
    requisitos_obrigatorios: null,
    requisitos_desejaveis: null,
    regime_contratacao: null,
    modalidade: null,
    beneficios: null,
    cliente_id: null,
    analista_id: null,
    urgente: false,
    prazo_fechamento: null,
    faturamento_mensal: null,
  });

  const [stackInput, setStackInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const gestoresComerciais = users.filter(u => u.tipo_usuario === 'Gestão Comercial');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setNovaVaga(prev => ({ ...prev, [name]: checked }));
    } else if (type === 'number') {
      setNovaVaga(prev => ({ ...prev, [name]: value ? parseFloat(value) : null }));
    } else {
      setNovaVaga(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleAddStack = () => {
    if (stackInput.trim()) {
      setNovaVaga(prev => ({
        ...prev,
        stack_tecnologica: [...prev.stack_tecnologica, stackInput.trim()]
      }));
      setStackInput('');
    }
  };

  const handleRemoveStack = (index: number) => {
    setNovaVaga(prev => ({
      ...prev,
      stack_tecnologica: prev.stack_tecnologica.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!novaVaga.titulo.trim()) {
      setError('Por favor, preencha o título da vaga.');
      return;
    }
    
    if (!novaVaga.cliente_id) {
      setError('Por favor, selecione um cliente.');
      return;
    }
    
    if (!novaVaga.analista_id) {
      setError('Por favor, selecione um gestor comercial.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const vagaCriada = await addVaga(novaVaga);
      setSuccessMessage('Vaga criada com sucesso!');
      
      if (onVagaCriada) {
        onVagaCriada(vagaCriada);
      }

      // Reset form
      setNovaVaga({
        titulo: '',
        descricao: '',
        senioridade: 'Junior',
        stack_tecnologica: [],
        salario_min: null,
        salario_max: null,
        status: 'aberta',
        requisitos_obrigatorios: null,
        requisitos_desejaveis: null,
        regime_contratacao: null,
        modalidade: null,
        beneficios: null,
        cliente_id: null,
        analista_id: null,
        urgente: false,
        prazo_fechamento: null,
        faturamento_mensal: null,
      });
      setStackInput('');

      // Limpar mensagem de sucesso após 3 segundos
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Erro ao criar vaga');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Criar Nova Vaga</h2>

      {dataLoading && <p className="text-blue-600">Carregando dados...</p>}
      {dataError && <p className="text-red-600 mb-4">Erro ao carregar dados: {dataError}</p>}
      {error && <p className="text-red-600 mb-4 p-3 bg-red-50 rounded">{error}</p>}
      {successMessage && <p className="text-green-600 mb-4 p-3 bg-green-50 rounded">{successMessage}</p>}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Seção 1: Informações Básicas */}
        <div className="border-t pt-4">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Informações Básicas</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Título da Vaga *</label>
              <input
                type="text"
                name="titulo"
                value={novaVaga.titulo}
                onChange={handleChange}
                placeholder="Ex: Desenvolvedor React Sênior"
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senioridade</label>
              <select
                name="senioridade"
                value={novaVaga.senioridade}
                onChange={handleChange}
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Junior">Junior</option>
                <option value="Pleno">Pleno</option>
                <option value="Senior">Senior</option>
              </select>
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição da Vaga</label>
            <textarea
              name="descricao"
              value={novaVaga.descricao}
              onChange={handleChange}
              placeholder="Descreva os detalhes da vaga..."
              rows={4}
              className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Seção 2: Cliente e Gestor */}
        <div className="border-t pt-4">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Cliente e Gestor</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cliente *</label>
              <select
                name="cliente_id"
                value={novaVaga.cliente_id || ''}
                onChange={handleChange}
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Selecione o Cliente</option>
                {clients.map(client => (
                  <option key={client.id} value={client.id}>
                    {client.razao_social_cliente}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gestor Comercial *</label>
              <select
                name="analista_id"
                value={novaVaga.analista_id || ''}
                onChange={handleChange}
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Selecione o Gestor</option>
                {gestoresComerciais.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.nome_usuario}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Seção 3: Stack Tecnológica */}
        <div className="border-t pt-4">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Stack Tecnológica</h3>
          
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={stackInput}
              onChange={(e) => setStackInput(e.target.value)}
              placeholder="Ex: React, Node.js, PostgreSQL"
              className="flex-1 p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddStack())}
            />
            <button
              type="button"
              onClick={handleAddStack}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus size={18} /> Adicionar
            </button>
          </div>

          {novaVaga.stack_tecnologica.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {novaVaga.stack_tecnologica.map((tech, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 bg-blue-100 text-blue-800 px-3 py-1 rounded-full"
                >
                  <span>{tech}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveStack(index)}
                    className="hover:text-red-600"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Seção 4: Salário e Contratação */}
        <div className="border-t pt-4">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Salário e Contratação</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Salário Mínimo (R$)</label>
              <input
                type="number"
                name="salario_min"
                value={novaVaga.salario_min || ''}
                onChange={handleChange}
                placeholder="0.00"
                step="0.01"
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Salário Máximo (R$)</label>
              <input
                type="number"
                name="salario_max"
                value={novaVaga.salario_max || ''}
                onChange={handleChange}
                placeholder="0.00"
                step="0.01"
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Regime de Contratação</label>
              <input
                type="text"
                name="regime_contratacao"
                value={novaVaga.regime_contratacao || ''}
                onChange={handleChange}
                placeholder="Ex: CLT, PJ, Autônomo"
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Modalidade</label>
              <input
                type="text"
                name="modalidade"
                value={novaVaga.modalidade || ''}
                onChange={handleChange}
                placeholder="Ex: Presencial, Remoto, Híbrido"
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Seção 5: Informações Adicionais */}
        <div className="border-t pt-4">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Informações Adicionais</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                name="status"
                value={novaVaga.status}
                onChange={handleChange}
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="aberta">Aberta</option>
                <option value="fechada">Fechada</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prazo de Fechamento</label>
              <input
                type="date"
                name="prazo_fechamento"
                value={novaVaga.prazo_fechamento || ''}
                onChange={handleChange}
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Faturamento Mensal (R$)</label>
              <input
                type="number"
                name="faturamento_mensal"
                value={novaVaga.faturamento_mensal || ''}
                onChange={handleChange}
                placeholder="0.00"
                step="0.01"
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                name="urgente"
                checked={novaVaga.urgente}
                onChange={handleChange}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <label className="ml-2 text-sm font-medium text-gray-700">Vaga Urgente</label>
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Benefícios</label>
            <textarea
              name="beneficios"
              value={novaVaga.beneficios || ''}
              onChange={handleChange}
              placeholder="Descreva os benefícios oferecidos..."
              rows={3}
              className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Requisitos Obrigatórios</label>
            <textarea
              name="requisitos_obrigatorios"
              value={novaVaga.requisitos_obrigatorios || ''}
              onChange={handleChange}
              placeholder="Descreva os requisitos obrigatórios..."
              rows={3}
              className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Requisitos Desejáveis</label>
            <textarea
              name="requisitos_desejaveis"
              value={novaVaga.requisitos_desejaveis || ''}
              onChange={handleChange}
              placeholder="Descreva os requisitos desejáveis..."
              rows={3}
              className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="border-t pt-4 flex gap-4">
          <button
            type="submit"
            disabled={loading || dataLoading}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 font-medium"
          >
            {loading ? 'Salvando...' : 'Salvar Vaga'}
          </button>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="px-6 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 font-medium"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
};

export default VagasCriar;
