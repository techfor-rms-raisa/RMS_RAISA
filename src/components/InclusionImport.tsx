import React, { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Client, UsuarioCliente, CoordenadorCliente, User } from '@/types';

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

// ✅ Tipos de modalidade de contrato
type ModalidadeContrato = 'PJ' | 'CLT' | 'Temporário' | 'Outros';

interface InclusionImportProps {
    clients: Client[];
    managers: UsuarioCliente[];
    coordinators: CoordenadorCliente[];
    users: User[]; // ✅ NOVO: Para buscar analista_rs_id por nome
    onImport: (consultantData: any) => void;
}

const InclusionImport: React.FC<InclusionImportProps> = ({ clients, managers, coordinators, users, onImport }) => {
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

    /**
     * Busca usuário por nome (para analista_rs_id)
     */
    const findUserByName = (name: string): User | null => {
        if (!name || name === 'XXX' || name === 'xxx') return null;
        
        const normalizedName = normalize(name);
        
        // Busca exata
        let user = users.find(u => normalize(u.nome_usuario) === normalizedName);
        if (user) return user;
        
        // Busca parcial (primeiro nome)
        const firstName = normalizedName.split(' ')[0];
        user = users.find(u => normalize(u.nome_usuario).startsWith(firstName));
        if (user) {
            console.log(`⚠️ Usuário encontrado por aproximação: "${user.nome_usuario}" para "${name}"`);
            return user;
        }
        
        // Busca contém
        user = users.find(u => normalize(u.nome_usuario).includes(normalizedName) || normalizedName.includes(normalize(u.nome_usuario)));
        if (user) {
            console.log(`⚠️ Usuário encontrado por busca parcial: "${user.nome_usuario}" para "${name}"`);
            return user;
        }
        
        return null;
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
            
            console.log('📄 Texto extraído do PDF:', text);
            
            // --- 1. PARSE FIELDS (REGEX STRATEGY) ---
            
            // Helper to find value in the whole text
            const findValue = (regex: RegExp, content: string) => {
                const match = content.match(regex);
                return match ? match[1].trim() : '';
            };

            // Fields Mapping based on PDF structure
            const clientName = findValue(/CLIENTE:\s*(.*)/i, text);
            const managerName = findValue(/NOME SOLICITANTE:\s*(.*)/i, text);
            const coordName = findValue(/RESPONSÁVEL APROVADOR DE HORAS:\s*(.*)/i, text);
            
            // Process line by line for specific fields
            const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            
            let consultantName = '';
            let role = '';
            let startDateStr = '';
            let hourlyRateStr = '';
            let celularStr = '';
            let cpfStr = '';
            let valorPagamentoStr = '';
            let emailStr = '';
            let cnpjStr = '';
            let empresaStr = '';
            let dtAniversarioStr = '';
            let especialidadeStr = '';
            
            // ✅ NOVOS CAMPOS
            let substituicao = false;
            let nomeSubstituidoStr = '';
            let modalidadeContratoStr = '';
            let faturavel = true; // Default: faturável
            let observacoesStr = '';
            let recursosHumanosStr = ''; // Analista R&S

            for (let i = 0; i < lines.length; i++) {
                const cleanLine = lines[i];
                const nextLine = lines[i + 1] || '';
                
                // ===== DADOS BÁSICOS =====
                
                // Nome do consultor
                if (cleanLine.match(/^NOME:/i) && !cleanLine.match(/SOLICITANTE|BANCO|EMERGÊNCIA/i)) {
                    consultantName = cleanLine.replace(/^NOME:/i, '').trim();
                }
                
                // Função/Cargo
                if (cleanLine.match(/^FUNÇÃO:/i)) {
                    role = cleanLine.replace(/^FUNÇÃO:/i, '').trim();
                    // Remove indicadores SR/PL/JR se houver
                    role = role.replace(/\s*SR\s*\(\s*X?\s*\)|\s*PL\s*\(\s*X?\s*\)|\s*JR\s*\(\s*X?\s*\)/gi, '').trim();
                }
                
                // Data de Início
                if (cleanLine.match(/^DATA DE INÍCIO/i) || cleanLine.match(/^DATA INÍCIO/i)) {
                    // Pode estar na mesma linha ou na próxima
                    let match = cleanLine.match(/(\d{2}\/\d{2}\/\d{4})/);
                    if (!match && nextLine) {
                        match = nextLine.match(/(\d{2}\/\d{2}\/\d{4})/);
                    }
                    if (match) {
                        startDateStr = match[1];
                    }
                }
                
                // Celular
                if (cleanLine.match(/TELEFONE CELULAR\s*:/i)) {
                    const match = cleanLine.match(/TELEFONE CELULAR\s*:\s*([\d\-]+)/i);
                    if (match) celularStr = match[1];
                }
                
                // CPF
                if (cleanLine.match(/^CPF:/i)) {
                    cpfStr = cleanLine.replace(/^CPF:/i, '').trim();
                }
                
                // Email
                if (cleanLine.match(/^E-?MAIL\s*:/i) && !cleanLine.match(/SOLICITANTE|fastshop/i)) {
                    const match = cleanLine.match(/E-?MAIL\s*:\s*([^\s]+@[^\s]+)/i);
                    if (match) emailStr = match[1];
                }
                
                // CNPJ
                if (cleanLine.match(/^CNPJ:/i)) {
                    cnpjStr = cleanLine.replace(/^CNPJ:/i, '').trim();
                }
                
                // Empresa
                if (cleanLine.match(/^EMPRESA:/i)) {
                    empresaStr = cleanLine.replace(/^EMPRESA:/i, '').trim();
                }
                
                // Data de Nascimento
                if (cleanLine.match(/^DT NASCIMENTO:/i)) {
                    const match = cleanLine.match(/(\d{2}\/\d{2}\/\d{4})/);
                    if (match) dtAniversarioStr = match[1];
                }
                
                // Tecnologia/Especialidade
                if (cleanLine.match(/^TECNOLOGIA:/i)) {
                    especialidadeStr = cleanLine.replace(/^TECNOLOGIA:/i, '').trim();
                }
                
                // ===== VALORES FINANCEIROS =====
                
                // Faturamento Mensal
                if (cleanLine.match(/FATURAMENTO MENSAL/i)) {
                    let match = cleanLine.match(/R?\$?\s*([\d.,]+)/i);
                    if (!match && nextLine) {
                        match = nextLine.match(/R?\$?\s*([\d.,]+)/);
                    }
                    if (match) {
                        hourlyRateStr = match[1];
                    }
                }
                
                // Valor Pagamento (na seção DADOS PAGAMENTO -> VALOR)
                if (cleanLine.match(/^VALOR$/i) || cleanLine.match(/^VALOR\s*R\$/i)) {
                    let match = cleanLine.match(/R?\$?\s*([\d.,]+)/i);
                    if (!match && nextLine) {
                        match = nextLine.match(/R?\$?\s*([\d.,]+)/);
                    }
                    if (match && !valorPagamentoStr) {
                        valorPagamentoStr = match[1];
                    }
                }
                
                // ===== NOVOS CAMPOS =====
                
                // ✅ FATURÁVEL (checkbox)
                if (cleanLine.match(/FATURÁVEL/i) && !cleanLine.match(/NÃO FATURÁVEL/i)) {
                    // Se encontrou "FATURÁVEL" sem "NÃO", é faturável
                    faturavel = true;
                }
                if (cleanLine.match(/NÃO FATURÁVEL/i)) {
                    // Se a linha contém "NÃO FATURÁVEL" e há indicação de marcação
                    // Precisamos verificar o contexto - se "FATURÁVEL" está marcado ou "NÃO FATURÁVEL"
                    // No PDF, se "✓ FATURÁVEL" aparece, é faturável
                }
                
                // ✅ FORMA DE CONTRATAÇÃO (PJ, CLT, etc.)
                if (cleanLine.match(/FORMA DE CONTRATAÇÃO/i)) {
                    // Pode estar na mesma linha ou na coluna NOVO
                    if (cleanLine.includes('PJ')) {
                        modalidadeContratoStr = 'PJ';
                    } else if (cleanLine.includes('CLT')) {
                        modalidadeContratoStr = 'CLT';
                    } else if (nextLine) {
                        if (nextLine.includes('PJ')) modalidadeContratoStr = 'PJ';
                        else if (nextLine.includes('CLT')) modalidadeContratoStr = 'CLT';
                        else if (nextLine.match(/Temporário/i)) modalidadeContratoStr = 'Temporário';
                    }
                }
                
                // ✅ INCLUSÃO REF.SUBSTITUIÇÃO (checkbox para substituição)
                if (cleanLine.match(/INCLUSÃO REF\.?\s*SUBSTITUIÇÃO/i)) {
                    // Se esta linha aparece marcada, é substituição
                    substituicao = true;
                }
                
                // ✅ NOME DO PROFISSIONAL SUBSTITUÍDO
                if (cleanLine.match(/NOME DO PROFISSIONAL SUBSTITUÍDO/i)) {
                    let valor = cleanLine.replace(/NOME DO PROFISSIONAL SUBSTITUÍDO\s*:?/i, '').trim();
                    if (valor && valor !== 'XXX' && valor !== 'xxx') {
                        nomeSubstituidoStr = valor;
                        substituicao = true; // Se tem nome, é substituição
                    }
                }
                
                // ✅ OBSERVAÇÕES
                if (cleanLine.match(/^OBSERVAÇÕES\s*:/i)) {
                    // Captura o texto das observações
                    let obs = cleanLine.replace(/^OBSERVAÇÕES\s*:/i, '').trim();
                    // Pode continuar nas próximas linhas até encontrar outro campo
                    let j = i + 1;
                    while (j < lines.length && !lines[j].match(/^(NOTEBOOK|SMARTPHONE|DATA EMISSÃO|RECURSOS HUMANOS)/i)) {
                        obs += ' ' + lines[j];
                        j++;
                    }
                    observacoesStr = obs.trim();
                    
                    // Verifica se nas observações menciona substituição
                    if (observacoesStr.match(/substitui|substituição|substituindo/i)) {
                        substituicao = true;
                        // Tenta extrair nome do substituído das observações
                        const subMatch = observacoesStr.match(/substitui(?:ção|ndo)?\s+(?:de\s+)?(?:o\s+|a\s+)?([A-Za-zÀ-ÿ\s]+?)(?:\.|,|$)/i);
                        if (subMatch && !nomeSubstituidoStr) {
                            nomeSubstituidoStr = subMatch[1].trim();
                        }
                    }
                }
                
                // ✅ RECURSOS HUMANOS (Analista R&S)
                if (cleanLine.match(/RECURSOS HUMANOS/i)) {
                    // No PDF, aparece na linha de DATA EMISSÃO como coluna
                    // Formato: DATA EMISSÃO | RECURSOS HUMANOS | GERENTE COMERCIAL | DIRETORIA | GESTÃO DE PESSOAS
                    // Valores: 24/10/2025 | LUIZA LONGO | MESSIAS OLIVEIRA | MESSIAS OLIVEIRA | PRISCILA DO ESPÍRITO SANTO
                    
                    // Busca a próxima linha que contém a data (valores)
                    if (i + 1 < lines.length) {
                        // Procura a linha com a data de emissão
                        for (let k = i + 1; k < Math.min(i + 5, lines.length); k++) {
                            if (lines[k].match(/\d{2}\/\d{2}\/\d{4}/)) {
                                // Linha de valores encontrada
                                // Os valores estão separados por espaços/tabs
                                // Precisamos pegar o segundo valor (após a data)
                                const valuesLine = lines[k];
                                // Remove a data e pega o próximo nome
                                const afterDate = valuesLine.replace(/\d{2}\/\d{2}\/\d{4}/, '').trim();
                                // O primeiro nome após a data é o RECURSOS HUMANOS
                                const nameParts = afterDate.split(/\s{2,}|\t/);
                                if (nameParts[0]) {
                                    recursosHumanosStr = nameParts[0].trim();
                                }
                                break;
                            }
                        }
                    }
                }
            }
            
            // Fallback for Name
            if (!consultantName) {
                const match = text.match(/NOME:\s*(?!SOLICITANTE|BANCO)(.*)/i);
                if (match) consultantName = match[1].trim();
            }
            
            // Fallback para email
            if (!emailStr) {
                const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                if (emailMatch && !emailMatch[0].includes('fastshop')) {
                    emailStr = emailMatch[0];
                }
            }
            
            // Fallback para RECURSOS HUMANOS - busca específica
            if (!recursosHumanosStr) {
                // Tenta encontrar no padrão específico da ficha
                const rhMatch = text.match(/RECURSOS HUMANOS[\s\S]*?(\d{2}\/\d{2}\/\d{4})\s+([A-Z][A-Za-zÀ-ÿ\s]+?)\s+([A-Z][A-Za-zÀ-ÿ\s]+?)\s+/);
                if (rhMatch && rhMatch[2]) {
                    recursosHumanosStr = rhMatch[2].trim();
                }
            }
            
            // Fallback para modalidade - se tem CNPJ, é PJ
            if (!modalidadeContratoStr) {
                modalidadeContratoStr = cnpjStr ? 'PJ' : 'PJ'; // Default PJ
            }

            // Parse Values
            // 1. Date (dd/mm/yyyy -> yyyy-mm-dd)
            let startDate = new Date().toISOString().split('T')[0];
            if (startDateStr) {
                const parts = startDateStr.split('/');
                if (parts.length === 3) {
                    startDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                }
            }
            
            // Parse Data de Aniversário
            let dtAniversario: string | null = null;
            if (dtAniversarioStr) {
                const parts = dtAniversarioStr.split('/');
                if (parts.length === 3) {
                    dtAniversario = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                }
            }

            // 2. Parse Valor Faturamento
            let billingValue = 0;
            if (hourlyRateStr) {
                const normalizedString = hourlyRateStr.replace(/\./g, '').replace(',', '.');
                const normalizedValue = parseFloat(normalizedString);
                if (!isNaN(normalizedValue)) {
                    billingValue = normalizedValue;
                }
            }
            
            // 3. Parse Valor Pagamento
            let valorPagamento = 0;
            if (valorPagamentoStr) {
                const normalizedString = valorPagamentoStr.replace(/\./g, '').replace(',', '.');
                const normalizedValue = parseFloat(normalizedString);
                if (!isNaN(normalizedValue)) {
                    valorPagamento = normalizedValue;
                }
            }

            // Parse modalidade de contrato
            let modalidadeContrato: ModalidadeContrato = 'PJ';
            if (modalidadeContratoStr) {
                const normalized = modalidadeContratoStr.toLowerCase();
                if (normalized.includes('clt')) modalidadeContrato = 'CLT';
                else if (normalized.includes('temp')) modalidadeContrato = 'Temporário';
                else if (normalized.includes('pj')) modalidadeContrato = 'PJ';
                else modalidadeContrato = 'Outros';
            }

            // --- 2. MATCH IDS ---
            
            if (!clientName) throw new Error("Campo 'CLIENTE:' não encontrado ou vazio no PDF.");
            if (!consultantName) throw new Error("Campo 'NOME:' (Consultor) não encontrado no PDF.");

            const client = clients.find(c => normalize(c.razao_social_cliente) === normalize(clientName));
            if (!client) throw new Error(`Cliente "${clientName}" não encontrado na base de dados.`);

            // Manager Match
            let targetManagerId = 0;
            const cleanManagerName = managerName.replace(/_/g, '').trim();

            const manager = managers.find(m => m.id_cliente === client.id && normalize(m.nome_gestor_cliente) === normalize(cleanManagerName));
            
            if (manager) {
                targetManagerId = manager.id;
            } else {
                const firstPart = cleanManagerName.split(' ')[0];
                const looseMgr = managers.find(m => m.id_cliente === client.id && normalize(m.nome_gestor_cliente).includes(normalize(firstPart)));
                
                if (looseMgr) {
                    targetManagerId = looseMgr.id;
                    console.warn(`⚠️ Gestor encontrado por busca aproximada: "${looseMgr.nome_gestor_cliente}" para "${cleanManagerName}"`);
                } else {
                    const clientManagers = managers.filter(m => m.id_cliente === client.id && m.ativo);
                    if (clientManagers.length > 0) {
                        targetManagerId = clientManagers[0].id;
                        console.warn(`⚠️ Gestor não encontrado. Usando primeiro gestor ativo do cliente: "${clientManagers[0].nome_gestor_cliente}"`);
                    } else {
                        throw new Error(`Nenhum gestor ativo encontrado para o cliente "${clientName}".`);
                    }
                }
            }

            // Coordinator Match
            let targetCoordId: number | null = null;
            if (coordName && targetManagerId) {
                const cleanCoordName = coordName.replace(/_/g, '').trim();
                const coord = coordinators.find(c => c.id_gestor_cliente === targetManagerId && normalize(c.nome_coordenador_cliente) === normalize(cleanCoordName));
                if (coord) {
                    targetCoordId = coord.id;
                } else {
                    const firstPartCoord = cleanCoordName.split(' ')[0];
                    const looseCoord = coordinators.find(c => c.id_gestor_cliente === targetManagerId && normalize(c.nome_coordenador_cliente).includes(normalize(firstPartCoord)));
                    if (looseCoord) {
                        targetCoordId = looseCoord.id;
                        console.warn(`⚠️ Coordenador encontrado por busca aproximada: "${looseCoord.nome_coordenador_cliente}" para "${cleanCoordName}"`);
                    }
                }
            }
            
            // ✅ NOVO: Buscar Analista R&S por nome (RECURSOS HUMANOS)
            let analistaRsId: number | null = client.id_gestor_rs || null;
            if (recursosHumanosStr && users && users.length > 0) {
                const analistaUser = findUserByName(recursosHumanosStr);
                if (analistaUser) {
                    analistaRsId = analistaUser.id;
                    console.log(`✅ Analista R&S encontrado: "${analistaUser.nome_usuario}" (ID: ${analistaUser.id})`);
                } else {
                    console.warn(`⚠️ Analista R&S "${recursosHumanosStr}" não encontrado. Usando padrão do cliente.`);
                }
            }
            
            // Calcular ano_vigencia baseado na data de inclusão
            const startDateObj = new Date(startDate);
            const anoVigencia = startDateObj.getFullYear();

            // --- 3. CONSTRUCT DATA ---
            const newConsultantData = {
                // Campos obrigatórios
                ano_vigencia: anoVigencia,
                nome_consultores: consultantName,
                cargo_consultores: role || 'Consultor',
                data_inclusao_consultores: startDate,
                status: 'Ativo' as const,
                ativo_consultor: true,
                
                // Dados de contato
                celular: celularStr || '',
                email_consultor: emailStr || '',
                cpf: cpfStr || '',
                
                // Dados PJ
                cnpj_consultor: cnpjStr || null,
                empresa_consultor: empresaStr || null,
                
                // Dados adicionais
                dt_aniversario: dtAniversario,
                especialidade: especialidadeStr || null,
                
                // Relacionamentos
                gestor_imediato_id: targetManagerId,
                coordenador_id: targetCoordId,
                
                // Valores financeiros
                valor_faturamento: billingValue || 0,
                valor_pagamento: valorPagamento || 0,
                
                // Herdar do Cliente (com override se encontrou no PDF)
                analista_rs_id: analistaRsId,
                id_gestao_de_pessoas: client.id_gestao_de_pessoas || null,
                
                // ✅ CORREÇÃO: Adicionar cliente_id
                cliente_id: client.id,
                
                // ✅ NOVOS CAMPOS
                modalidade_contrato: modalidadeContrato,
                substituicao: substituicao,
                nome_substituido: nomeSubstituidoStr || null,
                faturavel: faturavel,
                observacoes: observacoesStr || null,
            };

            // Log para debug
            console.log('📋 Dados extraídos do PDF:', {
                cliente: clientName,
                clienteId: client.id,
                consultor: consultantName,
                cargo: role,
                gestor: managerName,
                coordenador: coordName,
                email: emailStr,
                celular: celularStr,
                cpf: cpfStr,
                cnpj: cnpjStr,
                empresa: empresaStr,
                dataInicio: startDate,
                dtAniversario: dtAniversarioStr,
                especialidade: especialidadeStr,
                valorFaturamento: billingValue,
                valorPagamento: valorPagamento,
                anoVigencia: anoVigencia,
                // Novos campos
                modalidadeContrato: modalidadeContrato,
                substituicao: substituicao,
                nomeSubstituido: nomeSubstituidoStr,
                faturavel: faturavel,
                recursosHumanos: recursosHumanosStr,
                analistaRsId: analistaRsId,
                observacoes: observacoesStr
            });
            
            console.log('💾 Dados para inserção:', newConsultantData);

            onImport(newConsultantData);
            setMessage({ text: `Ficha de Inclusão "${consultantName}" processada com sucesso!`, type: 'success' });

        } catch (error) {
            console.error(error);
            setMessage({ text: error instanceof Error ? error.message : 'Erro ao processar arquivo.', type: 'error' });
        } finally {
            setIsLoading(false);
            e.target.value = '';
        }
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-md mb-8 border-t-4 border-indigo-600">
            <h2 className="text-xl font-bold text-[#4D5253] mb-4">
                📄 Importar Ficha de Inclusão (PDF)
            </h2>

            <p className="text-sm text-gray-600 mb-4">
                Importe automaticamente os dados de uma Ficha de Inclusão em PDF.
            </p>

            <div className="flex items-center gap-4">
                <label className={`cursor-pointer bg-indigo-600 text-white px-6 py-2 rounded-md hover:bg-indigo-700 transition-colors duration-300 shadow-sm flex items-center ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <span className="mr-2 text-lg">📁</span>
                    {isLoading ? 'Processando...' : 'Selecionar PDF'}
                    <input 
                        type="file" 
                        className="hidden" 
                        onChange={handleFileUpload} 
                        accept=".pdf" 
                        disabled={isLoading}
                    />
                </label>
            </div>
            
            {message && (
                <div className={`mt-4 p-3 rounded-md ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {message.type === 'success' ? '✅' : '❌'} {message.text}
                </div>
            )}
            
            <div className="mt-4 text-xs text-gray-500">
                <p className="font-medium mb-1">Campos extraídos automaticamente:</p>
                <p>CLIENTE, NOME SOLICITANTE, NOME (Consultor), FUNÇÃO, DATA DE INÍCIO, CELULAR, CPF, E-MAIL, CNPJ, EMPRESA, FATURAMENTO MENSAL, VALOR (Pagamento)</p>
                <p className="text-indigo-600 font-semibold mt-1">
                    + FORMA DE CONTRATAÇÃO, FATURÁVEL, SUBSTITUIÇÃO, NOME SUBSTITUÍDO, RECURSOS HUMANOS (Analista R&S), OBSERVAÇÕES
                </p>
            </div>
        </div>
    );
};

export default InclusionImport;
