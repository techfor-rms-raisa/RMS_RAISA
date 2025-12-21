import React, { useState, useMemo } from 'react';
import { Consultant, Client, User, UsuarioCliente, RiskScore } from '@/types';
import { 
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, 
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';

interface AnalyticsProps {
    consultants: Consultant[];
    clients: Client[];
    usuariosCliente: UsuarioCliente[];
    users: User[];
}

// ============================================================================
// CONSTANTES
// ============================================================================
const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const Analytics: React.FC<AnalyticsProps> = ({ consultants, clients, usuariosCliente, users }) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'risk' | 'clients' | 'managers'>('overview');
    const currentYear = new Date().getFullYear();
    const [selectedYear, setSelectedYear] = useState(currentYear);

    // ============================================================================
    // FILTRO: Apenas consultores ativos
    // ============================================================================
    const activeConsultants = useMemo(() => {
        return consultants.filter(c => c.status === 'Ativo');
    }, [consultants]);

    // ============================================================================
    // CÁLCULOS DE KPIs - ESCALA: 1=Excelente, 5=Crítico
    // ============================================================================
    const kpis = useMemo(() => {
        const total = activeConsultants.length;
        
        // Risco Crítico = Score 5
        const critical = activeConsultants.filter(c => c.parecer_final_consultor === 5).length;
        
        // Risco Moderado = Score 3 e 4
        const moderate = activeConsultants.filter(c => 
            c.parecer_final_consultor === 3 || c.parecer_final_consultor === 4
        ).length;
        
        // Seguros = Score 1 e 2
        const safe = activeConsultants.filter(c => 
            c.parecer_final_consultor === 1 || c.parecer_final_consultor === 2
        ).length;

        // Sem análise (sem score definido)
        const noAnalysis = activeConsultants.filter(c => 
            !c.parecer_final_consultor || 
            c.parecer_final_consultor === null ||
            String(c.parecer_final_consultor) === '#FFFF'
        ).length;

        // Distribuição detalhada por score
        const riskDistribution = {
            'Crítico (5)': activeConsultants.filter(c => c.parecer_final_consultor === 5).length,
            'Alto (4)': activeConsultants.filter(c => c.parecer_final_consultor === 4).length,
            'Médio (3)': activeConsultants.filter(c => c.parecer_final_consultor === 3).length,
            'Bom (2)': activeConsultants.filter(c => c.parecer_final_consultor === 2).length,
            'Excelente (1)': activeConsultants.filter(c => c.parecer_final_consultor === 1).length,
        };

        // Status de consultores (para aba Overview)
        const statusDistribution = {
            active: consultants.filter(c => c.status === 'Ativo').length,
            lost: consultants.filter(c => c.status === 'Perdido').length,
            terminated: consultants.filter(c => c.status === 'Encerrado').length,
        };

        const totalClients = clients.filter(c => c.ativo_cliente).length;
        const totalManagers = usuariosCliente.filter(u => u.ativo).length;

        return { 
            total, critical, moderate, safe, noAnalysis, 
            riskDistribution, statusDistribution,
            totalClients, totalManagers
        };
    }, [activeConsultants, consultants, clients, usuariosCliente]);

    // ============================================================================
    // DADOS: Distribuição de Risco (Donut Chart) - Carteira Total
    // ============================================================================
    const riskDistributionDonutData = useMemo(() => {
        const data = [
            { name: 'Crítico (5)', value: kpis.riskDistribution['Crítico (5)'], color: '#EF4444' },
            { name: 'Alto (4)', value: kpis.riskDistribution['Alto (4)'], color: '#F97316' },
            { name: 'Médio (3)', value: kpis.riskDistribution['Médio (3)'], color: '#EAB308' },
            { name: 'Bom (2)', value: kpis.riskDistribution['Bom (2)'], color: '#22C55E' },
            { name: 'Excelente (1)', value: kpis.riskDistribution['Excelente (1)'], color: '#3B82F6' },
            { name: 'Sem Análise', value: kpis.noAnalysis, color: '#9CA3AF' },
        ];
        return data.filter(d => d.value > 0);
    }, [kpis]);

    // ============================================================================
    // DADOS: Top 10 Clientes (Volume vs Risco)
    // ============================================================================
    const clientsVolumeRiskData = useMemo(() => {
        const clientData = clients.filter(c => c.ativo_cliente).map(client => {
            const managerIds = usuariosCliente
                .filter(u => u.id_cliente === client.id)
                .map(u => u.id);
            
            const clientConsultants = activeConsultants.filter(c => 
                managerIds.includes(c.gestor_imediato_id || 0)
            );
            
            const totalCount = clientConsultants.length;
            // Em Risco = Score 4 ou 5
            const atRiskCount = clientConsultants.filter(c => 
                c.parecer_final_consultor === 4 || c.parecer_final_consultor === 5
            ).length;

            return {
                name: client.razao_social_cliente,
                total: totalCount,
                emRisco: atRiskCount
            };
        });

        return clientData
            .filter(d => d.total > 0)
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);
    }, [clients, usuariosCliente, activeConsultants]);

    // ============================================================================
    // DADOS: Evolução Média do Score de Risco - ANO ATUAL vs ANO ANTERIOR
    // ============================================================================
    
    /**
     * Calcula a média dos scores por mês para um determinado ano
     * Usa parecer_X_consultor para ano vigente
     * Usa consultant_reports para anos anteriores
     */
    const getScoreEvolutionForYear = (year: number) => {
        return Array.from({ length: 12 }, (_, i) => {
            const month = i + 1;
            
            if (year === currentYear) {
                // Ano atual: usar campos parecer_X_consultor
                const key = `parecer_${month}_consultor` as keyof Consultant;
                const scores = activeConsultants
                    .map(c => c[key] as number)
                    .filter(s => s !== null && s !== undefined && !isNaN(s) && s >= 1 && s <= 5);
                
                const avg = scores.length > 0 
                    ? scores.reduce((a, b) => a + b, 0) / scores.length 
                    : null;
                
                return avg !== null ? parseFloat(avg.toFixed(2)) : null;
            } else {
                // Anos anteriores: usar consultant_reports se disponível
                const reportsForMonth = consultants.flatMap(c => 
                    (c.consultant_reports || []).filter(r => 
                        r.year === year && r.month === month
                    )
                );
                
                if (reportsForMonth.length > 0) {
                    const avg = reportsForMonth.reduce((sum, r) => sum + (r.risk_score || 0), 0) / reportsForMonth.length;
                    return parseFloat(avg.toFixed(2));
                }
                
                return null;
            }
        });
    };

    // ✅ Dados para gráfico comparativo (Ano Atual vs Ano Anterior)
    const yearComparisonScoreData = useMemo(() => {
        const currentYearScores = getScoreEvolutionForYear(selectedYear);
        const previousYearScores = getScoreEvolutionForYear(selectedYear - 1);

        return Array.from({ length: 12 }, (_, i) => ({
            month: `Mês ${i + 1}`,
            monthName: MONTH_NAMES[i],
            [`${selectedYear}`]: currentYearScores[i],
            [`${selectedYear - 1}`]: previousYearScores[i]
        }));
    }, [selectedYear, activeConsultants, consultants, currentYear]);

    // ============================================================================
    // DADOS: Consultores em Atenção Prioritária (Score 5)
    // ============================================================================
    const priorityAttentionConsultants = useMemo(() => {
        return activeConsultants
            .filter(c => c.parecer_final_consultor === 5)
            .sort((a, b) => (b.valor_faturamento || 0) - (a.valor_faturamento || 0))
            .map(c => {
                // Buscar gestor
                const manager = usuariosCliente.find(u => u.id === c.gestor_imediato_id);
                const client = manager 
                    ? clients.find(cl => cl.id === manager.id_cliente) 
                    : null;
                
                return {
                    id: c.id,
                    nome: c.nome_consultores,
                    cargo: c.cargo_consultores || '-',
                    faturamento: c.valor_faturamento || 0,
                    gestor: manager?.nome_gestor_cliente || '-',
                    cliente: client?.razao_social_cliente || '-'
                };
            });
    }, [activeConsultants, usuariosCliente, clients]);

    // ============================================================================
    // DADOS: Consultores por Gestor (para aba Por Gestor)
    // ============================================================================
    const consultantsByManager = useMemo(() => {
        const grouped: { [key: string]: { count: number; clientName: string } } = {};
        
        activeConsultants.forEach(c => {
            const manager = usuariosCliente.find(u => u.id === c.gestor_imediato_id);
            const managerName = manager?.nome_gestor_cliente || 'Sem Gestor';
            const client = manager ? clients.find(cl => cl.id === manager.id_cliente) : null;
            
            if (!grouped[managerName]) {
                grouped[managerName] = { count: 0, clientName: client?.razao_social_cliente || '-' };
            }
            grouped[managerName].count++;
        });
        
        return Object.entries(grouped)
            .map(([name, data]) => ({ name, value: data.count, clientName: data.clientName }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);
    }, [activeConsultants, usuariosCliente, clients]);

    // ============================================================================
    // DADOS: Status de Consultores (Overview)
    // ============================================================================
    const statusData = useMemo(() => [
        { 
            name: 'Ativo', 
            value: kpis.statusDistribution.active, 
            fill: '#10B981',
            description: 'Operante no cliente com score de 1 a 5'
        },
        { 
            name: 'Perdido', 
            value: kpis.statusDistribution.lost, 
            fill: '#F59E0B',
            description: 'Rescisão por iniciativa própria ou demissão pelo cliente'
        },
        { 
            name: 'Encerrado', 
            value: kpis.statusDistribution.terminated, 
            fill: '#EF4444',
            description: 'Contrato finalizado normalmente'
        }
    ].filter(d => d.value > 0), [kpis]);

    // ============================================================================
    // COMPONENTES AUXILIARES
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

    const KPICard = ({ label, value, subtitle, bgColor, textColor, borderColor }: { 
        label: string; 
        value: string | number; 
        subtitle?: string;
        bgColor: string;
        textColor: string;
        borderColor: string;
    }) => (
        <div className={`${bgColor} p-5 rounded-lg border-t-4 ${borderColor}`}>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{label}</p>
            <h3 className={`text-3xl font-black ${textColor} mt-1`}>{value}</h3>
            {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
    );

    const formatCurrency = (value: number) => {
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
    };

    // ============================================================================
    // RENDER
    // ============================================================================
    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold text-gray-800">Analytics & Insights</h2>
                    <p className="text-gray-500 text-sm mt-1">Análise completa da carteira de consultores</p>
                </div>

                {/* Seletor de Ano (visível apenas na aba Risk) */}
                {activeTab === 'risk' && (
                    <div className="flex items-center gap-3">
                        <label className="text-sm font-medium text-gray-600">Ano:</label>
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                            className="border border-gray-300 rounded-lg px-4 py-2 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            {[currentYear, currentYear - 1, currentYear - 2].map(year => (
                                <option key={year} value={year}>{year}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* Tabs */}
            <div className="flex space-x-1 bg-white rounded-lg p-1 shadow">
                <TabButton id="overview" label="Visão Geral" icon="📊" />
                <TabButton id="risk" label="Análise de Risco" icon="⚠️" />
                <TabButton id="clients" label="Por Cliente" icon="🏢" />
                <TabButton id="managers" label="Por Gestor" icon="👤" />
            </div>

            {/* ============================================================================ */}
            {/* OVERVIEW TAB */}
            {/* ============================================================================ */}
            {activeTab === 'overview' && (
                <div className="space-y-6">
                    {/* KPIs Simplificados */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <KPICard 
                            label="Total Consultores" 
                            value={consultants.length} 
                            subtitle="Todos os status"
                            bgColor="bg-white" 
                            textColor="text-blue-600" 
                            borderColor="border-blue-500" 
                        />
                        <KPICard 
                            label="Ativos" 
                            value={kpis.total} 
                            subtitle={`${Math.round((kpis.total / consultants.length) * 100)}% do total`}
                            bgColor="bg-white" 
                            textColor="text-green-600" 
                            borderColor="border-green-500" 
                        />
                        <KPICard 
                            label="Clientes" 
                            value={kpis.totalClients} 
                            subtitle="Clientes ativos"
                            bgColor="bg-white" 
                            textColor="text-purple-600" 
                            borderColor="border-purple-500" 
                        />
                        <KPICard 
                            label="Gestores" 
                            value={kpis.totalManagers} 
                            subtitle="Gestores ativos"
                            bgColor="bg-white" 
                            textColor="text-orange-600" 
                            borderColor="border-orange-500" 
                        />
                    </div>

                    {/* Gráficos */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Consultores por Status */}
                        <div className="bg-white rounded-lg shadow p-6">
                            <h3 className="text-lg font-semibold text-gray-800 mb-2">Consultores por Status</h3>
                            <p className="text-xs text-gray-500 mb-4">
                                <strong>Ativo:</strong> Operante no cliente | 
                                <strong> Perdido:</strong> Rescisão própria ou demissão | 
                                <strong> Encerrado:</strong> Contrato finalizado
                            </p>
                            <ResponsiveContainer width="100%" height={250}>
                                <PieChart>
                                    <Pie 
                                        data={statusData} 
                                        dataKey="value" 
                                        nameKey="name" 
                                        cx="50%" 
                                        cy="50%" 
                                        outerRadius={80}
                                        label={({ name, value }) => `${name}: ${value}`}
                                    >
                                        {statusData.map((entry, index) => (
                                            <Cell key={index} fill={entry.fill} />
                                        ))}
                                    </Pie>
                                    <Tooltip 
                                        formatter={(value: number, name: string, props: any) => [
                                            `${value} consultores`,
                                            `${name} - ${props.payload.description}`
                                        ]}
                                    />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Top 10 Gestores */}
                        <div className="bg-white rounded-lg shadow p-6">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4">Top 10 Gestores por Consultores</h3>
                            <ResponsiveContainer width="100%" height={250}>
                                <BarChart data={consultantsByManager} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis type="number" />
                                    <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10 }} />
                                    <Tooltip />
                                    <Bar dataKey="value" fill="#6366F1" name="Consultores" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}

            {/* ============================================================================ */}
            {/* RISK TAB */}
            {/* ============================================================================ */}
            {activeTab === 'risk' && (
                <div className="space-y-6">
                    {/* KPIs de Risco */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <KPICard 
                            label="Total Ativos" 
                            value={kpis.total} 
                            subtitle="Consultores em operação"
                            bgColor="bg-white" 
                            textColor="text-blue-600" 
                            borderColor="border-blue-500" 
                        />
                        <KPICard 
                            label="Risco Crítico" 
                            value={kpis.critical} 
                            subtitle="Ação Imediata Necessária"
                            bgColor="bg-white" 
                            textColor="text-red-600" 
                            borderColor="border-red-500" 
                        />
                        <KPICard 
                            label="Risco Moderado" 
                            value={kpis.moderate} 
                            subtitle="Atenção Necessária"
                            bgColor="bg-white" 
                            textColor="text-yellow-600" 
                            borderColor="border-yellow-500" 
                        />
                        <KPICard 
                            label="Seguros" 
                            value={kpis.safe} 
                            subtitle="Scores 1 e 2"
                            bgColor="bg-white" 
                            textColor="text-green-600" 
                            borderColor="border-green-500" 
                        />
                    </div>

                    {/* Gráficos - Linha 1 */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Donut Chart - Distribuição de Risco */}
                        <div className="bg-white rounded-lg shadow p-6">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4">Distribuição de Risco (Carteira Total)</h3>
                            <ResponsiveContainer width="100%" height={250}>
                                <PieChart>
                                    <Pie 
                                        data={riskDistributionDonutData} 
                                        dataKey="value" 
                                        nameKey="name" 
                                        cx="50%" 
                                        cy="50%" 
                                        innerRadius={60}
                                        outerRadius={100}
                                        paddingAngle={3}
                                        label={({ name, value }) => `${value}`}
                                    >
                                        {riskDistributionDonutData.map((entry, index) => (
                                            <Cell key={index} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip 
                                        formatter={(value: number, name: string) => [`${value} consultores`, name]}
                                    />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Top 10 Clientes (Volume vs Risco) */}
                        <div className="bg-white rounded-lg shadow p-6">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4">Top 10 Clientes (Volume vs Risco)</h3>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={clientsVolumeRiskData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} tick={{ fontSize: 10 }} />
                                    <YAxis />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="total" fill="#9CA3AF" name="Total Consultores" />
                                    <Bar dataKey="emRisco" fill="#EF4444" name="Em Risco (4 ou 5)" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* ✅ GRÁFICO ATUALIZADO: Evolução do Score (Ano Atual vs Ano Anterior) */}
                    <div className="bg-white rounded-xl shadow-sm p-6">
                        <div className="mb-4">
                            <h3 className="text-lg font-bold text-blue-600">
                                Evolução Média do Score de Risco (Ano Atual vs Ano Anterior)
                            </h3>
                            <p className="text-sm text-gray-500">
                                Média dos scores de todos os consultores ativos. Compare {selectedYear} com {selectedYear - 1}. 
                                (Escala: 1=Excelente, 5=Crítico)
                            </p>
                        </div>

                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={yearComparisonScoreData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                                    <XAxis 
                                        dataKey="monthName" 
                                        tick={{ fontSize: 11, fill: '#6B7280' }}
                                        axisLine={{ stroke: '#D1D5DB' }}
                                    />
                                    <YAxis 
                                        domain={[0, 5]}
                                        ticks={[1, 2, 3, 4, 5]}
                                        tick={{ fontSize: 11, fill: '#6B7280' }}
                                        axisLine={{ stroke: '#D1D5DB' }}
                                    />
                                    <Tooltip 
                                        formatter={(value: any, name: string) => [
                                            value !== null ? value.toFixed(2) : 'Sem dados',
                                            name
                                        ]}
                                        contentStyle={{ 
                                            borderRadius: '8px', 
                                            border: 'none', 
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)' 
                                        }}
                                    />
                                    <Legend />
                                    
                                    {/* Linha Ano Atual */}
                                    <Line 
                                        type="monotone" 
                                        dataKey={`${selectedYear}`}
                                        name={`${selectedYear} (Atual)`}
                                        stroke="#3B82F6" 
                                        strokeWidth={3}
                                        dot={{ fill: '#3B82F6', strokeWidth: 2, r: 5 }}
                                        activeDot={{ r: 7 }}
                                        connectNulls={false}
                                    />
                                    
                                    {/* Linha Ano Anterior */}
                                    <Line 
                                        type="monotone" 
                                        dataKey={`${selectedYear - 1}`}
                                        name={`${selectedYear - 1} (Anterior)`}
                                        stroke="#F97316" 
                                        strokeWidth={2}
                                        strokeDasharray="5 5"
                                        dot={{ fill: '#F97316', strokeWidth: 2, r: 4 }}
                                        connectNulls={false}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Legenda de Interpretação */}
                        <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500">
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-0.5 bg-blue-500"></div>
                                <span><strong className="text-blue-600">{selectedYear}</strong>: Ano atual</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-0.5 bg-orange-500 border-dashed"></div>
                                <span><strong className="text-orange-500">{selectedYear - 1}</strong>: Ano anterior (referência)</span>
                            </div>
                            <div className="ml-auto text-gray-400">
                                💡 Scores mais baixos indicam menor risco (1=Excelente, 5=Crítico)
                            </div>
                        </div>
                    </div>

                    {/* Tabela de Atenção Prioritária (Score 5) */}
                    <div className="bg-white rounded-lg shadow overflow-hidden">
                        <div className="p-4 bg-red-50 border-b border-red-100">
                            <h3 className="text-lg font-bold text-red-700 flex items-center gap-2">
                                🚨 Atenção Prioritária (Score 5)
                            </h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                            CONSULTOR
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                            CARGO
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                            FATURAMENTO
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                            GESTOR
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {priorityAttentionConsultants.length > 0 ? (
                                        priorityAttentionConsultants.map((c) => (
                                            <tr key={c.id} className="hover:bg-red-50 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm font-bold text-gray-900">{c.nome}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                                    {c.cargo}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                                                    {formatCurrency(c.faturamento)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm text-gray-900">{c.gestor}</div>
                                                    <div className="text-xs text-gray-500">({c.cliente})</div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center">
                                                <div className="text-green-500 text-4xl mb-2">✅</div>
                                                <p className="text-gray-500 font-medium">
                                                    Nenhum consultor em risco crítico (Score 5)
                                                </p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ============================================================================ */}
            {/* CLIENTS TAB */}
            {/* ============================================================================ */}
            {activeTab === 'clients' && (
                <div className="space-y-6">
                    <div className="bg-white rounded-lg shadow p-6">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">Consultores por Cliente</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-100 border-b">
                                    <tr>
                                        <th className="px-6 py-3 text-left font-semibold text-gray-700">Cliente</th>
                                        <th className="px-6 py-3 text-center font-semibold text-gray-700">Total</th>
                                        <th className="px-6 py-3 text-center font-semibold text-gray-700">Em Risco</th>
                                        <th className="px-6 py-3 text-center font-semibold text-gray-700">Seguros</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {clientsVolumeRiskData.map((item, idx) => (
                                        <tr key={idx} className="border-b hover:bg-gray-50">
                                            <td className="px-6 py-3 text-gray-800 font-medium">{item.name}</td>
                                            <td className="px-6 py-3 text-center text-gray-600">{item.total}</td>
                                            <td className="px-6 py-3 text-center">
                                                <span className={`px-2 py-1 rounded text-xs font-bold ${
                                                    item.emRisco > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
                                                }`}>
                                                    {item.emRisco}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3 text-center">
                                                <span className="px-2 py-1 rounded text-xs font-bold bg-green-100 text-green-700">
                                                    {item.total - item.emRisco}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ============================================================================ */}
            {/* MANAGERS TAB */}
            {/* ============================================================================ */}
            {activeTab === 'managers' && (
                <div className="space-y-6">
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
                                    {consultantsByManager.map((item, idx) => (
                                        <tr key={idx} className="border-b hover:bg-gray-50">
                                            <td className="px-6 py-3 text-gray-800 font-medium">{item.name}</td>
                                            <td className="px-6 py-3 text-center text-gray-600">{item.value}</td>
                                            <td className="px-6 py-3 text-gray-600">{item.clientName}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Analytics;
