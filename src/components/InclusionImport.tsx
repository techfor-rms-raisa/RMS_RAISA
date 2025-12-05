
import React, { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Client, UsuarioCliente, CoordenadorCliente } from '../components/types';

// Robustly resolve the pdfjs library object (reusing logic from FileUpload)
const getPdfJs = () => {
    // @ts-ignore 
    return pdfjsLib.default || pdfjsLib;
};

const pdfjs = getPdfJs();
if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
} else {
    console.warn("PDF.js GlobalWorkerOptions not found. PDF parsing might fail.");
}

interface InclusionImportProps {
    clients: Client[];
    managers: UsuarioCliente[];
    coordinators: CoordenadorCliente[];
    onImport: (consultantData: any) => void;
}

const InclusionImport: React.FC<InclusionImportProps> = ({ clients, managers, coordinators, onImport }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

    const normalize = (str: any) => {
        if (!str) return '';
        return String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    };

    const extractTextFromPDF = async (file: File): Promise<string> => {
        const pdfjs = getPdfJs();
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjs.getDocument(arrayBuffer);
        const pdf = await loadingTask.promise;
        
        let fullText = '';
        // Scan all pages (usually just 1 for this sheet)
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            // Join with newlines to preserve vertical structure for line-by-line regex
            const pageText = textContent.items.map((item: any) => item.str).join('\n'); 
            fullText += pageText + '\n';
        }
        return fullText;
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsLoading(true);
        setMessage(null);

        try {
            if (file.type !== 'application/pdf') {
                throw new Error("Formato inválido. Por favor selecione um arquivo PDF.");
            }

            const text = await extractTextFromPDF(file);
            
            // --- 1. PARSE FIELDS (REGEX STRATEGY) ---
            
            // Helper to find value in the whole text (when label and value are on same line or close)
            const findValue = (regex: RegExp, content: string) => {
                const match = content.match(regex);
                return match ? match[1].trim() : '';
            };

            // Fields Mapping based on Prompt text labels
            const clientName = findValue(/CLIENTE:\s*(.*)/i, text);
            const managerName = findValue(/NOME SOLICITANTE:\s*(.*)/i, text);
            const coordName = findValue(/RESPONSÁVEL APROVADOR DE HORAS:\s*(.*)/i, text);
            
            // Process line by line for specific fields
            const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            
            let consultantName = '';
            let role = '';
            let startDateStr = '';
            let hourlyRateStr = '';

            for (let i = 0; i < lines.length; i++) {
                const cleanLine = lines[i];
                
                // Strict start matching to avoid confusion
                if (cleanLine.match(/^NOME:/i)) {
                    consultantName = cleanLine.replace(/^NOME:/i, '').trim();
                }
                if (cleanLine.match(/^FUNÇÃO:/i)) {
                    role = cleanLine.replace(/^FUNÇÃO:/i, '').trim();
                }
                if (cleanLine.match(/^DATA DE INÍCIO:/i)) {
                    startDateStr = cleanLine.replace(/^DATA DE INÍCIO:/i, '').trim();
                }
                
                // LOGIC: Find "FATURAMENTO MENSAL" and capture value (either same line or next line)
                if (cleanLine.match(/FATURAMENTO MENSAL/i)) {
                     // Strategy 1: Look on the same line
                     let match = cleanLine.match(/FATURAMENTO MENSAL.*?R?\$?\s*([\d.,]+)/i);
                     
                     // Strategy 2: If not found, Look at the immediate next line (common in PDF table extraction)
                     if (!match && i + 1 < lines.length) {
                         const nextLine = lines[i+1];
                         // Look for a currency-like value or just a number on the next line
                         // e.g. "R$ 144,10" or "144,10"
                         match = nextLine.match(/R?\$?\s*([\d.,]+)/);
                     }

                     if (match) {
                         hourlyRateStr = match[1];
                     }
                }
            }
            
            // Fallback for Name if strict line match failed (due to PDF flow)
            if (!consultantName) {
                 const match = text.match(/NOME:\s*(?!SOLICITANTE)(.*)/i);
                 if (match) consultantName = match[1].trim();
            }

            // Parse Values
            // 1. Date (dd/mm/yyyy -> yyyy-mm-dd)
            let startDate = new Date().toISOString().split('T')[0];
            if (startDateStr) {
                const parts = startDateStr.split('/');
                if (parts.length === 3) {
                    startDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                }
            }

            // 2. Billing Calculation (Value found * 168)
            let billingValue = 0;
            if (hourlyRateStr) {
                // Normalize currency: remove dots (thousands), replace comma with dot
                // Ex: "1.200,50" -> "1200.50"
                const normalizedString = hourlyRateStr.replace(/\./g, '').replace(',', '.');
                const normalizedValue = parseFloat(normalizedString);
                
                if (!isNaN(normalizedValue)) {
                    billingValue = normalizedValue * 168;
                }
            }

            // --- 2. MATCH IDS ---
            
            if (!clientName) throw new Error("Campo 'CLIENTE:' não encontrado ou vazio no PDF.");
            if (!consultantName) throw new Error("Campo 'NOME:' (Consultor) não encontrado no PDF.");

            const client = clients.find(c => normalize(c.razao_social_cliente) === normalize(clientName));
            if (!client) throw new Error(`Cliente "${clientName}" não encontrado na base de dados.`);

            // Manager Match
            let targetManagerId = 0;
            // Clean manager name (sometimes PDF extracts 'Nome: Value' inside the capture group if regex is loose)
            const cleanManagerName = managerName.replace(/_/g, '').trim();

            const manager = managers.find(m => m.id_cliente === client.id && normalize(m.nome_gestor_cliente) === normalize(cleanManagerName));
            
            if (manager) {
                targetManagerId = manager.id;
            } else {
                 // Fuzzy/Loose Match
                 const firstPart = cleanManagerName.split(' ')[0];
                 const looseMgr = managers.find(m => m.id_cliente === client.id && normalize(m.nome_gestor_cliente).includes(normalize(firstPart)));
                 
                 if (looseMgr) {
                     targetManagerId = looseMgr.id;
                 } else {
                     // Fallback to first manager of client if exists (with warning logic, silent here but functional)
                     const clientManagers = managers.filter(m => m.id_cliente === client.id);
                     if (clientManagers.length > 0) {
                         targetManagerId = clientManagers[0].id;
                     } else {
                         throw new Error(`Nenhum gestor encontrado para o cliente ${clientName}.`);
                     }
                 }
            }

            // Coordinator Match
            let targetCoordId = null;
            if (coordName && targetManagerId) {
                 const cleanCoordName = coordName.replace(/_/g, '').trim();
                 const coord = coordinators.find(c => c.id_gestor_cliente === targetManagerId && normalize(c.nome_coordenador_cliente) === normalize(cleanCoordName));
                 if (coord) targetCoordId = coord.id;
            }

            // --- 3. CONSTRUCT DATA ---
            const newConsultantData = {
                ano_vigencia: new Date().getFullYear(),
                nome_consultores: consultantName,
                cargo_consultores: role || 'Consultor',
                data_inclusao_consultores: startDate,
                status: 'Ativo',
                gestor_imediato_id: targetManagerId,
                coordenador_id: targetCoordId,
                valor_faturamento: billingValue || 0, // Saved as Calculated Monthly Value
                // Defaults
                gestor_rs_id: client.id_gestor_rs,
                id_gestao_de_pessoas: client.id_gestao_de_pessoas,
            };

            onImport(newConsultantData);
            setMessage({ text: `Ficha de Inclusão "${consultantName}" concluída com sucesso!`, type: 'success' });

        } catch (error) {
            console.error(error);
            setMessage({ text: `Erro na importação: ${error instanceof Error ? error.message : String(error)}`, type: 'error' });
        } finally {
            setIsLoading(false);
            // Reset file input
            e.target.value = '';
        }
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-md mb-8 border-t-4 border-blue-600">
            <h2 className="text-xl font-bold text-[#4D5253] mb-4">Importação Ficha de Inclusão</h2>
            <div className="flex flex-col sm:flex-row items-center gap-4">
                <label className={`cursor-pointer bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors duration-300 shadow-sm flex items-center ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <span className="mr-2 text-lg">📄</span>
                    {isLoading ? 'Lendo PDF...' : 'Selecionar Ficha (PDF)'}
                    <input 
                        type="file" 
                        className="hidden" 
                        onChange={handleFileUpload} 
                        accept=".pdf" 
                        disabled={isLoading} 
                    />
                </label>
                <p className="text-xs text-gray-500 italic">
                    Formatos aceitos: .pdf (Layout Padronizado RMS)
                </p>
            </div>
            
            {message && (
                <div className={`mt-4 p-3 rounded-md text-sm font-medium flex items-center ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    <span className="text-lg mr-2">{message.type === 'success' ? '✅' : '❌'}</span>
                    {message.text}
                </div>
            )}
        </div>
    );
};

export default InclusionImport;
