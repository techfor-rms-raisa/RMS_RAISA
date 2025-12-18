
import React, { useState, useEffect } from 'react';
import { User, CandidaturaEnvio } from '../types';
import { useMockData } from '../../hooks/useMockData';

interface ControleEnviosProps {
  currentUser: User;
}

const ControleEnvios: React.FC<ControleEnviosProps> = ({ currentUser }) => {
  const { envios, candidaturas, vagas, pessoas, clients } = useMockData();
  const [loading, setLoading] = useState(false); // Simulated loading
  const [filtros, setFiltros] = useState({
    status: '',
    data_inicio: '',
    data_fim: ''
  });

  // Calculate Metrics based on Mock Data
  const totalEnvios = envios.length;
  const aprovados = envios.filter(e => e.status === 'visualizado').length; // Mock logic
  const reprovados = 0;
  const taxaAprovacao = totalEnvios > 0 ? Math.round((aprovados / totalEnvios) * 100) : 0;

  // Enhance Envios with Relation Data
  const enviosEnriched = envios.map(envio => {
      const candidatura = candidaturas.find(c => c.id === envio.candidatura_id);
      const pessoa = pessoas.find(p => p.id === candidatura?.pessoa_id);
      const vaga = vagas.find(v => v.id === envio.vaga_id);
      // Mock Client Name (would ideally come from client_id)
      const clientName = "Cliente Exemplo"; 

      return {
          ...envio,
          candidato_nome: pessoa?.nome || 'Desconhecido',
          vaga_titulo: vaga?.titulo || 'Desconhecida',
          cliente_nome: clientName
      };
  });

  if (loading) {
    return <div className="p-6">Carregando...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">📤 Controle de Envios</h1>
        <p className="text-gray-600 mt-1">
          Acompanhe envios e aprovações de CVs
        </p>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-lg p-4 border-l-4 border-blue-500">
            <div className="text-3xl font-bold text-blue-600">{totalEnvios}</div>
            <div className="text-sm text-gray-600">CVs Enviados</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border-l-4 border-green-500">
            <div className="text-3xl font-bold text-green-600">{aprovados}</div>
            <div className="text-sm text-gray-600">Visualizados</div>
          </div>
          <div className="bg-red-50 rounded-lg p-4 border-l-4 border-red-500">
            <div className="text-3xl font-bold text-red-600">{reprovados}</div>
            <div className="text-sm text-gray-600">Reprovados</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 border-l-4 border-purple-500">
            <div className="text-3xl font-bold text-purple-600">{taxaAprovacao}%</div>
            <div className="text-sm text-gray-600">Taxa de Conversão</div>
          </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={filtros.status}
              onChange={(e) => setFiltros({ ...filtros, status: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2"
            >
              <option value="">Todos</option>
              <option value="enviado">Enviado</option>
              <option value="visualizado">Visualizado</option>
              <option value="em_analise">Em Análise</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data Início</label>
            <input
              type="date"
              value={filtros.data_inicio}
              onChange={(e) => setFiltros({ ...filtros, data_inicio: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data Fim</label>
            <input
              type="date"
              value={filtros.data_fim}
              onChange={(e) => setFiltros({ ...filtros, data_fim: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2"
            />
          </div>
        </div>
      </div>

      {/* Tabela de Envios */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
                <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Candidato</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vaga</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Enviado Em</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Meio</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ações</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
                {enviosEnriched.map((envio) => (
                <tr key={envio.id}>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{envio.candidato_nome}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{envio.vaga_titulo}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{envio.cliente_nome}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(envio.enviado_em).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-6 py-4 text-sm">
                    <span className="px-2 py-1 rounded bg-blue-100 text-blue-800 text-xs uppercase">
                        {envio.meio_envio}
                    </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-1 rounded text-xs uppercase font-bold ${
                        envio.status === 'enviado' ? 'bg-yellow-100 text-yellow-800' :
                        envio.status === 'visualizado' ? 'bg-blue-100 text-blue-800' :
                        'bg-green-100 text-green-800'
                    }`}>
                        {envio.status}
                    </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                    <button className="text-blue-600 hover:underline">Detalhes</button>
                    </td>
                </tr>
                ))}
            </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};

export default ControleEnvios;
