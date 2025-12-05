import React, { useState } from 'react';
import { EmailTemplate, User, TemplateStatus } from '../src/components/types';
import { generateTemplateContent } from '../services/geminiService';

interface TemplateLibraryProps {
    templates: EmailTemplate[];
    currentUser: User;
    addTemplate: (t: EmailTemplate) => void;
    updateTemplate: (t: EmailTemplate) => void;
    deleteTemplate: (id: string) => void;
}

const TemplateLibrary: React.FC<TemplateLibraryProps> = ({ templates, currentUser, addTemplate, updateTemplate }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [context, setContext] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [name, setName] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerateAI = async () => {
        setIsGenerating(true);
        const res = await generateTemplateContent(context);
        setSubject(res.subject);
        setBody(res.body);
        setIsGenerating(false);
    };

    const handleSave = () => {
        const t: EmailTemplate = {
            id: `tpl-${Date.now()}`,
            name,
            subject,
            body,
            status: 'rascunho',
            lastUpdated: new Date().toISOString()
        };
        addTemplate(t);
        setIsModalOpen(false);
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-[#4D5253]">Biblioteca de Templates</h2>
                <button onClick={() => setIsModalOpen(true)} className="bg-[#533738] text-white px-4 py-2 rounded">+ Novo</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {templates.map(t => (
                    <div key={t.id} className="border p-4 rounded shadow-sm">
                        <h3 className="font-bold">{t.name}</h3>
                        <span className="text-xs bg-gray-100 px-2 py-1 rounded">{t.status}</span>
                    </div>
                ))}
            </div>
            {isModalOpen && (
                <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg w-full max-w-2xl p-6">
                        <h3 className="font-bold mb-4">Novo Template</h3>
                        <div className="space-y-4">
                            <input className="w-full border p-2 rounded" placeholder="Nome" value={name} onChange={e => setName(e.target.value)} />
                            <textarea className="w-full border p-2 rounded" placeholder="Contexto para IA" value={context} onChange={e => setContext(e.target.value)} />
                            <button onClick={handleGenerateAI} disabled={isGenerating} className="bg-purple-600 text-white px-3 py-1 rounded">{isGenerating ? '...' : 'Gerar com IA'}</button>
                            <input className="w-full border p-2 rounded" placeholder="Assunto" value={subject} onChange={e => setSubject(e.target.value)} />
                            <textarea className="w-full border p-2 rounded h-40" placeholder="Corpo" value={body} onChange={e => setBody(e.target.value)} />
                        </div>
                        <div className="flex justify-end gap-2 mt-4">
                            <button onClick={() => setIsModalOpen(false)} className="bg-gray-200 px-4 py-2 rounded">Cancelar</button>
                            <button onClick={handleSave} className="bg-green-600 text-white px-4 py-2 rounded">Salvar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TemplateLibrary;