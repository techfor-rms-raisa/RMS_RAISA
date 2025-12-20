import React, { useState } from 'react';
import { ComplianceCampaign, EmailTemplate, Consultant } from '@/types';

interface CampaignsProps {
    campaigns: ComplianceCampaign[];
    templates: EmailTemplate[];
    consultants: Consultant[];
    addCampaign: (c: ComplianceCampaign) => void;
    onSimulateLink: (token: string) => void;
}

const ComplianceCampaigns: React.FC<CampaignsProps> = ({ campaigns, templates, addCampaign, onSimulateLink }) => {
    const [isCreating, setIsCreating] = useState(false);
    const [name, setName] = useState('');
    const [target, setTarget] = useState<'all_active'|'quarantine'|'risk_only'>('all_active');
    const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);

    const handleCreate = () => {
        const newCampaign: ComplianceCampaign = {
            id: `cmp-${Date.now()}`,
            name,
            targetFilter: target,
            templateSequenceIds: selectedTemplates,
            intervalDays: 7,
            startDate: new Date().toISOString(),
            status: 'active'
        };
        addCampaign(newCampaign);
        setIsCreating(false);
    };

    const toggleTemplate = (id: string) => {
        if (selectedTemplates.includes(id)) setSelectedTemplates(prev => prev.filter(tid => tid !== id));
        else setSelectedTemplates(prev => [...prev, id]);
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-md space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-[#4D5253]">Gestão de Campanhas</h2>
                <button onClick={() => setIsCreating(true)} className="bg-[#533738] text-white px-4 py-2 rounded hover:bg-opacity-90">+ Nova Campanha</button>
            </div>

            <div className="grid gap-4">
                {campaigns.map(c => (
                    <div key={c.id} className="border p-4 rounded flex justify-between items-center bg-gray-50">
                        <div>
                            <h3 className="font-bold">{c.name}</h3>
                            <p className="text-sm text-gray-600">Alvo: {c.targetFilter} | Templates: {c.templateSequenceIds.length}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded text-xs uppercase font-bold ${c.status==='active'?'bg-green-100 text-green-800':'bg-gray-200'}`}>{c.status}</span>
                            {c.status === 'active' && (
                                <button onClick={() => onSimulateLink(`mock-${Date.now()}`)} className="text-blue-600 text-sm underline ml-4">Simular Link</button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {isCreating && (
                <div className="border rounded-lg p-4 bg-gray-100 mt-4">
                    <h3 className="font-bold mb-4">Configurar Campanha</h3>
                    <div className="grid gap-4 mb-4">
                        <input className="border p-2 rounded" placeholder="Nome" value={name} onChange={e => setName(e.target.value)} />
                        <select className="border p-2 rounded" value={target} onChange={e => setTarget(e.target.value as any)}>
                            <option value="all_active">Todos Ativos</option>
                            <option value="quarantine">Em Quarentena</option>
                            <option value="risk_only">Risco Moderado/Alto</option>
                        </select>
                    </div>
                    <div className="mb-4">
                        <p className="font-bold text-sm mb-2">Selecionar Templates:</p>
                        <div className="flex gap-2 flex-wrap">
                            {templates.filter(t => t.status === 'aprovado').map(t => (
                                <button key={t.id} onClick={() => toggleTemplate(t.id)} className={`border px-3 py-1 rounded text-sm ${selectedTemplates.includes(t.id) ? 'bg-blue-600 text-white' : 'bg-white'}`}>
                                    {t.name}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setIsCreating(false)} className="bg-gray-300 px-4 py-2 rounded">Cancelar</button>
                        <button onClick={handleCreate} className="bg-green-600 text-white px-4 py-2 rounded">Lançar</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ComplianceCampaigns;