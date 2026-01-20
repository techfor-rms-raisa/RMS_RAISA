// src/components/InclusionImport.tsx
// ✅ v2.0 - Correção na extração de EMAIL e NOME do PDF
// Problema corrigido: Email do HEADER e Nome da seção EMERGÊNCIA sendo capturados incorretamente

import React, { useState } from 'react';
import { Client, User, UsuarioCliente, CoordenadorCliente } from '@/types';

// Lazy load para evitar SSR issues
let pdfjs: any = null;
const getPdfJs = () => {
    if (!pdfjs) {
        pdfjs = require('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
    }
    return pdfjs;
};

// Suppress console warnings from pdf.js
if (typeof window !== 'undefined') {
    const originalWarn = console.warn;
    console.warn = (...args) => {
        if (args[0]?.includes?.('pdf.js')) return;
        originalWarn.apply(console, args);
    };
}

// Try-catch for worker setup
try {
    getPdfJs();
} catch (e) {
    console.log("PDF.js worker setup deferred. PDF parsing might fail.");
}

// ✅ Tipos de modalidade de contrato
type ModalidadeContrato = 'PJ' | 'CLT' | 'Temporário' | 'Outros';

interface InclusionImportProps {
    clients: Client[];
    managers: UsuarioCliente[];
    coordinators: CoordenadorCliente[];
    users: User[]; // ✅ Para buscar analista_rs_id por nome
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

            // ✅ CORREÇÃO v2.0: Flags para controlar seções do PDF
            let inDadosProfissional = false;
            let inInformacoesEmergencia = false;
            let inDadosPagamento = false;

            for (let i = 0; i < lines.length; i++) {
                const cleanLine = lines[i];
                const nextLine = lines[i + 1] || '';
                
                // ✅ CORREÇÃO v2.0: Detectar início das seções
                if (cleanLine.match(/DADOS DO PROFISSIONAL/i)) {
                    inDadosProfissional = true;
                    inInformacoesEmergencia = false;
                    continue;
                }
                if (cleanLine.match(/INFORMAÇÕES DE EMERGÊNCIA/i)) {
                    inDadosProfissional = false;
                    inInformacoesEmergencia = true;
                    continue;
                }
                if (cleanLine.match(/DADOS PAGAMENTO/i)) {
                    inDadosProfissional = false;
                    inInformacoesEmergencia = false;
                    inDadosPagamento = true;
                    continue;
                }
                if (cleanLine.match(/DADOS FATURAMENTO/i)) {
                    inDadosPagamento = false;
                    continue;
                }
                
                // ===== DADOS BÁSICOS - SEÇÃO DADOS DO PROFISSIONAL =====
                
                // ✅ CORREÇÃO v2.0: Nome do consultor - APENAS da seção DADOS DO PROFISSIONAL
                // Ignorar: NOME SOLICITANTE, NOME DO BANCO, INFORMAÇÕES DE EMERGÊNCIA
                if (cleanLine.match(/^NOME:/i) && 
                    !cleanLine.match(/SOLICITANTE|BANCO|EMERGÊNCIA|PROFISSIONAL SUBSTITUÍDO/i) &&
                    !inInformacoesEmergencia) {
                    const extractedName = cleanLine.replace(/^NOME:/i, '').trim();
                    // Só aceita se não estiver na seção de emergência e não for um nome de banco
                    if (extractedName && extractedName !== 'XXX' && !extractedName.match(/Banco|Inter|Itaú|Bradesco|Santander|Caixa/i)) {
                        consultantName = extractedName;
                        console.log(`✅ Nome extraído (seção profissional): ${consultantName}`);
                    }
                }
                
                // Função/Cargo
                if (cleanLine.match(/^FUNÇÃO:/i)) {
                    role = cleanLine.replace(/^FUNÇÃO:/i, '').trim();
                    // Remove indicadores SR/PL/JR se houver
                    role = role.replace(/\s*SR\s*\(\s*X?\s*\)|\s*PL\s*\(\s*X?\s*\)|\s*JR\s*\(\s*X?\s*\)/gi, '').trim();
                }
                
                // Data de Início - ✅ CORREÇÃO v2.1: Restrito à seção DADOS PAGAMENTO
                if ((cleanLine.match(/^DATA DE INÍCIO/i) || cleanLine.match(/^DATA INÍCIO/i)) && inDadosPagamento) {
                    // Pode estar na mesma linha ou na próxima
                    let match = cleanLine.match(/(\d{2}\/\d{2}\/\d{4})/);
                    if (!match && nextLine) {
                        match = nextLine.match(/(\d{2}\/\d{2}\/\d{4})/);
                    }
                    if (match) {
                        startDateStr = match[1];
                        console.log(`✅ Data de Início extraída (seção DADOS PAGAMENTO): ${startDateStr}`);
                    }
                }
                
                // Celular
                if (cleanLine.match(/TELEFONE CELULAR\s*:/i)) {
                    const match = cleanLine.match(/TELEFONE CELULAR\s*:\s*([\d\s\-]+)/i);
                    if (match) celularStr = match[1].replace(/\s/g, '');
                }
                
                // CPF
                if (cleanLine.match(/^CPF:/i) || cleanLine.match(/^CPF\s*:/i)) {
                    cpfStr = cleanLine.replace(/^CPF\s*:/i, '').trim();
                }
                
                // ✅ CORREÇÃO v2.0: Email do consultor - APENAS da seção DADOS DO PROFISSIONAL
                // Ignorar emails do HEADER (SOLICITANTE, fastshop, icesp.org.br etc)
                if ((cleanLine.match(/^E-?MAIL\s*:/i) || cleanLine.match(/^EMAIL\s*:/i)) && 
                    !cleanLine.match(/SOLICITANTE/i) &&
                    !inInformacoesEmergencia) {
                    const match = cleanLine.match(/E-?MAIL\s*:\s*([^\s]+@[^\s]+)/i);
                    if (match) {
                        const extractedEmail = match[1].toLowerCase();
                        // ✅ FILTRO: Ignorar emails corporativos do cliente (domínios como @icesp.org.br, @fastshop.com.br)
                        // Aceitar apenas emails pessoais (@gmail, @hotmail, @outlook, @yahoo, etc)
                        const isClientEmail = extractedEmail.match(/@(icesp|fastshop|techfor|cliente|empresa)/i);
                        const isPersonalEmail = extractedEmail.match(/@(gmail|hotmail|outlook|yahoo|live|uol|bol|terra|ig|globo|icloud)/i);
                        
                        if (!isClientEmail || isPersonalEmail) {
                            // Só atualiza se ainda não temos um email OU se este parece ser mais pessoal
                            if (!emailStr || isPersonalEmail) {
                                emailStr = extractedEmail;
                                console.log(`✅ Email extraído (seção profissional): ${emailStr}`);
                            }
                        } else {
                            console.log(`⚠️ Email ignorado (parece ser do cliente): ${extractedEmail}`);
                        }
                    }
                }
                
                // CNPJ
                if (cleanLine.match(/^CNPJ:/i)) {
                    cnpjStr = cleanLine.replace(/^CNPJ:/i, '').trim();
                    if (cnpjStr === 'XXX') cnpjStr = '';
                }
                
                // Empresa
                if (cleanLine.match(/^EMPRESA:/i) && !cleanLine.match(/ENDEREÇO EMPRESA/i)) {
                    empresaStr = cleanLine.replace(/^EMPRESA:/i, '').trim();
                    if (empresaStr === 'XXX') empresaStr = '';
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
                
                // Valor Pagamento (na seção DADOS PAGAMENTO -> VALOR) - ✅ v2.1: Com log
                if ((cleanLine.match(/^VALOR$/i) || cleanLine.match(/^VALOR\s*R\$/i)) && inDadosPagamento) {
                    let match = cleanLine.match(/R?\$?\s*([\d.,]+)/i);
                    if (!match && nextLine) {
                        match = nextLine.match(/R?\$?\s*([\d.,]+)/);
                    }
                    if (match && !valorPagamentoStr) {
                        valorPagamentoStr = match[1];
                        console.log(`✅ Valor Pagamento extraído (seção DADOS PAGAMENTO): ${valorPagamentoStr}`);
                    }
                }
                
                // ===== NOVOS CAMPOS =====
                
                // ✅ FATURÁVEL (checkbox)
                if (cleanLine.match(/FATURÁVEL/i) && !cleanLine.match(/NÃO FATURÁVEL/i)) {
                    faturavel = true;
                }
                if (cleanLine.match(/NÃO FATURÁVEL/i)) {
                    // Verificar se está marcado
                    // No PDF, geralmente aparece como checkbox - vamos assumir que se NÃO FATURÁVEL aparece destacado, é não faturável
                }
                
                // ✅ FORMA DE CONTRATAÇÃO (PJ, CLT, etc.) - CORREÇÃO v2.1: Restrito à seção DADOS PAGAMENTO
                if (cleanLine.match(/FORMA DE CONTRATAÇÃO/i) && inDadosPagamento) {
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
                    if (modalidadeContratoStr) {
                        console.log(`✅ Modalidade de Contrato extraída (seção DADOS PAGAMENTO): ${modalidadeContratoStr}`);
                    }
                }
                
                // ✅ INCLUSÃO REF.SUBSTITUIÇÃO (checkbox para substituição)
                if (cleanLine.match(/INCLUSÃO REF\.?\s*SUBSTITUIÇÃO/i)) {
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
            
            // ✅ CORREÇÃO v2.0: Fallback para Nome - busca mais específica
            if (!consultantName) {
                // Buscar NOME: que NÃO seja seguido de SOLICITANTE, BANCO, ou na seção de emergência
                const allLines = text.split('\n');
                for (const line of allLines) {
                    if (line.match(/^NOME:\s*[A-Za-zÀ-ÿ]/i) && 
                        !line.match(/SOLICITANTE|BANCO|EMERGÊNCIA/i)) {
                        const extracted = line.replace(/^NOME:/i, '').trim();
                        if (extracted && extracted !== 'XXX' && extracted.length > 3) {
                            // Verificar se não é nome de contato de emergência (geralmente tem grau de parentesco próximo)
                            const nextLineIdx = allLines.indexOf(line) + 1;
                            if (nextLineIdx < allLines.length) {
                                const nextL = allLines[nextLineIdx];
                                if (nextL.match(/GRAU PARENTESCO|MÃE|PAI|ESPOSA|MARIDO|IRMÃO|IRMÃ/i)) {
                                    console.log(`⚠️ Nome ignorado (parece ser contato de emergência): ${extracted}`);
                                    continue;
                                }
                            }
                            consultantName = extracted;
                            console.log(`✅ Nome extraído (fallback): ${consultantName}`);
                            break;
                        }
                    }
                }
            }
            
            // ✅ CORREÇÃO v2.0: Fallback para email - busca mais específica
            if (!emailStr) {
                // Buscar email que pareça ser pessoal (gmail, hotmail, etc)
                const emailMatches = text.match(/[a-zA-Z0-9._%+-]+@(gmail|hotmail|outlook|yahoo|live|uol|bol|terra|ig|globo|icloud)\.[a-zA-Z]{2,}/gi);
                if (emailMatches && emailMatches.length > 0) {
                    emailStr = emailMatches[0].toLowerCase();
                    console.log(`✅ Email extraído (fallback pessoal): ${emailStr}`);
                }
            }
            
            // Fallback para RECURSOS HUMANOS - busca específica
            if (!recursosHumanosStr) {
                const rhMatch = text.match(/RECURSOS HUMANOS[\s\S]*?(\d{2}\/\d{2}\/\d{4})\s+([A-Z][A-Za-zÀ-ÿ\s]+?)\s+([A-Z][A-Za-zÀ-ÿ\s]+?)\s+([A-Z][A-Za-zÀ-ÿ\s]+?)\s+([A-Z][A-Za-zÀ-ÿ\s]+)/);
                if (rhMatch) {
                    recursosHumanosStr = rhMatch[2].trim();
                }
            }

            // --- 2. VALIDATE & LOOKUP ---
            
            console.log('🔍 Dados extraídos para validação:', {
                cliente: clientName,
                consultor: consultantName,
                email: emailStr,
                cpf: cpfStr,
                celular: celularStr,
                cargo: role,
                recursosHumanos: recursosHumanosStr
            });

            if (!clientName || !consultantName) {
                throw new Error(`Dados obrigatórios não encontrados. Cliente: "${clientName}", Consultor: "${consultantName}"`);
            }

            // Lookup Client
            const client = clients.find(c => normalize(c.razao_social_cliente) === normalize(clientName));
            if (!client) {
                throw new Error(`Cliente "${clientName}" não encontrado no sistema.`);
            }

            // Lookup Manager
            const manager = managers.find(m => 
                m.id_cliente === client.id && 
                normalize(m.nome_gestor_cliente).includes(normalize(managerName.split(' ')[0]))
            );
            const targetManagerId = manager?.id || managers.find(m => m.id_cliente === client.id)?.id;
            if (!targetManagerId) {
                throw new Error(`Nenhum gestor encontrado para o cliente "${clientName}".`);
            }

            // Lookup Coordinator (optional)
            const coordinator = coordinators.find(c => 
                c.id_gestor_cliente === targetManagerId && 
                normalize(c.nome_coordenador_cliente).includes(normalize(coordName.split(' ')[0]))
            );
            const targetCoordId = coordinator?.id || null;

            // Parse values
            const parseDate = (dateStr: string): string => {
                if (!dateStr) return new Date().toISOString().split('T')[0];
                const parts = dateStr.split('/');
                if (parts.length === 3) {
                    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                }
                return new Date().toISOString().split('T')[0];
            };

            const parseMoneyBR = (value: string): number | null => {
                if (!value) return null;
                const cleaned = value.replace(/[^\d,.-]/g, '').replace(',', '.');
                const num = parseFloat(cleaned);
                return isNaN(num) ? null : num;
            };

            const startDate = parseDate(startDateStr);
            const billingValue = parseMoneyBR(hourlyRateStr);
            const valorPagamento = parseMoneyBR(valorPagamentoStr);
            const dtAniversario = dtAniversarioStr ? parseDate(dtAniversarioStr) : null;

            // Determinar modalidade de contrato
            let modalidadeContrato: ModalidadeContrato = 'PJ'; // Default
            if (modalidadeContratoStr) {
                if (modalidadeContratoStr.toUpperCase() === 'CLT') modalidadeContrato = 'CLT';
                else if (modalidadeContratoStr.toUpperCase() === 'PJ') modalidadeContrato = 'PJ';
                else if (modalidadeContratoStr.match(/temporário/i)) modalidadeContrato = 'Temporário';
            }

            // ✅ CORREÇÃO: Buscar analista_rs_id pelo nome do RECURSOS HUMANOS
            let analistaRsId: number | null = null;
            if (recursosHumanosStr) {
                const analistaUser = findUserByName(recursosHumanosStr);
                if (analistaUser) {
                    analistaRsId = analistaUser.id;
                    console.log(`✅ Analista R&S encontrado: ${analistaUser.nome_usuario} (ID: ${analistaUser.id})`);
                } else {
                    console.log(`⚠️ Analista R&S "${recursosHumanosStr}" não encontrado. Usando padrão do cliente.`);
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
