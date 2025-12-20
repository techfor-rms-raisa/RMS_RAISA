import React, { useState, useMemo } from 'react';
import { Consultant, Client, User, UsuarioCliente, RiskScore } from '@/types';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface AnalyticsProps {
    consultants: Consultant[];
    clients: Client[];
    usuariosCliente: UsuarioCliente[];
    users: User[];
}

const Analytics: React.FC<AnalyticsProps> = ({ consultants, clients, usuariosCliente, users }) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'risk' | 'clients' | 'managers'>('overview');

    // ============================================================================
    // CÁLCULOS DE KPIs
    // ============================================================================

    const kpis = useMemo(() => {
        const totalConsultants = consultants.length;
        const activeConsultants = consultants.filter(c => c.status === 'Ativo').length;
        const lostConsultants = consultants.filter(c => c.status === 'Perdido').length;
        const terminatedConsultants = consultants.filter(c => c.status === 'Encerrado').length;
        
        const totalClients = clients.length;
        const activeClients = clients.filter(c => c.ativo_cliente).length;
        
        const totalManagers = usuariosCliente.filter(u => u.ativo).length;
        
        // Cálculo de risco médio
        const consultantsWithScore = consultants.filter(c => c.parecer_final_consultor && c.parecer_final_consultor !== null);
        const averageRisk = consultantsWithScore.length > 0 
            ? (consultantsWithScore.reduce((sum, c) => sum + (c.parecer_final_consultor || 0), 0) / consultantsWithScore.length).toFixed(2)
            : 'N/A';

        // Distribuição de risco
        const riskDistribution = {
            'Muito Baixo (1)': consultants.filter(c => c.parecer_final_consultor === 1).length,
            'Baixo (2)': consultants.filter(c => c.parecer_final_consultor === 2).length,
            'Médio (3)': consultants.filter(c => c.parecer_final_consultor === 3).length,
            'Alto (4)': consultants.filter(c => c.parecer_final_consultor === 4).length,
            'Muito Alto (5)': consultants.filter(c => c.parecer_final_consultor === 5).length,
        };

        // Faturamento total
        const totalBilling = consultants.reduce((sum, c) => sum + (c.valor_faturamento || 0), 0);
        const averageBilling = totalConsultants > 0 ? (totalBilling / totalConsultants).toFixed(2) : '0';

        return {
            totalConsultants,
            activeConsultants,
            lostConsultants,
            terminatedConsultants,
            totalClients,
            activeClients,
            totalManagers,
            averageRisk,
            riskDistribution,
            totalBilling,
            averageBilling
        };
    }, [consultants, clients, usuariosCliente]);

    // ============================================================================
    // DADOS PARA GRÁFICOS
    // ============================================================================

    // Distribuição de Status
    const statusData = [
        { name: 'Ativo', value: kpis.activeConsultants, fill: '#10B981' },
        { name: 'Perdido', value: kpis.lostConsultants, fill: '#F59E0B' },
        { name: 'Encerrado', value: kpis.terminatedConsultants, fill: '#EF4444' }
    ];

    // Distribuição de Risco
    const riskData = Object.entries(kpis.riskDistribution).map(([name, value]) => ({
        name,
        value,
        fill: name.includes('Muito Baixo') ? '#10B981' : 
               name.includes('Baixo') ? '#34D399' :
               name.includes('Médio') ? '#F59E0B' :
               name.includes('Alto') && !name.includes('Muito') ? '#FB923C' :
               '#EF4444'
    }));

    // Consultores por Cliente
    const consultantsByClient = useMemo(() => {
        const grouped: { [key: string]: number } = {};
        consultants.forEach(c => {
            const manager = usuariosCliente.find(u => u.id === c.gestor_imediato_id);
            const client = manager ? clients.find(cl => cl.id === manager.id_cliente) : null;
            const clientName = client?.razao_social_cliente || 'Sem Cliente';
            grouped[clientName] = (grouped[clientName] || 0) + 1;
        });
        return Object.entries(grouped)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);
    }, [consultants, usuariosCliente, clients]);

    // Consultores por Gestor
    const consultantsByManager = useMemo(() => {
        const grouped: { [key: string]: number } = {};
        consultants.forEach(c => {
            const manager = usuariosCliente.find(u => u.id === c.gestor_imediato_id);
            const managerName = manager?.nome_gestor_cliente || 'Sem Gestor';
            grouped[managerName] = (grouped[managerName] || 0) + 1;
        });
        return Object.entries(grouped)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);
    }, [consultants, usuariosCliente]);

    // Faturamento por Cliente
    const billingByClient = useMemo(() => {
        const grouped: { [key: string]: number } = {};
        consultants.forEach(c => {
            const manager = usuariosCliente.find(u => u.id === c.gestor_imediato_id);
            const client = manager ? clients.find(cl => cl.id === manager.id_cliente) : null;
            const clientName = client?.razao_social_cliente || 'Sem Cliente';
            grouped[clientName] = (grouped[clientName] || 0) + (c.valor_faturamento || 0);
        });
        return Object.entries(grouped)
            .map(([name, value]) => ({ name, value: parseFloat((value / 1000).toFixed(2)) }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);
    }, [consultants, usuariosCliente, clients]);

    // ============================================================================
    // COMPONENTES DE TAB
    // ============================================================================

    const TabButton = ({ id, label, icon }: { id: typeof activeTab; label: string; icon: string }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`px-6 py-3 font-medium transition-all duration-200 flex items-center gap-2 ${
                activeTab === id
                    ? 'bg-blue-600 text-white border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-800 border-b-2 border-transparent'
            }`}
        >
            <span>{icon}</span>
            {label}
        </button>
    );

    const KPICard = ({ label, value, icon, color }: { label: string; value: string | number; icon: string; color: string }) => (
        <div className="bg-white rounded-lg shadow p-6 border-l-4" style={{ borderLeftColor: color }}>
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-gray-600 text-sm font-medium">{label}</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
                </div>
                <span className="text-3xl">{icon}</span>
            </div>
        </div>
    );

    // ============================================================================
    // RENDER
    // ============================================================================

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-4xl font-bold text-gray-900 mb-2">📊 Analytics & Insights</h1>
                <p className="text-gray-600">Análise detalhada de consultores, clientes e performance</p>
            </div>

            {/* Tabs */}
            <div className="bg-white rounded-lg shadow mb-6 border-b border-gray-200">
                <div className="flex gap-0">
                    <TabButton id="overview" label="Visão Geral" icon="📈" />
                    <TabButton id="risk" label="Análise de Risco" icon="⚠️" />
                    <TabButton id="clients" label="Por Cliente" icon="🏢" />
                    <TabButton id="managers" label="Por Gestor" icon="👥" />
                </div>
            </div>

            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
                <div className="space-y-6">
                    {/* KPIs Principais */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <KPICard 
                            label="Total de Consultores" 
                            value={kpis.totalConsultants} 
                            icon="👤" 
                            color="#3B82F6"
                        />
                        <KPICard 
                            label="Consultores Ativos" 
                            value={kpis.activeConsultants} 
                            icon="✅" 
                            color="#10B981"
                        />
                        <KPICard 
                            label="Consultores Perdidos" 
                            value={kpis.lostConsultants} 
                            icon="⚠️" 
                            color="#F59E0B"
                        />
                        <KPICard 
                            label="Consultores Encerrados" 
                            value={kpis.terminatedConsultants} 
                            icon="❌" 
                            color="#EF4444"
                        />
                    </div>

                    {/* Segunda Linha de KPIs */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <KPICard 
                            label="Total de Clientes" 
                            value={kpis.totalClients} 
                            icon="🏢" 
                            color="#8B5CF6"
                        />
                        <KPICard 
                            label="Clientes Ativos" 
                            value={kpis.activeClients} 
                            icon="✅" 
                            color="#10B981"
                        />
                        <KPICard 
                            label="Total de Gestores" 
                            value={kpis.totalManagers} 
                            icon="👥" 
                            color="#06B6D4"
                        />
                        <KPICard 
                            label="Risco Médio" 
                            value={kpis.averageRisk} 
                            icon="📊" 
                            color="#F59E0B"
                        />
                    </div>

                    {/* Terceira Linha de KPIs */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <KPICard 
                            label="Faturamento Total" 
                            value={`R$ ${parseFloat(kpis.totalBilling.toString()).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`}
                            icon="💰" 
                            color="#10B981"
                        />
                        <KPICard 
                            label="Faturamento Médio por Consultor" 
                            value={`R$ ${parseFloat(kpis.averageBilling).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`}
                            icon="💵" 
                            color="#3B82F6"
                        />
                    </div>

                    {/* Gráficos */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Distribuição de Status */}
                        <div className="bg-white rounded-lg shadow p-6">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4">Distribuição de Status</h3>
                            <ResponsiveContainer width="100%" height={300}>
                                <PieChart>
                                    <Pie
                                        data={statusData}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={({ name, value }) => `${name}: ${value}`}
                                        outerRadius={80}
                                        fill="#8884d8"
                                        dataKey="value"
                                    >
                                        {statusData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value) => `${value} consultores`} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Consultores por Cliente (Top 10) */}
                        <div className="bg-white rounded-lg shadow p-6">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4">Top 10 Clientes por Consultores</h3>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={consultantsByClient}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                                    <YAxis />
                                    <Tooltip />
                                    <Bar dataKey="value" fill="#3B82F6" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Gráficos Adicionais */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Consultores por Gestor */}
                        <div className="bg-white rounded-lg shadow p-6">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4">Top 10 Gestores por Consultores</h3>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={consultantsByManager}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                                    <YAxis />
                                    <Tooltip />
                                    <Bar dataKey="value" fill="#8B5CF6" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Faturamento por Cliente */}
                        <div className="bg-white rounded-lg shadow p-6">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4">Faturamento por Cliente (Top 10)</h3>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={billingByClient}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                                    <YAxis />
                                    <Tooltip formatter={(value) => `R$ ${value}k`} />
                                    <Bar dataKey="value" fill="#10B981" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}

            {/* RISK ANALYSIS TAB */}
            {activeTab === 'risk' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Distribuição de Risco */}
                        <div className="bg-white rounded-lg shadow p-6">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4">Distribuição de Risco</h3>
                            <ResponsiveContainer width="100%" height={400}>
                                <BarChart data={riskData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                                    <YAxis />
                                    <Tooltip formatter={(value) => `${value} consultores`} />
                                    <Bar dataKey="value" fill="#F59E0B">
                                        {riskData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Resumo de Risco */}
                        <div className="bg-white rounded-lg shadow p-6">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4">Resumo de Risco</h3>
                            <div className="space-y-4">
                                {Object.entries(kpis.riskDistribution).map(([level, count], index) => {
                                    const colors = ['bg-green-100', 'bg-emerald-100', 'bg-yellow-100', 'bg-orange-100', 'bg-red-100'];
                                    const textColors = ['text-green-800', 'text-emerald-800', 'text-yellow-800', 'text-orange-800', 'text-red-800'];
                                    return (
                                        <div key={level} className="flex items-center justify-between">
                                            <span className="text-gray-700 font-medium">{level}</span>
                                            <div className="flex items-center gap-3">
                                                <div className="w-32 bg-gray-200 rounded-full h-2">
                                                    <div 
                                                        className={`h-2 rounded-full ${colors[index]}`}
                                                        style={{ width: `${(Number(count) / consultants.length) * 100}%` }}
                                                    />
                                                </div>
                                                <span className={`font-semibold ${textColors[index]} min-w-12`}>{count}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* CLIENTS TAB */}
            {activeTab === 'clients' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-6">
                        <div className="bg-white rounded-lg shadow p-6">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4">Consultores por Cliente</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-100 border-b">
                                        <tr>
                                            <th className="px-6 py-3 text-left font-semibold text-gray-700">Cliente</th>
                                            <th className="px-6 py-3 text-center font-semibold text-gray-700">Consultores</th>
                                            <th className="px-6 py-3 text-right font-semibold text-gray-700">Faturamento</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {billingByClient.map((item, idx) => {
                                            const count = consultantsByClient.find(c => c.name === item.name)?.value || 0;
                                            return (
                                                <tr key={idx} className="border-b hover:bg-gray-50">
                                                    <td className="px-6 py-3 text-gray-800">{item.name}</td>
                                                    <td className="px-6 py-3 text-center text-gray-600">{count}</td>
                                                    <td className="px-6 py-3 text-right text-gray-600 font-medium">R$ {item.value.toLocaleString('pt-BR')}k</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MANAGERS TAB */}
            {activeTab === 'managers' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-6">
                        <div className="bg-white rounded-lg shadow p-6">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4">Consultores por Gestor</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-100 border-b">
                                        <tr>
                                            <th className="px-6 py-3 text-left font-semibold text-gray-700">Gestor</th>
                                            <th className="px-6 py-3 text-center font-semibold text-gray-700">Consultores</th>
                                            <th className="px-6 py-3 text-left font-semibold text-gray-700">Cliente</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {consultantsByManager.map((item, idx) => {
                                            const manager = usuariosCliente.find(u => u.nome_gestor_cliente === item.name);
                                            const client = manager ? clients.find(c => c.id === manager.id_cliente) : null;
                                            return (
                                                <tr key={idx} className="border-b hover:bg-gray-50">
                                                    <td className="px-6 py-3 text-gray-800">{item.name}</td>
                                                    <td className="px-6 py-3 text-center text-gray-600">{item.value}</td>
                                                    <td className="px-6 py-3 text-gray-600">{client?.razao_social_cliente || '-'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Analytics;
