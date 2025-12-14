'''
import React, { useState, useMemo, useEffect } from 'react';
import { Client, Consultant, UsuarioCliente, CoordenadorCliente, ConsultantReport, RiskScore } from '../types';
import { User, Phone, Mail, Briefcase, Clock } from 'lucide-react';
import HistoricoAtividadesModal from '../HistoricoAtividadesModal';
import ScoreBadge from '../ScoreBadge'; // Caminho corrigido

interface AtividadesInserirProps {
    clients: Client[];
    consultants: Consultant[];
    usuariosCliente: UsuarioCliente[];
    coordenadoresCliente?: CoordenadorCliente[];
    allReports?: ConsultantReport[];
    loadConsultantReports?: (consultantId: number) => Promise<ConsultantReport[]>;
    onManualReport: (text: string, gestorName?: string) => Promise<void>;
    preSelectedClient?: string;
    preSelectedConsultant?: string;
}

const AtividadesInserir: React.FC<AtividadesInserirProps> = ({ 
    clients,
    consultants,
    usuariosCliente,
    coordenadoresCliente = [],
    loadConsultantReports,
    onManualReport,
    preSelectedClient = '',
    preSelectedConsultant = ''
}) => {
    const [selectedClient, setSelectedClient] = useState<string>('');
    const [selectedConsultant, setSelectedConsultant] = useState<string>('');
    const [activities, setActivities] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [mode, setMode] = useState<'manual' | 'import'>('manual');
    const [showHistoricoModal, setShowHistoricoModal] = useState(false);
    const [consultantReports, setConsultantReports] = useState<ConsultantReport[]>([]);
    const [loadingReports, setLoadingReports] = useState(false);

    useEffect(() => {
        if (preSelectedClient) {
            setSelectedClient(preSelectedClient);
        }
    }, [preSelectedClient]);

    useEffect(() => {
        if (preSelectedConsultant && preSelectedClient) {
            setSelectedConsultant(preSelectedConsultant);
        }
    }, [preSelectedConsultant, preSelectedClient]);

    const filteredConsultants = useMemo(() => {
        if (!selectedClient) return [];
        const client = clients.find(c => c.razao_social_cliente === selectedClient);
        if (!client) return [];
        const clientManagers = usuariosCliente.filter(u => u.id_cliente === client.id);
        const managerIds = clientManagers.map(m => m.id);
        return consultants.filter(c => 
            c.status === 'Ativo' && 
            c.gestor_imediato_id && 
            managerIds.includes(c.gestor_imediato_id)
        ).sort((a, b) => a.nome_consultores.localeCompare(b.nome_consultores));
    }, [selectedClient, clients, consultants, usuariosCliente]);

    const selectedConsultantData = useMemo(() => {
        if (!selectedConsultant) return null;
        return consultants.find(c => c.nome_consultores === selectedConsultant) || null;
    }, [selectedConsultant, consultants]);

    const managerData = useMemo(() => {
        if (!selectedConsultantData) return null;
        const manager = usuariosCliente.find(u => u.id === selectedConsultantData.gestor_imediato_id);
        if (manager) {
            return {
                nome: manager.nome_gestor_cliente,
                cargo: manager.cargo_gestor,
                email: `gestor${manager.id}@cliente.com`,
                celular: manager.celular || 'Não informado',
                tipo: 'Gestor'
            };
        }
        if (selectedConsultantData.coordenador_id) {
            const coordenador = coordenadoresCliente.find(c => c.id === selectedConsultantData.coordenador_id);
            if (coordenador) {
                return {
                    nome: coordenador.nome_coordenador_cliente,
                    cargo: coordenador.cargo_coordenador_cliente,
                    email: `coordenador${coordenador.id}@cliente.com`,
                    celular: coordenador.celular || 'Não informado',
                    tipo: 'Coordenador'
                };
            }
        }
        return null;
    }, [selectedConsultantData, usuariosCliente, coordenadoresCliente]);

    const handleOpenHistorico = async () => {
        if (!selectedConsultantData || !loadConsultantReports) return;
        setLoadingReports(true);
        try {
            const reports = await loadConsultantReports(selectedConsultantData.id);
            setConsultantReports(reports);
            setShowHistoricoModal(true);
        } catch (error) {
            console.error('Erro ao carregar relatórios:', error);
            alert('Erro ao carregar histórico de atividades.');
        } finally {
            setLoadingReports(false);
        }
    };

    const handleManualSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedConsultant || !activities.trim()) return;
        setIsSubmitting(true);
        try {
            const consultant = consultants.find(c => c.nome_consultores === selectedConsultant);
            const manager = consultant ? usuariosCliente.find(u => u.id === consultant.gestor_imediato_id) : null;
            const client = clients.find(c => c.razao_social_cliente === selectedClient);
            const reportText = `◆ ${consultant?.nome_consultores || ''} | ${client?.razao_social_cliente || ''}\n${activities}`;
            const gestorName = manager?.nome_gestor_cliente || 'Não especificado';
            await onManualReport(reportText, gestorName);
            setActivities('');
            setSelectedConsultant('');
            alert('Relatório de atividades processado com sucesso!');
        } catch (error) {
            console.error('Erro ao enviar relatório:', error);
            alert('Erro ao processar relatório. Tente novamente.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const downloadTemplate = () => {
        const template = `INSTRUÇÕES...`; // Template content
        const blob = new Blob([template], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'template_relatorios_atividades.txt';
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="max-w-6xl mx-auto p-4">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-800">Inserir Relatório de Atividades</h2>
                <button onClick={downloadTemplate} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm font-medium">
                    Baixar Template de Exemplo
                </button>
            </div>

            <div className="flex gap-2 mb-4 border-b border-gray-200">
                <button onClick={() => setMode('manual')} className={`px-6 py-2 font-medium transition text-sm ${mode === 'manual' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}>
                    Digitação Manual
                </button>
                <button onClick={() => setMode('import')} className={`px-6 py-2 font-medium transition text-sm ${mode === 'import' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}>
                    Importar Arquivo
                </button>
            </div>

            {mode === 'manual' ? (
                <form onSubmit={handleManualSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                            <select 
                                value={selectedClient} 
                                onChange={(e) => { setSelectedClient(e.target.value); setSelectedConsultant(''); }} 
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                                <option value="">Selecione um cliente...</option>
                                {clients.map(c => <option key={c.id} value={c.razao_social_cliente}>{c.razao_social_cliente}</option>)}
                            </select>
                        </div>

                        {selectedClient && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Consultor</label>
                                <select 
                                    value={selectedConsultant} 
                                    onChange={(e) => setSelectedConsultant(e.target.value)} 
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="">Selecione um consultor...</option>
                                    {filteredConsultants.map(c => <option key={c.id} value={c.nome_consultores}>{c.nome_consultores}</option>)}
                                </select>
                            </div>
                        )}
                    </div>

                    {selectedConsultantData && (
                        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-gray-200 rounded-lg p-3 mt-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <div className="flex items-center gap-2">
                                            <User className="w-4 h-4 text-blue-600" />
                                            <h3 className="text-sm font-semibold text-blue-900">Consultor</h3>
                                        </div>
                                        <ScoreBadge score={selectedConsultantData.parecer_final_consultor as RiskScore | null} />
                                    </div>
                                    <div className="space-y-1.5 pl-1">
                                        <p className="text-xs text-gray-800 font-semibold truncate">{selectedConsultantData.nome_consultores}</p>
                                        <p className="text-xs text-gray-600 truncate">{selectedConsultantData.email_consultor || 'Não informado'}</p>
                                        <p className="text-xs text-gray-600">{selectedConsultantData.celular || 'Não informado'}</p>
                                    </div>
                                </div>

                                {managerData && (
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Briefcase className="w-4 h-4 text-purple-600" />
                                            <h3 className="text-sm font-semibold text-purple-900">{managerData.tipo}</h3>
                                        </div>
                                        <div className="space-y-1.5 pl-1">
                                            <p className="text-xs text-gray-800 font-semibold truncate">{managerData.nome}</p>
                                            <p className="text-xs text-gray-600 truncate">{managerData.cargo}</p>
                                            <p className="text-xs text-gray-600 truncate">{managerData.email}</p>
                                        </div>
                                    </div>
                                )}

                                {loadConsultantReports && (
                                    <div className="flex items-center justify-center md:justify-end h-full">
                                        <button
                                            type="button"
                                            onClick={handleOpenHistorico}
                                            disabled={loadingReports}
                                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-xs font-medium disabled:bg-gray-400 h-fit"
                                        >
                                            <Clock className="w-4 h-4" />
                                            {loadingReports ? 'Carregando...' : 'Histórico (90 dias)'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="pt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Atividades e Observações</label>
                        <textarea 
                            value={activities} 
                            onChange={(e) => setActivities(e.target.value)} 
                            placeholder="Descreva as atividades, desempenho e observações sobre o consultor..." 
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" 
                            rows={8} 
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button 
                            type="button" 
                            onClick={() => { setSelectedClient(''); setSelectedConsultant(''); setActivities(''); }} 
                            className="px-5 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition text-sm font-medium"
                        >
                            Limpar
                        </button>
                        <button 
                            type="submit" 
                            disabled={isSubmitting || !selectedConsultant || !activities.trim()} 
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400 text-sm font-medium"
                        >
                            {isSubmitting ? 'Processando...' : 'Enviar Relatório'}
                        </button>
                    </div>
                </form>
            ) : (
                <div>Importação...</div>
            )}

            {showHistoricoModal && selectedConsultantData && (
                <HistoricoAtividadesModal 
                    isOpen={showHistoricoModal} 
                    onClose={() => setShowHistoricoModal(false)} 
                    consultantName={selectedConsultantData.nome_consultores} 
                    reports={consultantReports} 
                />
            )}
        </div>
    );
};

export default AtividadesInserir;
'''
