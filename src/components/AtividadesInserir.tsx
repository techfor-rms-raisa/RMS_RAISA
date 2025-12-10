import React, { useState, useMemo } from 'react';
import { Client, Consultant, UsuarioCliente, CoordenadorCliente } from '../types';
import ContactInfoCard from './ContactInfoCard';
import { History } from 'lucide-react';

interface AtividadesInserirProps {
    clients: Client[];
    consultants: Consultant[];
    usuariosCliente: UsuarioCliente[];
    coordenadoresCliente: CoordenadorCliente[];
    onManualReport: (text: string, gestorName?: string) => Promise<void>;
}

const AtividadesInserir: React.FC<AtividadesInserirProps> = ({
    clients,
    consultants,
    usuariosCliente,
    coordenadoresCliente,
    onManualReport
}) => {
    const [selectedClient, setSelectedClient] = useState<string>('');
    const [selectedConsultant, setSelectedConsultant] = useState<string>('');
    const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
    const [activities, setActivities] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);

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
        return consultants.find(c => c.nome_consultores === selectedConsultant);
    }, [selectedConsultant, consultants]);

    const managerData = useMemo(() => {
        if (!selectedConsultantData) return null;
        const gestor = usuariosCliente.find(u => u.id === selectedConsultantData.gestor_imediato_id);
        const coordenador = selectedConsultantData.coordenador_id 
          ? coordenadoresCliente.find(c => c.id === selectedConsultantData.coordenador_id)
          : null;
        return { gestor, coordenador };
    }, [selectedConsultantData, usuariosCliente, coordenadoresCliente]);

    const handleManualSubmit = async () => {
        if (!selectedConsultantData || !activities) {
            alert('Por favor, preencha todos os campos obrigatórios.');
            return;
        }
        setIsSubmitting(true);
        try {
            await onManualReport(activities, managerData?.gestor?.nome_gestor_cliente);
            alert('Relatório enviado com sucesso!');
            setActivities('');
        } catch (error) {
            console.error('Erro ao enviar relatório:', error);
            alert('Ocorreu um erro ao enviar o relatório.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <h1 className="text-2xl font-bold text-gray-800 mb-6">Inserir Relatório de Atividades</h1>
            
            {/* Cards de Informação */}
            {selectedConsultantData && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <ContactInfoCard title="Dados do Consultor" person={selectedConsultantData} />
                    {managerData?.gestor && <ContactInfoCard title="Dados do Gestor" person={managerData.gestor} />}
                    {managerData?.coordenador && <ContactInfoCard title="Dados do Coordenador" person={managerData.coordenador} />}
                </div>
            )}

            {/* Formulário */}
            <div className="bg-white p-6 rounded-lg shadow-md">
                {/* ... resto do formulário ... */}
            </div>
        </div>
    );
};

export default AtividadesInserir;
