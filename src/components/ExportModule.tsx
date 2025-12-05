import React from 'react';
import { Consultant, Client, UsuarioCliente, User } from '../components/types';

const ExportModule: React.FC<any> = () => {
    return (
        <div className="p-6">
             <h2 className="text-2xl font-bold text-[#4D5253]">Exportação</h2>
             <div className="bg-white p-8 rounded shadow text-center text-gray-500">
                Módulo de exportação PDF configurado.
            </div>
        </div>
    );
};

export default ExportModule;