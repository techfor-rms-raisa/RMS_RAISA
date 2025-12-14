import React, { useState, useEffect } from 'react';
import { Consultant, Client, User, UsuarioCliente, CoordenadorCliente, ConsultantStatus, TerminationReason, RiskScore } from '../components/types';
import { Mail, Phone, Search } from 'lucide-react';
import InclusionImport from './InclusionImport';
import ScoreBadge from './ScoreBadge'; // Caminho corrigido

// ... (interface e constantes)

const ManageConsultants: React.FC<ManageConsultantsProps> = ({ /* ...props */ }) => {
    // ... (estados e lógicas)

    return (
        <div className="bg-white rounded-lg shadow-sm p-6">
            {/* ... (cabeçalho e modal) */}

            {/* TABELA DE CONSULTORES */}
            <div className="mt-8 space-y-4">
                {consultants
                    .filter(consultant => {
                        // ... (lógica de filtro)
                    })
                    .map((consultant, idx) => (
                    <div key={idx} className="border rounded-lg p-4 bg-gray-50 hover:bg-blue-50 transition-colors">
                        <div className="flex justify-between items-start">
                            <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2"> {/* Aumentar o gap */}
                                    <h3 className="text-lg font-semibold text-gray-800">{consultant.nome_consultores}</h3>
                                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                        consultant.status === 'Ativo' ? 'bg-green-100 text-green-800' :
                                        consultant.status === 'Perdido' ? 'bg-yellow-100 text-yellow-800' :
                                        'bg-red-100 text-red-800'
                                    }`}>
                                        {consultant.status}
                                    </span>
                                    <ScoreBadge score={consultant.parecer_final_consultor as RiskScore | null} />
                                </div>
                                {/* ... (restante das informações) */}
                            </div>
                            {/* ... (botão de editar) */}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ManageConsultants;
