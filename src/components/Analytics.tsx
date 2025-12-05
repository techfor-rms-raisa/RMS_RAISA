import React from 'react';
import { Consultant, Client, User, UsuarioCliente } from '../components/types';

const Analytics: React.FC<any> = () => {
    return (
        <div className="p-6">
            <h2 className="text-3xl font-bold text-[#4D5253] mb-6">Analytics & Insights</h2>
            <div className="bg-white p-8 rounded shadow text-center text-gray-500">
                Gráficos e métricas disponíveis na versão completa.
            </div>
        </div>
    );
};

export default Analytics;