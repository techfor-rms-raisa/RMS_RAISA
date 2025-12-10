
import React, { useState, useMemo, useEffect } from 'react';
import { Client, Consultant, UsuarioCliente, ConsultantReport, CoordenadorCliente } from '../types';
import HistoricoAtividadesModal from '../HistoricoAtividadesModal';
import { User, Phone, Mail, Briefcase, FileText, Clock } from 'lucide-react';

interface AtividadesInserirProps {
    clients: Client[];
    consultants: Consultant[];
    usuariosCliente: UsuarioCliente[];
    allReports: ConsultantReport[];
    loadConsultantReports: (consultantId: number) => Promise<ConsultantReport[]>;
    onManualReport: (text: string, gestorName?: string) => Promise<void>;
    preSelectedClient?: string;
    preSelectedConsultant?: string;
}

const AtividadesInserir: React.FC<AtividadesInserirProps> = ({
    clients,
    consultants,
    usuariosCliente,
    allReports,
    loadConsultantReports,
    onManualReport,
    preSelectedClient = '',
    preSelectedConsultant = ''
}) => {
    // Estados do formulário manual
    const [selectedClient, setSelectedClient] = useState<string>(preSelectedClient);
    const [selectedConsultant, setSelectedConsultant] = useState<string>(preSelectedConsultant);
    const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
    const [activities, setActivities] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Estados de upload
    const [mode, setMode] = useState<'manual' | 'import'>('manual');
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [extractedText, setExtractedText] = useState<string>('');
    const [isExtracting, setIsExtracting] = useState(false);
    
    // Estados para histórico
    const [showHistorico, setShowHistorico] = useState(false);
    const [loadedReports, setLoadedReports] = useState<ConsultantReport[]>([]);

    // Aplicar pré-seleção quando as props mudarem
    useEffect(() => {
        if (preSelectedClient) setSelectedClient(preSelectedClient);
        if (preSelectedConsultant) setSelectedConsultant(preSelectedConsultant);
    }, [preSelectedClient, preSelectedConsultant]);

    // Filtrar consultores pelo cliente selecionado
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

    // Dados do consultor selecionado
    const selectedConsultantData = useMemo(() => {
        return consultants.find(c => c.nome_consultores === selectedConsultant);
    }, [selectedConsultant, consultants]);

    // Dados do gestor do consultor
    const consultantManager = useMemo(() => {
        if (!selectedConsultantData?.gestor_imediato_id) return null;
        return usuariosCliente.find(u => u.id === selectedConsultantData.gestor_imediato_id);
    }, [selectedConsultantData, usuariosCliente]);

    // Handler para abrir histórico
    const handleOpenHistorico = async () => {
        if (!selectedConsultantData) return;
        
        try {
            const reports = await loadConsultantReports(selectedConsultantData.id);
            setLoadedReports(reports);
            setShowHistorico(true);
        } catch (error) {
            console.error('Erro ao carregar histórico:', error);
            alert('Erro ao carregar histórico de atividades.');
        }
    };

    // Handler para upload de arquivo
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadedFile(file);
        setIsExtracting(true);

        try {
            if (file.type === 'application/pdf') {
                const arrayBuffer = await file.arrayBuffer();
                const pdfjsLib = await import('pdfjs-dist');
                pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                let fullText = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
                }
                setExtractedText(fullText);
            } else if (file.type === 'text/plain') {
                const text = await file.text();
                setExtractedText(text);
            } else {
                alert('Por favor, selecione um arquivo PDF ou TXT.');
                setUploadedFile(null);
            }
        } catch (error) {
            console.error('Erro ao extrair texto:', error);
            alert('Erro ao processar arquivo. Tente novamente.');
            setUploadedFile(null);
        } finally {
            setIsExtracting(false);
        }
    };

    // Handler para processar relatório importado
    const handleImportSubmit = async () => {
        if (!extractedText.trim()) {
            alert('Por favor, faça upload de um arquivo primeiro.');
            return;
        }

        setIsSubmitting(true);

        try {
            const gestorName = 'Não especificado';
            await onManualReport(extractedText, gestorName);
            setUploadedFile(null);
            setExtractedText('');
        } catch (error) {
            console.error('Erro ao processar relatório importado:', error);
            alert('Ocorreu um erro ao processar o relatório.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Handler para formulário manual
    const handleManualSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedConsultant || !activities.trim()) {
            alert('Por favor, selecione um consultor e descreva as atividades.');
            return;
        }

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
        const template = `INSTRUÇÕES - Relatório de Atividades (Análise com IA Gemini)\n\nFormato: Texto livre - A IA identifica automaticamente consultores e calcula riscos\n\nEstrutura:\n- Cada consultor começa com ◆ (losango)\n- Formato: ◆ NOME DO CONSULTOR | NOME DO CLIENTE\n- Escreva livremente sobre as atividades, desempenho e observações\n- A IA Gemini fará a análise completa e atribuirá o score de risco\n\n================================================================================\nRELATÓRIO DE ATIVIDADES - DEZEMBRO/2025\n================================================================================\n\n◆ João Silva | AUTO AVALIAR\nEstá bastante satisfeito com a equipe, com o projeto e com a empresa. Tem conseguido entregar as demandas dentro do prazo e com qualidade. Recebeu feedback positivo do cliente sobre suas entregas. Demonstra proatividade e boa comunicação.\n\n◆ Pedro Oliveira | CLIENTE ABC\nO CAC me acionou informando que o cliente relatou 2 faltas não justificadas no mês. Conversei com o consultor que informou estar passando por problemas pessoais. Orientei sobre a importância de comunicar ausências previamente. Cliente demonstrou insatisfação.\n\n◆ Maria Santos | CLIENTE XYZ\nApresentou excelente desempenho no mês. Participou ativamente das reuniões, entregou todas as tarefas no prazo e recebeu elogios do cliente pela qualidade técnica. Demonstra proatividade e boa comunicação com a equipe. Sugerida para promoção.`;
        const blob = new Blob([template], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'template_relatorios_atividades.txt';
        a.click();
        URL.revokeObjectURL(url);
    };

    const months = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: new Date(0, i).toLocaleString('pt-BR', { month: 'long' }) }));

    return (
        <div className="max-w-6xl mx-auto p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800">Inserir Relatório de Atividades</h2>
                <div className="flex gap-3">
                    {selectedConsultantData && (
                        <button 
                            onClick={handleOpenHistorico}
                            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium flex items-center gap-2"
                        >
                            <Clock size={18} />
                            Histórico de Atividades
                        </button>
                    )}
                    <button 
                        onClick={downloadTemplate} 
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium"
                    >
                        Baixar Template de Exemplo
                    </button>
                </div>
            </div>

            <div className="flex gap-2 mb-6 border-b border-gray-200">
                <button onClick={() => setMode('manual')} className={`px-6 py-3 font-medium transition ${mode === 'manual' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}>Digitação Manual</button>
                <button onClick={() => setMode('import')} className={`px-6 py-3 font-medium transition ${mode === 'import' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}>Importar Arquivo</button>
            </div>

            {mode === 'manual' ? (
                <form onSubmit={handleManualSubmit} className="space-y-6">
                    {/* Cliente */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Cliente</label>
                        <select value={selectedClient} onChange={(e) => { setSelectedClient(e.target.value); setSelectedConsultant(''); }} className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                            <option value="">Selecione um cliente...</option>
                            {clients.map(c => <option key={c.id} value={c.razao_social_cliente}>{c.razao_social_cliente}</option>)}
                        </select>
                    </div>

                    {/* Consultor */}
                    {selectedClient && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Consultor</label>
                            <select value={selectedConsultant} onChange={(e) => setSelectedConsultant(e.target.value)} className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                                <option value="">Selecione um consultor...</option>
                                {filteredConsultants.map(c => <option key={c.id} value={c.nome_consultores}>{c.nome_consultores}</option>)}
                            </select>
                        </div>
                    )}

                    {/* Cards de Informação - Consultor e Gestor */}
                    {selectedConsultantData && consultantManager && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                            {/* Card do Consultor */}
                            <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-5 shadow-sm">
                                <div className="flex items-center gap-2 mb-4">
                                    <User className="text-blue-600" size={20} />
                                    <h3 className="font-semibold text-blue-900">Dados do Consultor</h3>
                                </div>
                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center gap-2">
                                        <User size={16} className="text-blue-600" />
                                        <span className="font-medium text-gray-700">Nome:</span>
                                        <span className="text-gray-900">{selectedConsultantData.nome_consultores}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Mail size={16} className="text-blue-600" />
                                        <span className="font-medium text-gray-700">E-mail:</span>
                                        <span className="text-gray-900">{selectedConsultantData.email_consultores || 'Não informado'}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Phone size={16} className="text-blue-600" />
                                        <span className="font-medium text-gray-700">Celular:</span>
                                        <span className="text-gray-900">{selectedConsultantData.celular_consultores || 'Não informado'}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Card do Gestor */}
                            <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-5 shadow-sm">
                                <div className="flex items-center gap-2 mb-4">
                                    <Briefcase className="text-purple-600" size={20} />
                                    <h3 className="font-semibold text-purple-900">Gestor Responsável</h3>
                                </div>
                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center gap-2">
                                        <User size={16} className="text-purple-600" />
                                        <span className="font-medium text-gray-700">Nome:</span>
                                        <span className="text-gray-900">{consultantManager.nome_gestor_cliente}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Briefcase size={16} className="text-purple-600" />
                                        <span className="font-medium text-gray-700">Cargo:</span>
                                        <span className="text-gray-900">{consultantManager.cargo_gestor_cliente || 'Gestor'}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Mail size={16} className="text-purple-600" />
                                        <span className="font-medium text-gray-700">E-mail:</span>
                                        <span className="text-gray-900">{consultantManager.email_gestor_cliente || 'Não informado'}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Phone size={16} className="text-purple-600" />
                                        <span className="font-medium text-gray-700">Celular:</span>
                                        <span className="text-gray-900">{consultantManager.celular_gestor_cliente || 'Não informado'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Mês */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Mês</label>
                        <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                            {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                    </div>

                    {/* Atividades */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Atividades e Observações</label>
                        <textarea value={activities} onChange={(e) => setActivities(e.target.value)} placeholder="Descreva as atividades, desempenho e observações sobre o consultor..." className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent" rows={10} />
                    </div>

                    {/* Botão Enviar */}
                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={() => { setSelectedClient(''); setSelectedConsultant(''); setMonth(new Date().getMonth() + 1); setActivities(''); }} className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition font-medium">Limpar</button>
                        <button type="submit" disabled={isSubmitting || !selectedConsultant} className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400 font-medium">{isSubmitting ? 'Processando...' : 'Enviar Relatório'}</button>
                    </div>
                </form>
            ) : (
                <div className="space-y-6">
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                        <input type="file" accept=".pdf,.txt" onChange={handleFileUpload} className="hidden" id="file-upload" />
                        <label htmlFor="file-upload" className="cursor-pointer inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium">Selecionar PDF ou TXT</label>
                        {uploadedFile && <div className="mt-4 text-sm text-gray-600"><p><strong>Arquivo:</strong> {uploadedFile.name}</p></div>}
                        {isExtracting && <p className="mt-4 text-blue-600">Extraindo texto...</p>}
                    </div>
                    {extractedText && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Texto Extraído</label>
                            <textarea value={extractedText} onChange={(e) => setExtractedText(e.target.value)} className="w-full border border-gray-300 rounded-lg p-3" rows={15} />
                        </div>
                    )}
                    <div className="flex justify-end">
                        <button onClick={handleImportSubmit} className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400" disabled={isSubmitting || !extractedText}>{isSubmitting ? 'Processando...' : 'Importar e Processar'}</button>
                    </div>
                </div>
            )}

            {/* Modal de Histórico */}
            {showHistorico && selectedConsultantData && (
                <HistoricoAtividadesModal
                    consultant={selectedConsultantData}
                    allReports={loadedReports}
                    onClose={() => setShowHistorico(false)}
                />
            )}
        </div>
    );
};

export default AtividadesInserir;
