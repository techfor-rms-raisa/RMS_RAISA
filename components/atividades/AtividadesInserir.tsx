import React, { useState, useMemo } from 'react';
import { Client, Consultant, UsuarioCliente } from '../../src/components/types';

interface AtividadesInserirProps {
    clients: Client[];
    consultants: Consultant[];
    usuariosCliente: UsuarioCliente[];
    onManualReport: (text: string, gestorName?: string) => Promise<void>;
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

    // Filtrar consultores pelo cliente selecionado
    const filteredConsultants = useMemo(() => {
        if (!selectedClient) return [];
        
        // Verificação de segurança para evitar erro de null
        if (!clients || !consultants || !usuariosCliente) return [];
        
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

        setIsSubmitting(true);

        try {
            // Buscar gestor do primeiro cliente encontrado no texto
            const manager = usuariosCliente[0]; // Simplificado, pode melhorar lógica
            const gestorName = manager?.nome_gestor_cliente || 'Não especificado';

            await onManualReport(extractedText, gestorName);

            // Limpar
            setUploadedFile(null);
            setExtractedText('');
            
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
        const template = `Relatório de Atividades – Período de 01.12.2025 a 05.12.2025

◆ João Silva | AUTO AVALIAR
Está bastante satisfeito com a equipe, com o projeto e com a empresa. Tem conseguido entregar as demandas dentro do prazo e com qualidade. Recebeu feedback positivo do cliente sobre suas entregas.

◆ Pedro Oliveira | AUTO AVALIAR
O CAC me acionou informando que o cliente relatou 2 faltas não justificadas no mês. Conversei com o consultor que informou estar passando por problemas pessoais. Orientei sobre a importância de comunicar ausências previamente.

◆ Maria Santos | CLIENTE XYZ
Apresentou excelente desempenho no mês. Participou ativamente das reuniões, entregou todas as tarefas no prazo e recebeu elogios do cliente pela qualidade técnica. Demonstra proatividade e boa comunicação com a equipe.`;

        const blob = new Blob([template], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'template_relatorios_atividades.txt';
        a.click();
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
                            placeholder="Descreva as atividades, entregas, problemas, sucessos, feedbacks do cliente, etc.

Exemplo:
- Entregou todas as tarefas dentro do prazo
- Recebeu elogio do cliente pela qualidade do trabalho
- Apresentou dificuldade em comunicação com a equipe
- Participou de treinamento técnico
- 2 faltas não justificadas no mês"
                            required
                        />
                        <p className="text-xs text-gray-500 mt-2">
                            A IA analisará o texto e identificará automaticamente o nível de risco (1-5)
                        </p>
                    </div>

                    {/* Legenda */}
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <h4 className="font-semibold text-gray-800 mb-3">Níveis de Risco:</h4>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded-full bg-green-500"></div>
                                <span><strong>1 - Excelente:</strong> Performance excepcional</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded-full bg-blue-500"></div>
                                <span><strong>2 - Bom:</strong> Performance satisfatória</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded-full bg-yellow-500"></div>
                                <span><strong>3 - Médio:</strong> Pontos de atenção</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded-full bg-orange-500"></div>
                                <span><strong>4 - Alto:</strong> Problemas significativos</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded-full bg-red-500"></div>
                                <span><strong>5 - Crítico:</strong> Situação grave</span>
                            </div>
                        </div>
                    </div>

                    {/* Botão */}
                    <div className="flex justify-end">
                        <button
                            type="submit"
                            className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? 'Processando...' : 'Processar Relatório'}
                        </button>
                    </div>
                </form>
            ) : (
                /* MODO: IMPORTAR ARQUIVO */
                <div className="space-y-6">
                    {/* Upload */}
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                        <input
                            type="file"
                            accept=".pdf,.txt"
                            onChange={handleFileUpload}
                            className="hidden"
                            id="file-upload"
                        />
                        <label
                            htmlFor="file-upload"
                            className="cursor-pointer inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
                        >
                            Selecionar PDF ou TXT
                        </label>
                        
                        {uploadedFile && (
                            <div className="mt-4 text-sm text-gray-600">
                                <p><strong>Arquivo:</strong> {uploadedFile.name}</p>
                                <p><strong>Tamanho:</strong> {(uploadedFile.size / 1024).toFixed(2)} KB</p>
                            </div>
                        )}
                        
                        {isExtracting && (
                            <p className="mt-4 text-blue-600">Extraindo texto do arquivo...</p>
                        )}
                    </div>

                    {/* Preview do texto extraído */}
                    {extractedText && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Texto Extraído (você pode editar se necessário)
                            </label>
                            <textarea
                                value={extractedText}
                                onChange={(e) => setExtractedText(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                rows={15}
                            />
                            <p className="text-xs text-gray-500 mt-2">
                                A IA identificará automaticamente os consultores e analisará os riscos
                            </p>
                        </div>
                    )}

                    {/* Legenda */}
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <h4 className="font-semibold text-gray-800 mb-3">Níveis de Risco:</h4>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded-full bg-green-500"></div>
                                <span><strong>1 - Excelente:</strong> Performance excepcional</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded-full bg-blue-500"></div>
                                <span><strong>2 - Bom:</strong> Performance satisfatória</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded-full bg-yellow-500"></div>
                                <span><strong>3 - Médio:</strong> Pontos de atenção</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded-full bg-orange-500"></div>
                                <span><strong>4 - Alto:</strong> Problemas significativos</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded-full bg-red-500"></div>
                                <span><strong>5 - Crítico:</strong> Situação grave</span>
                            </div>
                        </div>
                    </div>

                    {/* Botão Importar */}
                    <div className="flex justify-end">
                        <button
                            onClick={handleImportSubmit}
                            className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                            disabled={isSubmitting || !extractedText}
                        >
                            {isSubmitting ? 'Processando...' : 'Importar e Processar'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AtividadesInserir;
