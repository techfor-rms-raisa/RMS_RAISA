/**
 * InclusionImport.tsx - Importador de Ficha de Inclusão
 * 
 * VERSÃO: Fix v1.1 - 22/01/2026
 * 
 * CORREÇÕES:
 * - ✅ v1.1: ano_vigencia agora usa ANO ATUAL (new Date().getFullYear()) em vez do ano da data do PDF
 *   → Resolve erro 409 "duplicate key violates unique constraint consultants_cpf_ano_unique"
 *   → Permite reinserir consultores que existiam em anos anteriores
 * - Melhorada extração de VALOR (valor_pagamento) para formato brasileiro (R$ X.XXX,XX)
 * - Melhorada extração de OBSERVAÇÕES com múltiplos fallbacks
 * - Adicionados logs detalhados para debug
 */

import React, { useState } from 'react';
import { Client, User, UsuarioCliente, CoordenadorCliente } from '@/types';
import * as pdfjsLib from 'pdfjs-dist';

// Configurar worker do PDF.js
const getPdfJs = () => {
    // @ts-ignore
    return pdfjsLib.default || pdfjsLib;
};

const pdfjs = getPdfJs();
if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// Suprimir warnings do pdf.js
if (typeof window !== 'undefined') {
    const originalWarn = console.warn;
    console.warn = (...args: any[]) => {
        if (args[0]?.toString().includes('pdf.js')) return;
        originalWarn.apply(console, args);
    };
}

type ModalidadeContrato = 'PJ' | 'CLT' | 'Temporário' | 'Outros';

