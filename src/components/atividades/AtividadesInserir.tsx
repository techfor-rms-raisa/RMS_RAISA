import React, { useState, useMemo } from 'react';
import { Client, Consultant, UsuarioCliente } from '../../src/components/types';

interface AtividadesInserirProps {
    clients: Client[];
    consultants: Consultant[];
    usuariosCliente: UsuarioCliente[];
    onManualReport: (text: string, gestorName?: string, consultantName?: string) => Promise<void>;
}

const AtividadesInserir: React.FC<AtividadesInserirProps> = ({
    clients,
    consultants,
    usuariosCliente,
    onManualReport
}) => {
    // Estados do formulário
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
    
    // Estado para seleção de consultor em modo importação
    const [importSelectedClient, setImportSelectedClient] = useState<string>('');
    const [importSelectedConsultant, setImportSelectedConsultant] = useState<string>('');

    // Filtrar consultores pelo cliente selecionado (Modo Manual)
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

    // Filtrar consultores pelo cliente selecionado (Modo Importação)
    const filteredImportConsultants = useMemo(() => {
        if (!importSelectedClient) return [];
        
        const client = clients.find(c => c.razao_social_cliente === importSelectedClient);
        if (!client) return [];

        const clientManagers = usuariosCliente.filter(u => u.id_cliente === client.id);
        const managerIds = clientManagers.map(m => m.id);

        return consultants.filter(c => 
            c.status === 'Ativo' && 
            c.gestor_imediato_id && 
            managerIds.includes(c.gestor_imediato_id)
        ).sort((a, b) => a.nome_consultores.localeCompare(b.nome_consultores));
    }, [importSelectedClient, clients, consultants, usuariosCliente]);

    // Handler para upload de arquivo
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadedFile(file);
        setIsExtracting(true);

        try {
            if (file.type === 'application/pdf') {
                // Extrair texto de PDF
                const arrayBuffer = await file.arrayBuffer();
                const pdfjsLib = await import('pdfjs-dist');
                pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
                
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                let fullText = '';
                
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map((item: any) => item.str).join(' ');
                    fullText += pageText + '\n';
                }
                
                setExtractedText(fullText);
            } else if (file.type === 'text/plain') {
                // Ler arquivo TXT
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

        if (!importSelectedConsultant) {
            alert('Por favor, selecione um consultor para o relatório importado.');
            return;
        }

        setIsSubmitting(true);

        try {
            // Encontrar dados do consultor selecionado
            const consultant = consultants.find(c => c.nome_consultores === importSelectedConsultant);
            const manager = consultant ? usuariosCliente.find(u => u.id === consultant.gestor_imediato_id) : null;
            const client = clients.find(c => c.razao_social_cliente === importSelectedClient);

            const consultantName = consultant?.nome_consultores || 'Não especificado';
            const clientName = client?.razao_social_cliente || 'Não especificado';
            const gestorName = manager?.nome_gestor_cliente || 'Não especificado';

            // Formatar o texto do relatório com o nome do consultor
            const formattedText = `◆ ${consultantName} | ${clientName}\n${extractedText}`;

            // Chamar onManualReport com o nome do consultor
            await onManualReport(formattedText, gestorName, consultantName);

            // Limpar
            setUploadedFile(null);
            setExtractedText('');
            setImportSelectedClient('');
            setImportSelectedConsultant('');
            
            alert('Relatório importado e processado com sucesso!');
        } catch (error) {
            console.error('Erro ao processar relatório importado:', error);
            alert('Erro ao processar relatório. Tente novamente.');
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

            const consultantName = consultant?.nome_consultores || 'Não especificado';
            const clientName = client?.razao_social_cliente || 'Não especificado';
            
            const reportText = `◆ ${consultantName} | ${clientName}\n${activities}`;
            const gestorName = manager?.nome_gestor_cliente || 'Não especificado';

            // Chamar onManualReport com o nome do consultor
            await onManualReport(reportText, gestorName, consultantName);

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
        const template = `INSTRUÇÕES - Relatório de Atividades (Análise com IA Gemini)

Formato: Texto livre - Descreva as atividades do consultor

Estrutura:
- Escreva livremente sobre as atividades, desempenho e observações
- Você selecionará o consultor ANTES de processar
- A IA Gemini fará a análise completa e atribuirá o score de risco

================================================================================
RELATÓRIO DE ATIVIDADES - DEZEMBRO/2025
================================================================================

Está bastante satisfeito com a equipe, com o projeto e com a empresa. Tem conseguido entregar as demandas dentro do prazo e com qualidade. Recebeu feedback positivo do cliente sobre suas entregas. Demonstra proatividade e boa comunicação.

================================================================================

O CAC me acionou informando que o cliente relatou 2 faltas não justificadas no mês. Conversei com o consultor que informou estar passando por problemas pessoais. Orientei sobre a importância de comunicar ausências previamente. Cliente demonstrou insatisfação.

================================================================================

Apresentou excelente desempenho no mês. Participou ativamente das reuniões, entregou todas as tarefas no prazo e recebeu elogios do cliente pela qualidade técnica. Demonstra proatividade e boa comunicação com a equipe. Sugerida para promoção.

================================================================================

Não entregou projeto no prazo acordado. Cliente relatou problemas de comunicação e qualidade do código. Aplicada advertência formal. Necessário acompanhamento próximo nas próximas semanas.`;

        const blob = new Blob([template], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'template_relatorio_atividades.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const months = [
        { value: 1, label: 'Janeiro' },
        { value: 2, label: 'Fevereiro' },
        { value: 3, label: 'Março' },
        { value: 4, label: 'Abril' },
        { value: 5, label: 'Maio' },
        { value: 6, label: 'Junho' },
        { value: 7, label: 'Julho' },
        { value: 8, label: 'Agosto' },
        { value: 9, label: 'Setembro' },
        { value: 10, label: 'Outubro' },
        { value: 11, label: 'Novembro' },
        { value: 12, label: 'Dezembro' }
    ];

    return (
        <div className="max-w-4xl mx-auto p-6">
            {/* Cabeçalho */}
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800">
                    Inserir Relatório de Atividades
                </h2>
                <button
                    onClick={downloadTemplate}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium"
                >
                    Baixar Template de Exemplo
                </button>
            </div>

            {/* Abas */}
            <div className="flex gap-2 mb-6 border-b border-gray-200">
                <button
                    onClick={() => setMode('manual')}
                    className={`px-6 py-3 font-medium transition ${
                        mode === 'manual'
                            ? 'border-b-2 border-blue-600 text-blue-600'
                            : 'text-gray-600 hover:text-gray-800'
                    }`}
                >
                    Digitação Manual
                </button>
                <button
                    onClick={() => setMode('import')}
                    className={`px-6 py-3 font-medium transition ${
                        mode === 'import'
                            ? 'border-b-2 border-blue-600 text-blue-600'
                            : 'text-gray-600 hover:text-gray-800'
                    }`}
                >
                    Importar Arquivo
                </button>
            </div>

            {/* Conteúdo baseado no modo */}
            {mode === 'manual' ? (
                /* MODO: DIGITAÇÃO MANUAL */
                <form onSubmit={handleManualSubmit} className="space-y-6">
                    {/* Cliente */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Cliente *
                        </label>
                        <select
                            value={selectedClient}
                            onChange={(e) => {
                                setSelectedClient(e.target.value);
                                setSelectedConsultant('');
                            }}
                            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            required
                        >
                            <option value="">Selecione um cliente</option>
                            {clients.map(client => (
                                <option key={client.id} value={client.razao_social_cliente}>
                                    {client.razao_social_cliente}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Consultor */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Consultor *
                        </label>
                        <select
                            value={selectedConsultant}
                            onChange={(e) => setSelectedConsultant(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            required
                            disabled={!selectedClient}
                        >
                            <option value="">Selecione um cliente primeiro</option>
                            {filteredConsultants.map(consultant => (
                                <option key={consultant.id} value={consultant.nome_consultores}>
                                    {consultant.nome_consultores}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Mês */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Mês de Referência *
                        </label>
                        <select
                            value={month}
                            onChange={(e) => setMonth(parseInt(e.target.value))}
                            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            required
                        >
                            {months.map(m => (
                                <option key={m.value} value={m.value}>
                                    {m.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Atividades */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Descrição das Atividades *
                        </label>
                        <textarea
                            value={activities}
                            onChange={(e) => setActivities(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            rows={10}
                            placeholder="Descreva as atividades, entregas, problemas, sucessos, feedbacks do cliente, etc."
                            required
                        />
                    </div>

                    {/* Botão de Envio */}
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-3 rounded-lg transition"
                    >
                        {isSubmitting ? '⏳ Processando...' : '✅ Processar Relatório'}
                    </button>
                </form>
            ) : (
                /* MODO: IMPORTAR ARQUIVO */
                <div className="space-y-6">
                    {/* Aviso Importante */}
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm text-blue-800">
                            <strong>ℹ️ Importante:</strong> Você deve selecionar o consultor ANTES de processar o arquivo. 
                            O relatório será associado ao consultor selecionado.
                        </p>
                    </div>

                    {/* Cliente */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Cliente *
                        </label>
                        <select
                            value={importSelectedClient}
                            onChange={(e) => {
                                setImportSelectedClient(e.target.value);
                                setImportSelectedConsultant('');
                            }}
                            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            required
                        >
                            <option value="">Selecione um cliente</option>
                            {clients.map(client => (
                                <option key={client.id} value={client.razao_social_cliente}>
                                    {client.razao_social_cliente}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Consultor */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Consultor *
                        </label>
                        <select
                            value={importSelectedConsultant}
                            onChange={(e) => setImportSelectedConsultant(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            required
                            disabled={!importSelectedClient}
                        >
                            <option value="">Selecione um cliente primeiro</option>
                            {filteredImportConsultants.map(consultant => (
                                <option key={consultant.id} value={consultant.nome_consultores}>
                                    {consultant.nome_consultores}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Upload */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Upload do Arquivo (PDF ou TXT) *
                        </label>
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition">
                            <input
                                type="file"
                                accept=".pdf,.txt"
                                onChange={handleFileUpload}
                                disabled={isExtracting}
                                className="hidden"
                                id="file-input"
                            />
                            <label htmlFor="file-input" className="cursor-pointer">
                                {isExtracting ? (
                                    <p className="text-gray-600">⏳ Processando arquivo...</p>
                                ) : uploadedFile ? (
                                    <p className="text-green-600 font-semibold">✅ {uploadedFile.name}</p>
                                ) : (
                                    <>
                                        <p className="text-gray-600 text-lg">📁</p>
                                        <p className="text-gray-600">Clique para selecionar ou arraste um arquivo PDF/TXT</p>
                                    </>
                                )}
                            </label>
                        </div>
                    </div>

                    {/* Prévia */}
                    {extractedText && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Prévia do Texto Extraído
                            </label>
                            <div className="p-4 bg-gray-100 rounded-lg border border-gray-300 max-h-40 overflow-y-auto text-sm whitespace-pre-wrap">
                                {extractedText.substring(0, 500)}
                                {extractedText.length > 500 && '...'}
                            </div>
                        </div>
                    )}

                    {/* Botão de Envio */}
                    <button
                        type="button"
                        onClick={handleImportSubmit}
                        disabled={isSubmitting || !extractedText || !importSelectedConsultant}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-3 rounded-lg transition"
                    >
                        {isSubmitting ? '⏳ Processando...' : '✅ Processar Relatório Importado'}
                    </button>
                </div>
            )}
        </div>
    );
};

export default AtividadesInserir;
