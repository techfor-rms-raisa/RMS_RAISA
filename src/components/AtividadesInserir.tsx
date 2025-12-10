// src/components/atividades/AtividadesInserir.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { Client, Consultant, UsuarioCliente, CoordenadorCliente, ConsultantReport } from '../types';
import { User, Phone, Mail, Briefcase, Clock } from 'lucide-react';
import HistoricoAtividadesModal from '../HistoricoAtividadesModal';

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
    // Estados do formulário manual
    const [selectedClient, setSelectedClient] = useState<string>('');
    const [selectedConsultant, setSelectedConsultant] = useState<string>('');
    const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
    const [activities, setActivities] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Estados de upload
    const [mode, setMode] = useState<'manual' | 'import'>('manual');
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [extractedText, setExtractedText] = useState<string>('');
    const [isExtracting, setIsExtracting] = useState(false);

    // Estado para modal de histórico
    const [showHistoricoModal, setShowHistoricoModal] = useState(false);
    const [consultantReports, setConsultantReports] = useState<ConsultantReport[]>([]);
    const [loadingReports, setLoadingReports] = useState(false);

    // ✅ NAVEGAÇÃO CONTEXTUAL: Pré-selecionar cliente e consultor quando recebidos
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

    // Filtrar consultores pelo cliente selecionado (apenas para modo manual)
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

    // Obter dados do consultor selecionado
    const selectedConsultantData = useMemo(() => {
        if (!selectedConsultant) return null;
        return consultants.find(c => c.nome_consultores === selectedConsultant);
    }, [selectedConsultant, consultants]);

    // Obter dados do gestor/coordenador associado
    const managerData = useMemo(() => {
        if (!selectedConsultantData) return null;
        
        // Primeiro tenta buscar o gestor imediato
        const manager = usuariosCliente.find(u => u.id === selectedConsultantData.gestor_imediato_id);
        
        if (manager) {
            return {
                nome: manager.nome_gestor_cliente,
                cargo: manager.cargo_gestor,
                email: `gestor${manager.id}@cliente.com`, // Email não está na tabela, usar placeholder
                celular: manager.celular || 'Não informado',
                tipo: 'Gestor'
            };
        }
        
        // Se não encontrar gestor, tenta buscar coordenador
        if (selectedConsultantData.coordenador_id) {
            const coordenador = coordenadoresCliente.find(c => c.id === selectedConsultantData.coordenador_id);
            if (coordenador) {
                return {
                    nome: coordenador.nome_coordenador_cliente,
                    cargo: coordenador.cargo_coordenador_cliente,
                    email: `coordenador${coordenador.id}@cliente.com`, // Email não está na tabela, usar placeholder
                    celular: coordenador.celular || 'Não informado',
                    tipo: 'Coordenador'
                };
            }
        }
        
        return null;
    }, [selectedConsultantData, usuariosCliente, coordenadoresCliente]);

    // Handler para abrir histórico
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

    const handleImportSubmit = async () => {
        if (!extractedText) return;
        setIsSubmitting(true);
        try {
            await onManualReport(extractedText);
            setExtractedText('');
            setUploadedFile(null);
            alert('Relatório importado e processado com sucesso!');
        } catch (error) {
            console.error('Erro ao processar relatório:', error);
            alert('Erro ao processar relatório. Tente novamente.');
        } finally {
            setIsSubmitting(false);
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
                <button onClick={downloadTemplate} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium">Baixar Template de Exemplo</button>
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

                    {/* ✅ CARDS DE INFORMAÇÃO - Aparecem quando consultor é selecionado */}
                    {selectedConsultantData && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 my-6">
                            {/* Card 1: Dados do Consultor */}
                            <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-5 shadow-sm">
                                <div className="flex items-center gap-2 mb-4">
                                    <User className="w-5 h-5 text-blue-600" />
                                    <h3 className="text-lg font-semibold text-blue-900">Dados do Consultor</h3>
                                </div>
                                <div className="space-y-3">
                                    <div className="flex items-start gap-2">
                                        <User className="w-4 h-4 text-blue-600 mt-1 flex-shrink-0" />
                                        <div>
                                            <p className="text-xs text-blue-700 font-medium">Nome</p>
                                            <p className="text-sm text-gray-800 font-semibold">{selectedConsultantData.nome_consultores}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <Mail className="w-4 h-4 text-blue-600 mt-1 flex-shrink-0" />
                                        <div>
                                            <p className="text-xs text-blue-700 font-medium">E-mail</p>
                                            <p className="text-sm text-gray-800">{selectedConsultantData.email_consultor || 'Não informado'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <Phone className="w-4 h-4 text-blue-600 mt-1 flex-shrink-0" />
                                        <div>
                                            <p className="text-xs text-blue-700 font-medium">Celular</p>
                                            <p className="text-sm text-gray-800">{selectedConsultantData.celular || 'Não informado'}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Card 2: Dados do Gestor/Coordenador */}
                            {managerData ? (
                                <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-5 shadow-sm">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Briefcase className="w-5 h-5 text-purple-600" />
                                        <h3 className="text-lg font-semibold text-purple-900">Dados do {managerData.tipo}</h3>
                                    </div>
                                    <div className="space-y-3">
                                        <div className="flex items-start gap-2">
                                            <User className="w-4 h-4 text-purple-600 mt-1 flex-shrink-0" />
                                            <div>
                                                <p className="text-xs text-purple-700 font-medium">Nome</p>
                                                <p className="text-sm text-gray-800 font-semibold">{managerData.nome}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-2">
                                            <Briefcase className="w-4 h-4 text-purple-600 mt-1 flex-shrink-0" />
                                            <div>
                                                <p className="text-xs text-purple-700 font-medium">Cargo</p>
                                                <p className="text-sm text-gray-800">{managerData.cargo}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-2">
                                            <Mail className="w-4 h-4 text-purple-600 mt-1 flex-shrink-0" />
                                            <div>
                                                <p className="text-xs text-purple-700 font-medium">E-mail</p>
                                                <p className="text-sm text-gray-800">{managerData.email}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-2">
                                            <Phone className="w-4 h-4 text-purple-600 mt-1 flex-shrink-0" />
                                            <div>
                                                <p className="text-xs text-purple-700 font-medium">Celular</p>
                                                <p className="text-sm text-gray-800">{managerData.celular}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-5 shadow-sm flex items-center justify-center">
                                    <p className="text-gray-500 text-sm">Nenhum gestor/coordenador associado</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Botão Histórico de Atividades */}
                    {selectedConsultantData && loadConsultantReports && (
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={handleOpenHistorico}
                                disabled={loadingReports}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium disabled:bg-gray-400"
                            >
                                <Clock className="w-4 h-4" />
                                {loadingReports ? 'Carregando...' : 'Histórico de Atividades (90 dias)'}
                            </button>
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
            {showHistoricoModal && selectedConsultantData && (
                <HistoricoAtividadesModal
                    consultant={selectedConsultantData}
                    allReports={consultantReports}
                    onClose={() => setShowHistoricoModal(false)}
                />
            )}
        </div>
    );
};

export default AtividadesInserir;