interface InclusionImportProps {
    clients: Client[];
    managers: UsuarioCliente[];
    coordinators: CoordenadorCliente[];
    users: User[];
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
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument(arrayBuffer);
        const pdf = await loadingTask.promise;
        
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join('\n'); 
            fullText += pageText + '\n';
        }
        return fullText;
    };

    const findUserByName = (name: string): User | null => {
        if (!name || name === 'XXX' || name === 'xxx') return null;
        
        const normalizedName = normalize(name);
        console.log(`🔍 Buscando usuário: "${name}" (normalizado: "${normalizedName}")`);
        
        let user = users.find(u => normalize(u.nome_usuario) === normalizedName);
        if (user) {
            console.log(`✅ Usuário encontrado (exato): ${user.nome_usuario} (ID: ${user.id})`);
            return user;
        }
        
        const firstName = normalizedName.split(' ')[0];
        user = users.find(u => normalize(u.nome_usuario).startsWith(firstName));
        if (user) {
            console.log(`✅ Usuário encontrado (primeiro nome): ${user.nome_usuario} (ID: ${user.id})`);
            return user;
        }
        
        user = users.find(u => normalize(u.nome_usuario).includes(normalizedName) || normalizedName.includes(normalize(u.nome_usuario)));
        if (user) {
            console.log(`✅ Usuário encontrado (contém): ${user.nome_usuario} (ID: ${user.id})`);
            return user;
        }
        
        console.log(`❌ Usuário não encontrado para: "${name}"`);
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
            
            console.log('📄 Texto extraído do PDF (primeiras 2000 chars):', text.substring(0, 2000));
            
            // ===== PARSE FIELDS =====
            
            const findValue = (regex: RegExp, content: string) => {
                const match = content.match(regex);
                return match ? match[1].trim() : '';
            };

            const clientName = findValue(/CLIENTE:\s*(.*)/i, text);
            const managerName = findValue(/NOME SOLICITANTE:\s*(.*)/i, text);
            const coordName = findValue(/RESPONSÁVEL APROVADOR DE HORAS:\s*(.*)/i, text);
            
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
            let substituicao = false;
            let nomeSubstituidoStr = '';
            let modalidadeContratoStr = '';
            let faturavel = true;
            let observacoesStr = '';
            let recursosHumanosStr = '';

            // Flags de seção
            let inDadosProfissional = false;
            let inInformacoesEmergencia = false;
            let inDadosPagamento = false;

            console.log('📋 Total de linhas:', lines.length);

            for (let i = 0; i < lines.length; i++) {
                const cleanLine = lines[i];
                const nextLine = lines[i + 1] || '';
                
                // Detectar seções
                if (cleanLine.includes('DADOS DO PROFISSIONAL')) {
                    inDadosProfissional = true;
                    inInformacoesEmergencia = false;
                    inDadosPagamento = false;
                }
                if (cleanLine.includes('INFORMAÇÕES DE EMERGÊNCIA')) {
                    inDadosProfissional = false;
                    inInformacoesEmergencia = true;
                    inDadosPagamento = false;
                }
                if (cleanLine.includes('DADOS PAGAMENTO')) {
                    inDadosProfissional = false;
                    inInformacoesEmergencia = false;
                    inDadosPagamento = true;
                    console.log(`📍 Seção DADOS PAGAMENTO detectada na linha ${i}`);
                }
                
                // ===== NOME DO PROFISSIONAL =====
                // Capturar NOME: mas ignorar "NOME DO BANCO", "NOME SOLICITANTE", etc.
                if (cleanLine.startsWith('NOME:') && 
                    !cleanLine.includes('BANCO') && 
                    !cleanLine.includes('SOLICITANTE') &&
                    !cleanLine.includes('SUBSTITUÍDO')) {
                    const nomePotencial = cleanLine.replace('NOME:', '').trim();
                    // Ignorar nomes que parecem ser de outras seções
                    if (nomePotencial && 
                        nomePotencial.length > 3 && 
                        !nomePotencial.includes('Elaine') && // Nome de emergência
                        !nomePotencial.match(/^[A-Z]{2,}$/)) { // Não é sigla
                        consultantName = nomePotencial;
                        console.log(`✅ Nome do consultor extraído: ${consultantName}`);
                    }
                }
                
                // ===== FUNÇÃO =====
                if (cleanLine.match(/^FUNÇÃO:/i)) {
                    let funcaoText = cleanLine.replace(/FUNÇÃO:/i, '').trim();
                    if (funcaoText.includes('SR')) funcaoText = funcaoText.replace(/\(\s*\)/g, '').replace(/SR\s*\(\s*X?\s*\)/i, 'SR').trim();
                    if (funcaoText.includes('PL')) funcaoText = funcaoText.replace(/\(\s*\)/g, '').replace(/PL\s*\(\s*X?\s*\)/i, 'PL').trim();
                    if (funcaoText.includes('JR')) funcaoText = funcaoText.replace(/\(\s*\)/g, '').replace(/JR\s*\(\s*X?\s*\)/i, 'JR').trim();
                    role = funcaoText.replace(/\s+/g, ' ').replace(/\(\s*\)/g, '').trim();
                }
                
                // ===== DATA INÍCIO =====
                if (cleanLine.match(/DATA DE INÍCIO/i) && !startDateStr) {
                    const dateMatch = cleanLine.match(/(\d{2}\/\d{2}\/\d{4})/);
                    if (dateMatch) {
                        startDateStr = dateMatch[1];
                        console.log(`✅ Data de Início extraída (mesma linha): ${startDateStr}`);
                    } else {
                        // Procurar nas próximas linhas
                        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
                            const testLine = lines[j].trim();
                            if (testLine.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
                                startDateStr = testLine;
                                console.log(`✅ Data de Início extraída (linha ${j}): ${startDateStr}`);
                                break;
                            }
                        }
                    }
                }
                
                // ===== 🔧 FIX v1.0: VALOR (valor_pagamento) =====
                if (cleanLine === 'VALOR' && inDadosPagamento) {
                    console.log(`🔍 Encontrado label VALOR na seção DADOS PAGAMENTO (linha ${i})`);
                    // Procurar o valor nas próximas linhas
                    for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
                        const testLine = lines[j].trim();
                        // 🔧 FIX: Regex melhorado para formato brasileiro (R$ X.XXX,XX)
                        if (testLine.match(/^R?\$?\s*[\d.]+,\d{2}$/) || 
                            testLine.match(/^[\d.]+,\d{2}$/) ||
                            testLine.match(/^R\$\s*[\d.,]+$/)) {
                            valorPagamentoStr = testLine.replace(/R\$\s*/, '').trim();
                            console.log(`✅ Valor Pagamento extraído: ${valorPagamentoStr}`);
                            break;
                        }
                    }
                }
                
                // ===== FATURAMENTO MENSAL =====
                if (cleanLine.match(/FATURAMENTO MENSAL/i)) {
                    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
                        const testLine = lines[j].trim();
                        if (testLine.match(/^R?\$?\s*[\d.,]+$/) || testLine.match(/^[\d.]+,\d{2}$/)) {
                            hourlyRateStr = testLine.replace(/R\$\s*/, '');
                            console.log(`✅ Faturamento Mensal extraído: ${hourlyRateStr}`);
                            break;
                        }
                    }
                }
                
                // ===== TELEFONE CELULAR =====
                if (cleanLine.match(/TELEFONE CELULAR/i)) {
                    const phoneMatch = cleanLine.match(/(\d{2}\s*\d{4,5}[-\s]?\d{4})/);
                    if (phoneMatch) {
                        celularStr = phoneMatch[1].replace(/\s/g, '');
                    } else if (nextLine.match(/^\d/)) {
                        celularStr = nextLine.replace(/\s/g, '');
                    }
                }
                
                // ===== CPF =====
                if (cleanLine.match(/^CPF:/i) || cleanLine.match(/CPF:\s*[\d.-]+/i)) {
                    const cpfMatch = cleanLine.match(/(\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2})/);
                    if (cpfMatch) {
                        cpfStr = cpfMatch[1];
                    }
                }
                
                // ===== EMAIL =====
                // IMPORTANTE: Pegar email do PROFISSIONAL, não do solicitante
                if (cleanLine.match(/E-MAIL\s*:/i) && !emailStr) {
                    const emailMatch = cleanLine.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/i);
                    if (emailMatch) {
                        const emailEncontrado = emailMatch[1].toLowerCase();
                        // Ignorar email do solicitante (geralmente @icesp, @cliente, etc.)
                        // O email do profissional geralmente é @gmail, @hotmail, @outlook
                        if (emailEncontrado.includes('@gmail') || 
                            emailEncontrado.includes('@hotmail') || 
                            emailEncontrado.includes('@outlook') ||
                            emailEncontrado.includes('@yahoo') ||
                            emailEncontrado.includes('@live') ||
                            emailEncontrado.includes('@icloud')) {
                            emailStr = emailEncontrado;
                            console.log(`✅ Email do profissional extraído: ${emailStr}`);
                        } else if (!cleanLine.includes('SOLICITANTE') && 
                                   !cleanLine.includes('RESPONSÁVEL') &&
                                   !cleanLine.includes('APROVADOR')) {
                            // Se não é email pessoal, verificar se não é do solicitante
                            emailStr = emailEncontrado;
                            console.log(`✅ Email extraído (corporativo): ${emailStr}`);
                        }
                    }
                }
                
                // ===== DATA NASCIMENTO =====
                if (cleanLine.match(/DT NASCIMENTO/i) || cleanLine.match(/DATA DE NASCIMENTO/i)) {
                    const dateMatch = cleanLine.match(/(\d{2}\/\d{2}\/\d{4})/);
                    if (dateMatch) {
                        dtAniversarioStr = dateMatch[1];
                    }
                }
                
                // ===== TECNOLOGIA (especialidade) =====
                if (cleanLine.match(/^TECNOLOGIA:/i)) {
                    especialidadeStr = cleanLine.replace(/TECNOLOGIA:/i, '').trim();
                    if (!especialidadeStr && nextLine) {
                        especialidadeStr = nextLine;
                    }
                }
                
                // ===== CNPJ =====
                if (cleanLine.match(/^CNPJ:/i)) {
                    const cnpjMatch = cleanLine.match(/(\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2})/);
                    if (cnpjMatch) {
                        cnpjStr = cnpjMatch[1];
                    }
                }
                
                // ===== EMPRESA =====
                if (cleanLine.match(/^EMPRESA:/i) && !cleanLine.includes('ENDEREÇO')) {
                    empresaStr = cleanLine.replace(/EMPRESA:/i, '').trim();
                    if (empresaStr === 'XXX' || empresaStr === 'xxx') empresaStr = '';
                }
                
                // ===== FORMA DE CONTRATAÇÃO =====
                if (cleanLine.match(/FORMA DE CONTRATAÇÃO/i)) {
                    if (cleanLine.includes('PJ')) {
                        modalidadeContratoStr = 'PJ';
                    } else if (cleanLine.includes('CLT')) {
                        modalidadeContratoStr = 'CLT';
                    } else if (nextLine) {
                        if (nextLine === 'PJ' || nextLine.includes('PJ')) modalidadeContratoStr = 'PJ';
                        else if (nextLine === 'CLT' || nextLine.includes('CLT')) modalidadeContratoStr = 'CLT';
                    }
                }
                if (!modalidadeContratoStr && cleanLine === 'CLT') {
                    modalidadeContratoStr = 'CLT';
                    console.log(`✅ Modalidade CLT detectada (linha isolada)`);
                }
                
                // ===== SUBSTITUIÇÃO =====
                if (cleanLine.match(/INCLUSÃO REF\.?\s*SUBSTITUIÇÃO/i) || cleanLine.match(/SUBSTITUIÇÃO/i)) {
                    const hasX = cleanLine.includes('X') || cleanLine.includes('x');
                    if (hasX) {
                        substituicao = true;
                        console.log(`✅ Substituição detectada: ${substituicao}`);
                    }
                }
                
                // ===== NOME DO SUBSTITUÍDO =====
                if (cleanLine.match(/NOME DO PROFISSIONAL SUBSTITUÍDO/i)) {
                    let nomeSubst = cleanLine.replace(/NOME DO PROFISSIONAL SUBSTITUÍDO:?/i, '').trim();
                    if (!nomeSubst && nextLine) {
                        nomeSubst = nextLine;
                    }
                    nomeSubst = nomeSubst.replace(/\(Confidencial\)/gi, '').trim();
                    if (nomeSubst && nomeSubst !== 'XXX') {
                        nomeSubstituidoStr = nomeSubst;
                        substituicao = true;
                        console.log(`✅ Nome substituído: ${nomeSubstituidoStr}`);
                    }
                }
                
                // ===== FATURÁVEL =====
                // No PDF: checkbox FATURÁVEL marcado = true, NÃO FATURÁVEL marcado = false
                if (cleanLine.match(/FATURÁVEL/i)) {
                    if (cleanLine.match(/NÃO\s*FATURÁVEL/i)) {
                        faturavel = false;
                        console.log(`✅ Faturável: false (encontrado NÃO FATURÁVEL)`);
                    } else if (cleanLine.match(/^FATURÁVEL$/i)) {
                        faturavel = true;
                        console.log(`✅ Faturável: true (encontrado FATURÁVEL)`);
                    }
                }
                
                // ===== 🔧 FIX v1.1: OBSERVAÇÕES =====
                // NÃO usar extração por label aqui - usar apenas fallback por padrões
                // porque a estrutura do PDF mistura seções
                
                // ===== RECURSOS HUMANOS =====
                if (cleanLine === 'RECURSOS HUMANOS' && !recursosHumanosStr) {
                    console.log(`🔍 Encontrado header RECURSOS HUMANOS na linha ${i}`);
                    
                    // Estrutura do rodapé do PDF:
                    // HEADERS: DATA EMISSÃO | RECURSOS HUMANOS | GERENTE COMERCIAL | DIRETORIA | GESTÃO DE PESSOAS
                    // VALUES:  12/01/2026   | LARISSA CONCEIÇÃO | MARCOS ROSSI     | ...       | ...
                    
                    // Procurar data de emissão (DD/MM/YYYY) e depois o nome do RH
                    for (let k = i + 1; k < Math.min(i + 20, lines.length); k++) {
                        const testLine = lines[k].trim();
                        
                        // Se encontrou uma data no formato DD/MM/YYYY
                        if (testLine.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
                            console.log(`🔍 Data de emissão encontrada na linha ${k}: ${testLine}`);
                            
                            // O próximo valor após a data é o nome do RECURSOS HUMANOS
                            if (k + 1 < lines.length) {
                                const possibleRH = lines[k + 1].trim();
                                console.log(`🔍 Possível RH na linha ${k + 1}: "${possibleRH}"`);
                                
                                // Validar: deve ser nome (não header, não XXX, não número)
                                if (possibleRH && 
                                    possibleRH.length > 3 &&
                                    possibleRH !== 'XXX' &&
                                    !possibleRH.match(/^\d/) &&
                                    !possibleRH.match(/^(GERENTE|COMERCIAL|DIRETORIA|GESTÃO|DATA|RECURSOS)/i)) {
                                    recursosHumanosStr = possibleRH;
                                    console.log(`✅ Recursos Humanos extraído: ${recursosHumanosStr}`);
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            // ===== 🔧 FIX v1.1: FALLBACKS MELHORADOS =====
            
            // Fallback para NOME DO CONSULTOR
            if (!consultantName) {
                console.log('🔄 Tentando fallback para nome do consultor...');
                
                // Método 1: Buscar "NOME:" seguido de nome próprio (não banco, não solicitante)
                const nomeMatch = text.match(/NOME:\s*([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)+)/);
                if (nomeMatch) {
                    const nomePotencial = nomeMatch[1].trim();
                    // Validar que não é outro tipo de NOME
                    if (nomePotencial.length > 5 && 
                        !nomePotencial.includes('Banco') &&
                        !nomePotencial.includes('Fernando') && // Nome do solicitante
                        !nomePotencial.includes('Elaine')) { // Nome de emergência
                        consultantName = nomePotencial;
                        console.log(`✅ Nome do consultor extraído (fallback): ${consultantName}`);
                    }
                }
                
                // Método 2: Buscar após "DADOS DO PROFISSIONAL"
                if (!consultantName) {
                    const dadosProfMatch = text.match(/DADOS DO PROFISSIONAL[\s\S]*?NOME:\s*([A-Za-zÀ-ÿ\s]+?)(?=DT|LOCAL|EMPRESA|CPF|\n[A-Z]{2,}:)/i);
                    if (dadosProfMatch && dadosProfMatch[1]) {
                        consultantName = dadosProfMatch[1].trim();
                        console.log(`✅ Nome do consultor extraído (seção DADOS): ${consultantName}`);
                    }
                }
            }
            
            // Fallback para EMAIL (priorizar email pessoal do profissional)
            if (!emailStr) {
                const emailMatches = text.match(/[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}/gi);
                if (emailMatches && emailMatches.length > 0) {
                    // Priorizar emails pessoais (@gmail, @hotmail, etc.)
                    const emailPessoal = emailMatches.find(e => 
                        e.toLowerCase().includes('@gmail') ||
                        e.toLowerCase().includes('@hotmail') ||
                        e.toLowerCase().includes('@outlook') ||
                        e.toLowerCase().includes('@yahoo')
                    );
                    
                    if (emailPessoal) {
                        emailStr = emailPessoal.toLowerCase();
                        console.log(`✅ Email pessoal extraído (fallback): ${emailStr}`);
                    } else {
                        // Se não tem email pessoal, pegar o que não é do cliente/solicitante
                        const emailNaoCorp = emailMatches.find(e => 
                            !e.toLowerCase().includes('@icesp') &&
                            !e.toLowerCase().includes('@cliente')
                        );
                        emailStr = (emailNaoCorp || emailMatches[0]).toLowerCase();
                        console.log(`✅ Email extraído (fallback): ${emailStr}`);
                    }
                }
            }
            
            // Fallback para DATA DE INÍCIO
            if (!startDateStr) {
                console.log('🔄 Tentando fallback para data_inicio...');
                
                // Método 1: Buscar "DATA DE INÍCIO" seguido de data
                const dataMatch = text.match(/DATA\s*(?:DE\s*)?INÍCIO[\s\n]*(\d{2}\/\d{2}\/\d{4})/i);
                if (dataMatch) {
                    startDateStr = dataMatch[1];
                    console.log(`✅ Data de Início extraída (fallback regex): ${startDateStr}`);
                }
                
                // Método 2: Buscar na seção DADOS PAGAMENTO
                if (!startDateStr) {
                    const dataPagMatch = text.match(/DADOS PAGAMENTO[\s\S]*?DATA DE INÍCIO[\s\n]*(\d{2}\/\d{2}\/\d{4})/i);
                    if (dataPagMatch) {
                        startDateStr = dataPagMatch[1];
                        console.log(`✅ Data de Início extraída (seção pagamento): ${startDateStr}`);
                    }
                }
                
                // Método 3: Buscar data após "19/01/2026" ou similar no contexto certo
                if (!startDateStr) {
                    // Procurar data no formato DD/MM/2026 que NÃO seja a data de emissão
                    const allDates = text.match(/\d{2}\/\d{2}\/202\d/g);
                    if (allDates && allDates.length > 0) {
                        // A primeira data geralmente é a de início
                        for (const date of allDates) {
                            // Ignorar se for a data de emissão (geralmente é a última)
                            if (!text.includes('DATA EMISSÃO') || text.indexOf(date) < text.indexOf('DATA EMISSÃO')) {
                                startDateStr = date;
                                console.log(`✅ Data de Início extraída (primeira data): ${startDateStr}`);
                                break;
                            }
                        }
                    }
                }
            }
            
            // 🔧 FIX v1.0: Fallback MELHORADO para VALOR PAGAMENTO
            if (!valorPagamentoStr) {
                console.log('🔄 Tentando fallback para valor_pagamento...');
                
                // Método 1: Buscar "R$" seguido de número no formato brasileiro
                const valorMatchBR = text.match(/R\$\s*([\d.]+,\d{2})/);
                if (valorMatchBR) {
                    valorPagamentoStr = valorMatchBR[1];
                    console.log(`✅ Valor Pagamento extraído (R$ format): ${valorPagamentoStr}`);
                }
                
                // Método 2: Buscar valor na seção DADOS PAGAMENTO
                if (!valorPagamentoStr) {
                    const pagamentoMatch = text.match(/DADOS PAGAMENTO[\s\S]*?VALOR[\s\n]*([\d.]+,\d{2})/i);
                    if (pagamentoMatch) {
                        valorPagamentoStr = pagamentoMatch[1];
                        console.log(`✅ Valor Pagamento extraído (seção): ${valorPagamentoStr}`);
                    }
                }
                
                // Método 3: Buscar qualquer valor monetário após "VALOR"
                if (!valorPagamentoStr) {
                    const valorGenerico = text.match(/VALOR[\s\n]*(?:NOVO[\s\n]*)?([\d.]+,\d{2})/i);
                    if (valorGenerico) {
                        valorPagamentoStr = valorGenerico[1];
                        console.log(`✅ Valor Pagamento extraído (genérico): ${valorPagamentoStr}`);
                    }
                }
            }
            
            // 🔧 FIX v1.1: Fallback MELHORADO para OBSERVAÇÕES
            // Usar APENAS padrões específicos - não usar seção genérica
            if (!observacoesStr) {
                console.log('🔄 Extraindo observações por padrões específicos...');
                
                // Padrões típicos de observações na Ficha de Inclusão
                const obsPatterns = [
                    /ATUARÁ[^.]+\./gi,
                    /GESTÃO DE PESSOAS FAVOR[^.]+\./gi,
                    /UTILIZARÁ[^.]+\./gi,
                    /HORÁRIO DE TRABALHO[^.]+\./gi,
                    /EM CASO DE[^.]+\./gi
                ];
                
                let obsTextos: string[] = [];
                for (const pattern of obsPatterns) {
                    const matches = text.match(pattern);
                    if (matches) {
                        for (const match of matches) {
                            // Filtrar matches que não são observações reais
                            if (!match.includes('NOTEBOOK') && 
                                !match.includes('SMARTPHONE') &&
                                !match.includes('CERTIFICAÇÃO') &&
                                match.length > 20) {
                                obsTextos.push(match.trim());
                            }
                        }
                    }
                }
                
                if (obsTextos.length > 0) {
                    // Remover duplicatas e juntar
                    const uniqueObs = [...new Set(obsTextos)];
                    observacoesStr = uniqueObs.join(' ').replace(/\s+/g, ' ').trim();
                    console.log(`✅ Observações extraídas (padrões): ${observacoesStr.substring(0, 100)}...`);
                }
            }
            
            // Fallback para RECURSOS HUMANOS
            if (!recursosHumanosStr) {
                console.log('🔄 Tentando fallback para recursos_humanos...');
                
                // Método 1: Buscar padrão específico no rodapé
                const rhMatch = text.match(/RECURSOS HUMANOS[\s\S]*?(\d{2}\/\d{2}\/\d{4})\s*\n\s*([A-Za-zÀ-ÿ\s]+?)(?:\n|GERENTE|MARCOS)/i);
                if (rhMatch && rhMatch[2]) {
                    const nome = rhMatch[2].trim();
                    if (nome.length > 3 && !nome.match(/GERENTE|COMERCIAL|DIRETORIA/i)) {
                        recursosHumanosStr = nome;
                        console.log(`✅ Recursos Humanos extraído (fallback 1): ${recursosHumanosStr}`);
                    }
                }
                
                // Método 2: Buscar nomes conhecidos de analistas após "RECURSOS HUMANOS"
                if (!recursosHumanosStr) {
                    const nomesAnalistas = ['LARISSA', 'MACIELMA', 'PRISCILA', 'TATIANA', 'RENATA'];
                    for (const nome of nomesAnalistas) {
                        if (text.includes(nome)) {
                            // Extrair nome completo
                            const nomeCompleto = text.match(new RegExp(`(${nome}[A-Za-zÀ-ÿ\\s]+?)(?:\\n|MARCOS|GERENTE|ROSENI)`, 'i'));
                            if (nomeCompleto && nomeCompleto[1]) {
                                recursosHumanosStr = nomeCompleto[1].trim();
                                console.log(`✅ Recursos Humanos extraído (fallback 2): ${recursosHumanosStr}`);
                                break;
                            }
                        }
                    }
                }
                
                // Método 3: Buscar após data de emissão
                if (!recursosHumanosStr) {
                    const afterDateMatch = text.match(/(\d{2}\/\d{2}\/\d{4})\s*\n\s*([A-Za-zÀ-ÿ]+\s+[A-Za-zÀ-ÿ]+)/);
                    if (afterDateMatch && afterDateMatch[2]) {
                        const possibleName = afterDateMatch[2].trim();
                        if (possibleName.length > 5 && 
                            !possibleName.match(/^(GERENTE|MARCOS|ROSENI|PRISCILA DO)/i)) {
                            recursosHumanosStr = possibleName;
                            console.log(`✅ Recursos Humanos extraído (fallback 3): ${recursosHumanosStr}`);
                        }
                    }
                }
            }

            // ===== VALIDATE & LOOKUP =====
            
            console.log('🔍 Dados extraídos para validação:', {
                cliente: clientName,
                consultor: consultantName,
                email: emailStr,
                cpf: cpfStr,
                cargo: role,
                dataInicio: startDateStr,
                valorPagamento: valorPagamentoStr,
                recursosHumanos: recursosHumanosStr,
                observacoes: observacoesStr?.substring(0, 50)
            });

            if (!clientName || !consultantName) {
                throw new Error(`Dados obrigatórios não encontrados. Cliente: "${clientName}", Consultor: "${consultantName}"`);
            }

            const client = clients.find(c => normalize(c.razao_social_cliente) === normalize(clientName));
            if (!client) {
                throw new Error(`Cliente "${clientName}" não encontrado no sistema.`);
            }

            const manager = managers.find(m => 
                m.id_cliente === client.id && 
                normalize(m.nome_gestor_cliente).includes(normalize(managerName.split(' ')[0]))
            );
            const targetManagerId = manager?.id || managers.find(m => m.id_cliente === client.id)?.id;
            if (!targetManagerId) {
                throw new Error(`Nenhum gestor encontrado para o cliente "${clientName}".`);
            }

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
                // Remove R$, espaços, e converte formato BR (X.XXX,XX) para float
                const cleaned = value
                    .replace(/R\$\s*/g, '')
                    .replace(/\s/g, '')
                    .replace(/\./g, '')  // Remove pontos de milhar
                    .replace(',', '.');   // Converte vírgula decimal para ponto
                const num = parseFloat(cleaned);
                return isNaN(num) ? null : num;
            };

            const startDate = parseDate(startDateStr);
            const billingValue = parseMoneyBR(hourlyRateStr);
            const valorPagamento = parseMoneyBR(valorPagamentoStr);
            const dtAniversario = dtAniversarioStr ? parseDate(dtAniversarioStr) : null;

            let modalidadeContrato: ModalidadeContrato = 'PJ';
            if (modalidadeContratoStr) {
                if (modalidadeContratoStr.toUpperCase() === 'CLT') modalidadeContrato = 'CLT';
                else if (modalidadeContratoStr.toUpperCase() === 'PJ') modalidadeContrato = 'PJ';
            }

            // Buscar analista_rs_id
            let analistaRsId: number | null = null;
            if (recursosHumanosStr) {
                const analistaUser = findUserByName(recursosHumanosStr);
                if (analistaUser) {
                    analistaRsId = analistaUser.id;
                    console.log(`✅ Analista R&S encontrado: ${analistaUser.nome_usuario} (ID: ${analistaUser.id})`);
                }
            }
            
            // ✅ CORREÇÃO v1.1: Usar ANO ATUAL para permitir reinserção de consultores de anos anteriores
            // A constraint UNIQUE é (cpf, ano_vigencia), então um consultor de 2025 pode ser inserido em 2026
            const anoVigencia = new Date().getFullYear();
            console.log(`📅 Ano vigência definido como ANO ATUAL: ${anoVigencia}`);

            // ===== CONSTRUCT DATA =====
            const newConsultantData = {
                ano_vigencia: anoVigencia,
                nome_consultores: consultantName,
                cargo_consultores: role || 'Consultor',
                data_inclusao_consultores: startDate,
                status: 'Ativo' as const,
                ativo_consultor: true,
                
                celular: celularStr || '',
                email_consultor: emailStr || '',
                cpf: cpfStr || '',
                
                cnpj_consultor: cnpjStr || null,
                empresa_consultor: empresaStr || null,
                
                dt_aniversario: dtAniversario,
                especialidade: especialidadeStr || null,
                
                gestor_imediato_id: targetManagerId,
                coordenador_id: targetCoordId,
                
                valor_faturamento: billingValue || 0,
                valor_pagamento: valorPagamento || 0,
                
                analista_rs_id: analistaRsId,
                id_gestao_de_pessoas: client.id_gestao_de_pessoas || null,
                
                cliente_id: client.id,
                
                modalidade_contrato: modalidadeContrato,
                substituicao: substituicao,
                nome_substituido: nomeSubstituidoStr || null,
                faturavel: faturavel,
                observacoes: observacoesStr || null,
            };

            console.log('📋 Dados extraídos do PDF:', {
                cliente: clientName,
                clienteId: client.id,
                consultor: consultantName,
                cargo: role,
                dataInicio: startDate,
                valorPagamento: valorPagamento,
                modalidadeContrato: modalidadeContrato,
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
