import React, { useState, useMemo, useEffect } from 'react';
import { Client, Consultant, UsuarioCliente, CoordenadorCliente, ConsultantReport, RiskScore } from '../types';
import { User, Phone, Mail, Briefcase, Clock } from 'lucide-react';
import HistoricoAtividadesModal from '../HistoricoAtividadesModal';
import ScoreBadge from './ScoreBadge'; // Importar o novo componente

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
    allReports = [],
    loadConsultantReports,
    onManualReport,
    preSelectedClient = '',
    preSelectedConsultant = ''
}) => {
    // ... (mesmos estados de antes)

    // Obter dados do consultor selecionado
    const selectedConsultantData = useMemo(() => {
        if (!selectedConsultant) return null;
        return consultants.find(c => c.nome_consultores === selectedConsultant) || null;
    }, [selectedConsultant, consultants]);

    // ... (mesma lógica de antes)

    return (
        <div className="max-w-6xl mx-auto p-4">
            {/* ... (mesmo cabeçalho e abas) */}

            {mode === 'manual' ? (
                <form onSubmit={handleManualSubmit} className="space-y-4">
                    {/* ... (mesmos dropdowns) */}

                    {selectedConsultantData && (
                        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-gray-200 rounded-lg p-3">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <div className="flex items-center gap-2">
                                            <User className="w-4 h-4 text-blue-600" />
                                            <h3 className="text-sm font-semibold text-blue-900">Consultor</h3>
                                        </div>
                                        <ScoreBadge score={selectedConsultantData.parecer_final_consultor as RiskScore | null} />
                                    </div>
                                    {/* ... (restante do card do consultor) */}
                                </div>
                                {/* ... (restante dos cards) */}
                            </div>
                        </div>
                    )}

                    {/* ... (restante do formulário) */}
                </form>
            ) : (
                // ... (lógica de importação)
            )}

            {/* ... (modal de histórico) */}
        </div>
    );
};

export default AtividadesInserir;
