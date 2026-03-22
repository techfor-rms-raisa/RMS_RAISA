/**
 * InclusionImport.tsx - Importador de Ficha de Inclusão
 * 
 * VERSÃO: Fix v1.7 - 22/03/2026
 * 
 * CORREÇÕES:
 * - ✅ v1.7: Intercepta window.alert() do ManageConsultants para tratar erro duplicata
 * - ✅ v1.6: EMPRESA normalize sem acento + fallback texto; duplicata CPF/email verificada localmente
 * - ✅ v1.5: EMPRESA regex espaço + fallback FAVORECIDO PJ; erro duplicata CPF com mensagem clara
 * - ✅ v1.4: EMAIL pessoal nunca excluído; FATURÁVEL ignora label não-marcado; VALOR prioriza /hr;
 *           OBSERVAÇÕES extrai bloco HORÁRIO→RH; RH captura linha direta; FATURAMENTO fallback
 * - ✅ v1.3: EMPRESA/CPF/FATURAMENTO/VALOR/FATURÁVEL/OBSERVAÇÕES corrigidos (7 campos)
 * - ✅ v1.2: Email fixado — ancoragem na seção DADOS DO PROFISSIONAL + exclusão de emails do gestor
 * - ✅ v1.2: Lista hardcoded de analistas RH substituída por busca dinâmica nos users do sistema
 * - ✅ v1.2: Filtro hardcoded de nomes ("Elaine", "Fernando") substituído por detecção de seção
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
    consultants?: any[]; // ✅ FIX v1.6: para verificar duplicata de CPF antes de inserir
    onImport: (consultantData: any) => Promise<any> | void;
}

const InclusionImport: React.FC<InclusionImportProps> = ({ clients, managers, coordinators, users, consultants = [], onImport }) => {
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
            let faturavelConfirmado = false;
            let observacoesStr = '';
            let recursosHumanosStr = '';
            
            // ✅ FIX v1.4: Coletar apenas emails CORPORATIVOS do gestor/cliente para excluir
            // Emails pessoais (@gmail, @hotmail etc) NUNCA são excluídos — podem ser do consultor
            // Somente emails corporativos do gestor (mesmo domínio que o email do gestor/solicitante)
            const dadosProfissionalIdx = text.indexOf('DADOS DO PROFISSIONAL');
            const textoAntesDadosProfissional = dadosProfissionalIdx > 0 ? text.substring(0, dadosProfissionalIdx) : '';
            const dominiosPersonais = ['gmail', 'hotmail', 'outlook', 'yahoo', 'live', 'icloud', 'uol', 'bol', 'terra'];
            const emailsGestor = new Set(
                (textoAntesDadosProfissional.match(/[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}/gi) || [])
                    .map((e: string) => e.toLowerCase())
                    // Só excluir emails corporativos (não pessoais) — email pessoal pode ser do consultor
                    .filter((e: string) => !dominiosPersonais.some(d => e.includes('@' + d)))
            );
            console.log(`🔍 Emails corporativos do gestor (a ignorar): ${[...emailsGestor].join(', ')}`);

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
                    // ✅ FIX v1.2: Remover filtros hardcoded de nomes ("Elaine", "Fernando")
                    // Usar detecção dinâmica: ignorar se for nome de contato de emergência
                    // (seção INFORMAÇÕES DE EMERGÊNCIA) ou sigla
                    const isNomeEmergencia = inInformacoesEmergencia;
                    if (nomePotencial && 
                        nomePotencial.length > 3 && 
                        !isNomeEmergencia &&
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
                
                // ===== 🔧 FIX v1.4: VALOR PAGAMENTO =====
                // Captura "R$ 80/hr" isolado na linha (aparece antes de FATURAMENTO MENSAL no PDF)
                if (cleanLine.match(/^R\$\s*\d+(?:[.,]\d+)?\s*\/h(?:r|ora)?$/i) && !valorPagamentoStr) {
                    const matchHr = cleanLine.match(/R\$\s*([\d.,]+)/i);
                    if (matchHr) {
                        valorPagamentoStr = matchHr[1];
                        console.log(`✅ Valor Pagamento extraído (R$/hr linha isolada): ${valorPagamentoStr}`);
                    }
                }
                
                // Capturar dentro da seção DADOS PAGAMENTO
                if (cleanLine === 'VALOR' && inDadosPagamento) {
                    console.log(`🔍 Encontrado label VALOR na seção DADOS PAGAMENTO (linha ${i})`);
                    for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
                        const testLine = lines[j].trim();
                        const valorMatch = testLine.match(/R\$\s*([\d.,]+)/i) ||
                                          testLine.match(/^([\d.]+,[\d]{2})$/) ||
                                          testLine.match(/^([\d]+(?:[.,]\d+)?)(?:\/hr|\/h|\/hora)?$/i);
                        if (valorMatch && valorMatch[1]) {
                            valorPagamentoStr = valorMatch[1].replace(/R\$\s*/i, '').trim();
                            console.log(`✅ Valor Pagamento extraído (seção DADOS PAG): ${valorPagamentoStr}`);
                            break;
                        }
                    }
                }
                
                // ===== FATURAMENTO MENSAL =====
                // ✅ FIX v1.4: O label "FATURAMENTO MENSAL" e o valor "R$ 114,65" estão em 
                // seções diferentes no texto extraído. Buscar inline ou próximas linhas.
                if (cleanLine.match(/FATURAMENTO MENSAL/i) && !hourlyRateStr) {
                    const inlineValFat = cleanLine.match(/R\$\s*([\d.,]+)/i);
                    if (inlineValFat) {
                        hourlyRateStr = inlineValFat[1];
                        console.log(`✅ Faturamento Mensal extraído (inline): ${hourlyRateStr}`);
                    } else {
                        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
                            const testLine = lines[j].trim();
                            if (testLine.match(/^R\$\s*[\d.,]+$/i) || 
                                testLine.match(/^[\d.]+,[\d]{2}$/) ||
                                testLine.match(/^[\d]+,[\d]{2}$/)) {
                                hourlyRateStr = testLine.replace(/R\$\s*/i, '').trim();
                                console.log(`✅ Faturamento Mensal extraído (linha ${j}): ${hourlyRateStr}`);
                                break;
                            }
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
                // ✅ FIX v1.3: Aceita formato com ponto no final (XXX.XXX.XXX.XX) além do hífen
                if ((cleanLine.match(/^CPF:/i) || cleanLine.match(/CPF:\s*[\d.-]+/i)) && !cpfStr) {
                    // Aceita: 436.337.638.48 (ponto) OU 436.337.638-48 (hífen)
                    const cpfMatch = cleanLine.match(/(\d{3}[.\s]\d{3}[.\s]\d{3}[.-\s]\d{2})/);
                    if (cpfMatch) {
                        // Normalizar: trocar último ponto por hífen → XXX.XXX.XXX-XX
                        cpfStr = cpfMatch[1].replace(/^(\d{3}\.\d{3}\.\d{3})\.( \d{2})$/, '$1-$2')
                                            .replace(/^(\d{3}\.\d{3}\.\d{3})\.(\ d{2})$/, '$1-$2');
                        // Regex mais simples: substituir o último separador por hífen
                        const parts = cpfMatch[1].replace(/\s/g, '').split('.');
                        if (parts.length === 4) {
                            cpfStr = parts[0] + '.' + parts[1] + '.' + parts[2] + '-' + parts[3];
                        } else {
                            cpfStr = cpfMatch[1];
                        }
                        console.log(`✅ CPF extraído: ${cpfStr}`);
                    }
                }
                
                // ===== EMAIL =====
                // ✅ FIX v1.2: Buscar email SOMENTE dentro da seção DADOS DO PROFISSIONAL
                // e excluir emails do gestor/solicitante coletados antes da seção
                if (cleanLine.match(/E-MAIL\s*:/i) && !emailStr && inDadosProfissional) {
                    const emailMatch = cleanLine.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/i);
                    if (emailMatch) {
                        const emailEncontrado = emailMatch[1].toLowerCase();
                        // Ignorar se for um dos emails do gestor/solicitante
                        if (!emailsGestor.has(emailEncontrado)) {
                            emailStr = emailEncontrado;
                            console.log(`✅ Email do profissional extraído (seção DADOS): ${emailStr}`);
                        } else {
                            console.log(`⚠️ Email ignorado (pertence ao gestor): ${emailEncontrado}`);
                        }
                    }
                }
                // Buscar email em linha E-MAIL fora da seção (fallback menos prioritário)
                if (cleanLine.match(/E-MAIL\s*:/i) && !emailStr && !inDadosProfissional && !inInformacoesEmergencia) {
                    const emailMatch = cleanLine.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/i);
                    if (emailMatch) {
                        const emailFallback = emailMatch[1].toLowerCase();
                        // Só captura se for claramente pessoal e não for do gestor
                        if (!emailsGestor.has(emailFallback) && (
                            emailFallback.includes('@gmail') || emailFallback.includes('@hotmail') ||
                            emailFallback.includes('@outlook') || emailFallback.includes('@yahoo') ||
                            emailFallback.includes('@live') || emailFallback.includes('@icloud')
                        )) {
                            emailStr = emailFallback;
                            console.log(`✅ Email pessoal extraído (fora seção): ${emailStr}`);
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
                // ✅ FIX v1.6: Aceita "EMPRESA:" e "EMPRESA :" (com espaço)
                if (cleanLine.match(/^EMPRESA\s*:/i) && !cleanLine.includes('ENDEREÇO') && !empresaStr) {
                    const inlineVal = cleanLine.replace(/^EMPRESA\s*:/i, '').trim();
                    if (inlineVal && inlineVal !== 'XXX' && inlineVal !== 'xxx') {
                        empresaStr = inlineVal;
                        console.log(`✅ Empresa extraída (inline): ${empresaStr}`);
                    } else if (nextLine && nextLine.length > 2 && !nextLine.match(/^[A-Z\s]+:/)) {
                        empresaStr = nextLine.replace(/\(.*\)/g, '').trim();
                        if (empresaStr === 'XXX' || empresaStr === 'xxx') empresaStr = '';
                        else console.log(`✅ Empresa extraída (próxima linha): ${empresaStr}`);
                    }
                }
                // Fallback: "FAVORECIDO PESSOA JURIDICA:" — normalizado sem acento para garantir match
                if (!empresaStr) {
                    const normalizedLine = normalize(cleanLine);
                    if (normalizedLine.startsWith('favorecido pessoa juridica')) {
                        // Extrair valor após os dois pontos na linha original
                        const favVal = cleanLine.replace(/^[^:]+:/i, '').trim();
                        if (favVal && favVal !== 'XXX' && favVal !== 'xxx' && favVal.length > 2) {
                            empresaStr = favVal;
                            console.log(`✅ Empresa extraída (FAVORECIDO PJ normalizado): ${empresaStr}`);
                        }
                    }
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
                // ✅ FIX v1.4: A ficha SEMPRE tem 2 linhas: "FATURÁVEL" e "NÃO FATURÁVEL"
                // O pdf.js extrai as duas mesmo quando só uma está marcada.
                // Heurística: a linha FATURÁVEL vem ANTES de NÃO FATURÁVEL no PDF.
                // Se já setamos faturavel=true e vem "NÃO FATURÁVEL" na linha seguinte,
                // é apenas o label do checkbox não marcado — IGNORAR.
                // Só setar false se "NÃO FATURÁVEL" for a ÚNICA menção (sem "FATURÁVEL" antes).
                if (cleanLine.match(/N[AÃ]O\s*FATUR[AÁ]VEL/i)) {
                    // Só muda para false se faturavel ainda não foi explicitamente confirmado
                    if (!faturavelConfirmado) {
                        faturavel = false;
                        console.log(`✅ Faturável: false (NÃO FATURÁVEL sem FATURÁVEL antes)`);
                    } else {
                        console.log(`ℹ️ Faturável: ignorando NÃO FATURÁVEL (FATURÁVEL já confirmado)`);
                    }
                } else if (cleanLine.match(/^FATUR[AÁ]VEL$/i)) {
                    // Linha isolada "FATURÁVEL" = checkbox FATURÁVEL marcado
                    faturavel = true;
                    faturavelConfirmado = true;
                    console.log(`✅ Faturável: true (checkbox FATURÁVEL marcado)`);
                }
                
                // ===== 🔧 FIX v1.1: OBSERVAÇÕES =====
                // NÃO usar extração por label aqui - usar apenas fallback por padrões
                // porque a estrutura do PDF mistura seções
                
                // ===== RECURSOS HUMANOS =====
                // ✅ FIX v1.4: "PRISCILA DO ESPÍRITO SANTO" está na linha LOGO APÓS "RECURSOS HUMANOS"
                // na estrutura do rodapé. Capturar diretamente a próxima linha válida.
                if (cleanLine === 'RECURSOS HUMANOS' && !recursosHumanosStr) {
                    console.log(`🔍 Encontrado header RECURSOS HUMANOS na linha ${i}`);
                    
                    // Método direto: próxima linha não vazia e não é header/número/data
                    for (let k = i + 1; k < Math.min(i + 5, lines.length); k++) {
                        const testLine = lines[k].trim();
                        if (testLine && 
                            testLine.length > 3 &&
                            testLine !== 'XXX' &&
                            !testLine.match(/^\d/) &&
                            !testLine.match(/^\d{2}\/\d{2}\/\d{4}$/) &&
                            !testLine.match(/^(GERENTE|COMERCIAL|DIRETORIA|GESTÃO|DATA|RECURSOS|BASE|HORA|VALOR|ITEM|NOVO|ANTERIOR)/i)) {
                            recursosHumanosStr = testLine;
                            console.log(`✅ Recursos Humanos extraído (linha direta): ${recursosHumanosStr}`);
                            break;
                        }
                    }
                    
                    // Se não encontrou diretamente, buscar por data de emissão + próxima linha
                    if (!recursosHumanosStr) {
                        for (let k = i + 1; k < Math.min(i + 25, lines.length); k++) {
                            const testLine = lines[k].trim();
                            if (testLine.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
                                if (k + 1 < lines.length) {
                                    const possibleRH = lines[k + 1].trim();
                                    if (possibleRH && 
                                        possibleRH.length > 3 &&
                                        possibleRH !== 'XXX' &&
                                        !possibleRH.match(/^\d/) &&
                                        !possibleRH.match(/^(GERENTE|COMERCIAL|DIRETORIA|GESTÃO|DATA|RECURSOS|BASE|HORA)/i)) {
                                        recursosHumanosStr = possibleRH;
                                        console.log(`✅ Recursos Humanos extraído (após data): ${recursosHumanosStr}`);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // ===== 🔧 FIX v1.1: FALLBACKS MELHORADOS =====
            
            // ✅ FIX v1.6: Fallback EMPRESA — busca no texto completo se loop não capturou
            if (!empresaStr) {
                // Tentar "EMPRESA: valor" no texto completo (normalizado)
                const empresaMatch = text.match(/^EMPRESA\s*:\s*(.+)$/im);
                if (empresaMatch && empresaMatch[1]) {
                    const val = empresaMatch[1].trim();
                    if (val !== 'XXX' && val !== 'xxx' && !val.match(/ENDEREÇO/i) && val.length > 2) {
                        empresaStr = val;
                        console.log(`✅ Empresa extraída (fallback texto): ${empresaStr}`);
                    }
                }
                // Tentar "FAVORECIDO PESSOA JURIDICA: valor" (sem acento)
                if (!empresaStr) {
                    const favMatch = text.match(/FAVORECIDO PESSOA JURI[DÍ]?[I]?CA\s*:\s*(.+)/i);
                    if (favMatch && favMatch[1]) {
                        const val = favMatch[1].trim();
                        if (val !== 'XXX' && val !== 'xxx' && val.length > 2) {
                            empresaStr = val;
                            console.log(`✅ Empresa extraída (fallback FAVORECIDO texto): ${empresaStr}`);
                        }
                    }
                }
            }
            
            // Fallback para NOME DO CONSULTOR
            if (!consultantName) {
                console.log('🔄 Tentando fallback para nome do consultor...');
                
                // Método 1: Buscar "NOME:" seguido de nome próprio (não banco, não solicitante)
                const nomeMatch = text.match(/NOME:\s*([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)+)/);
                if (nomeMatch) {
                    const nomePotencial = nomeMatch[1].trim();
                    // ✅ FIX v1.2: Validar sem nomes hardcoded
                    if (nomePotencial.length > 5 && 
                        !nomePotencial.includes('Banco')) {
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
            
            // ✅ FIX v1.2: Fallback email — buscar na seção DADOS DO PROFISSIONAL,
            // excluindo emails do gestor/solicitante coletados anteriormente
            if (!emailStr) {
                const textoDadosProf = dadosProfissionalIdx > 0
                    ? text.substring(dadosProfissionalIdx)
                    : text;
                const emailMatches = textoDadosProf.match(/[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}/gi);
                if (emailMatches && emailMatches.length > 0) {
                    // 1º: email pessoal que não seja do gestor
                    const emailPessoal = emailMatches.find(e => {
                        const el = e.toLowerCase();
                        return !emailsGestor.has(el) && (
                            el.includes('@gmail') || el.includes('@hotmail') ||
                            el.includes('@outlook') || el.includes('@yahoo') ||
                            el.includes('@live') || el.includes('@icloud')
                        );
                    });
                    if (emailPessoal) {
                        emailStr = emailPessoal.toLowerCase();
                        console.log(`✅ Email pessoal extraído (fallback seção): ${emailStr}`);
                    } else {
                        // 2º: qualquer email que não seja do gestor
                        const emailNaoGestor = emailMatches.find(e => !emailsGestor.has(e.toLowerCase()));
                        if (emailNaoGestor) {
                            emailStr = emailNaoGestor.toLowerCase();
                            console.log(`✅ Email extraído (fallback não-gestor): ${emailStr}`);
                        }
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
            
            // ✅ FIX v1.4: Fallback FATURAMENTO MENSAL — busca na seção DADOS FATURAMENTO
            if (!hourlyRateStr) {
                console.log('🔄 Tentando fallback para faturamento mensal...');
                const fatMatch = text.match(/DADOS FATURAMENTO[\s\S]*?FATURAMENTO MENSAL[\s\S]*?R\$\s*([\d.,]+)/i);
                if (fatMatch) {
                    hourlyRateStr = fatMatch[1];
                    console.log(`✅ Faturamento Mensal extraído (seção DADOS FATURAMENTO): ${hourlyRateStr}`);
                }
                // Fallback: maior R$ decimal no texto (faturamento > pagamento)
                if (!hourlyRateStr) {
                    const todosR = [...text.matchAll(/R\$\s*([\d.]+,[\d]{2})/gi)]
                        .map(m => ({ raw: m[1], num: parseFloat(m[1].replace(/\./g,'').replace(',','.')) }))
                        .filter(v => !isNaN(v.num) && v.num > 0)
                        .sort((a, b) => b.num - a.num);
                    const valorPagNum = parseFloat((valorPagamentoStr || '0').replace(/\./g,'').replace(',','.'));
                    const candidatoFat = todosR.find(v => v.num !== valorPagNum);
                    if (candidatoFat) {
                        hourlyRateStr = candidatoFat.raw;
                        console.log(`✅ Faturamento Mensal extraído (maior R$ diferente do pagamento): ${hourlyRateStr}`);
                    }
                }
            }

            // ✅ FIX v1.4: Fallback VALOR PAGAMENTO — prioriza /hr sobre decimal
            if (!valorPagamentoStr) {
                console.log('🔄 Tentando fallback para valor_pagamento...');
                
                // Método 0: Linha isolada "R$ XX/hr" no texto (mais específico e confiável)
                const linhaHr = text.match(/^R\$\s*(\d+(?:[.,]\d+)?)\s*\/h(?:r|ora)?\s*$/im);
                if (linhaHr) {
                    valorPagamentoStr = linhaHr[1];
                    console.log(`✅ Valor Pagamento extraído (linha R$/hr): ${valorPagamentoStr}`);
                }
                
                // Método 1: Qualquer padrão "R$ XX/hr" no texto
                if (!valorPagamentoStr) {
                    const valorPorHora = text.match(/R\$\s*(\d+(?:[.,]\d+)?)\/h(?:r|ora)?/i);
                    if (valorPorHora) {
                        valorPagamentoStr = valorPorHora[1];
                        console.log(`✅ Valor Pagamento extraído (R$/hr): ${valorPagamentoStr}`);
                    }
                }
                
                // Método 2: Buscar na seção DADOS PAGAMENTO linha com R$ após VALOR
                if (!valorPagamentoStr) {
                    const dadosPagMatch = text.match(/DADOS PAGAMENTO[\s\S]*?\bVALOR\b[\s\S]*?R\$\s*([\d.,]+)/i);
                    if (dadosPagMatch) {
                        valorPagamentoStr = dadosPagMatch[1];
                        console.log(`✅ Valor Pagamento extraído (seção DADOS PAG): ${valorPagamentoStr}`);
                    }
                }
                
                // Método 3: R$ seguido de número decimal BR
                if (!valorPagamentoStr) {
                    const valorMatchBR = text.match(/R\$\s*([\d.]+,\d{2})/);
                    if (valorMatchBR) {
                        valorPagamentoStr = valorMatchBR[1];
                        console.log(`✅ Valor Pagamento extraído (R$ decimal): ${valorPagamentoStr}`);
                    }
                }
                
                // Método 4: Menor valor monetário no texto (pagamento < faturamento)
                if (!valorPagamentoStr) {
                    const todosValores = [...text.matchAll(/R\$\s*([\d.]+[,.]\d{2})/gi)]
                        .map(m => ({ raw: m[1], num: parseFloat(m[1].replace('.','').replace(',','.')) }))
                        .filter(v => !isNaN(v.num) && v.num > 0)
                        .sort((a, b) => a.num - b.num);
                    if (todosValores.length > 0) {
                        valorPagamentoStr = todosValores[0].raw;
                        console.log(`✅ Valor Pagamento extraído (menor R$): ${valorPagamentoStr}`);
                    }
                }
            }
            
            // ✅ FIX v1.3: OBSERVAÇÕES — captura bloco após label OBSERVAÇÕES:
            // Método principal: extrair tudo após "OBSERVAÇÕES:" até a próxima seção
            if (!observacoesStr) {
                console.log('🔄 Extraindo observações...');
                
                // ✅ FIX v1.4: O texto das obs fica entre "HORÁRIO DE TRABALHO" e "RECURSOS HUMANOS"
                // — não após o label "OBSERVAÇÕES:" que fica no topo (só tem NOTEBOOK/SMARTPHONE abaixo)
                
                // Método 1: Capturar bloco entre HORÁRIO DE TRABALHO e RECURSOS HUMANOS
                const obsHorarioMatch = text.match(/HOR[AÁ]RIO DE TRABALHO[^\n]*\n([\s\S]+?)(?=RECURSOS HUMANOS|PRISCILA|DATA EMISS[AÃ]O|\nEQUIPAMENTOS)/i);
                if (obsHorarioMatch && obsHorarioMatch[1]) {
                    const rawObs = obsHorarioMatch[1]
                        .split('\n')
                        .map((l: string) => l.trim())
                        .filter((l: string) => l.length > 5 
                            && !l.match(/^(NOTEBOOK|SMARTPHONE|FATURAR|INCLUSO|EQUIPAMENTOS|DATA EMISSÃO|\d{2}\/\d{2}\/\d{4})$/i))
                        .join(' ')
                        .replace(/\s+/g, ' ')
                        .trim();
                    if (rawObs.length > 10) {
                        observacoesStr = rawObs;
                        console.log(`✅ Observações extraídas (bloco HORÁRIO→RH): ${observacoesStr.substring(0, 100)}...`);
                    }
                }
                
                // Método 2 (fallback): bloco após label "OBSERVAÇÕES:" no texto
                if (!observacoesStr) {
                    const obsBlockMatch = text.match(/OBSERVA[CÇ][OÕ]ES\s*:?\s*\n([\s\S]+?)(?=\nEQUIPAMENTOS|\nNOTEBOOK|\nSMARTPHONE|\nFORM0005)/i);
                    if (obsBlockMatch && obsBlockMatch[1]) {
                        const rawObs = obsBlockMatch[1]
                            .split('\n')
                            .map((l: string) => l.trim())
                            .filter((l: string) => l.length > 5 && !l.match(/^(NOTEBOOK|SMARTPHONE|FATURAR|INCLUSO)$/i))
                            .join(' ')
                            .replace(/\s+/g, ' ')
                            .trim();
                        if (rawObs.length > 10) {
                            observacoesStr = rawObs;
                            console.log(`✅ Observações extraídas (bloco label): ${observacoesStr.substring(0, 100)}...`);
                        }
                    }
                }
                
                // Método 2: Padrões específicos de frases comuns nas observações
                if (!observacoesStr) {
                    const obsPatterns = [
                        /CONSULTOR[^\n]{10,}/gi,
                        /ATUARÁ[^.]+\./gi,
                        /MODELO DE ATUA[CÇ][AÃ]O[^.]+\./gi,
                        /COMERCIAL[^\n]{10,}/gi,
                        /CAC[^\n]{10,}/gi,
                        /GESTÃO DE PESSOAS[^.]+\./gi,
                        /UTILIZARÁ[^.]+\./gi,
                        /EM CASO DE[^.]+\./gi
                    ];
                    
                    let obsTextos: string[] = [];
                    for (const pattern of obsPatterns) {
                        const matches = text.match(pattern);
                        if (matches) {
                            for (const match of matches) {
                                if (!match.match(/^(CONSULTOR\s*[:|]|CONSULTOR\s+EM\s+QUARENTENA)/i) &&
                                    !match.includes('NOTEBOOK') && 
                                    !match.includes('SMARTPHONE') &&
                                    !match.includes('CERTIFICAÇÃO') &&
                                    match.length > 20) {
                                    obsTextos.push(match.trim());
                                }
                            }
                        }
                    }
                    
                    if (obsTextos.length > 0) {
                        const uniqueObs = [...new Set(obsTextos)];
                        observacoesStr = uniqueObs.join(' ').replace(/\s+/g, ' ').trim();
                        console.log(`✅ Observações extraídas (padrões): ${observacoesStr.substring(0, 100)}...`);
                    }
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
                
                // ✅ FIX v1.2: Método 2 — buscar pelos primeiros nomes dos usuários do sistema
                // Remove dependência de lista hardcoded — usa os users reais cadastrados
                if (!recursosHumanosStr) {
                    const primeiroNomesUsers = users
                        .filter(u => u.nome_usuario && u.nome_usuario.length > 2)
                        .map(u => u.nome_usuario.split(' ')[0].toUpperCase());
                    
                    for (const primeiroNome of primeiroNomesUsers) {
                        if (text.toUpperCase().includes(primeiroNome)) {
                            const nomeCompleto = text.match(new RegExp(`(${primeiroNome}[A-Za-zÀ-ÿ\\s]+?)(?:\\n|MARCOS|GERENTE|ROSENI|MESSIAS|DIRETORIA)`, 'i'));
                            if (nomeCompleto && nomeCompleto[1]) {
                                const nomeTrimmed = nomeCompleto[1].trim();
                                // Verificar se o nome existe em users (confirmar que é analista)
                                const userConfirmado = findUserByName(nomeTrimmed);
                                if (userConfirmado) {
                                    recursosHumanosStr = nomeTrimmed;
                                    console.log(`✅ Recursos Humanos extraído (fallback dinâmico): ${recursosHumanosStr}`);
                                    break;
                                }
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

            // ✅ FIX v1.6: Verificar duplicata LOCALMENTE antes de chamar onImport
            // Evita que o alert() do ManageConsultants sobreponha a mensagem
            const anoAtual = new Date().getFullYear();
            if (cpfStr) {
                const cpfLimpo = cpfStr.replace(/[^\d]/g, '');
                const duplicataCPF = consultants.find((c: any) => {
                    const cCpf = (c.cpf || '').replace(/[^\d]/g, '');
                    return cCpf === cpfLimpo && (c.ano_vigencia === anoAtual || !c.ano_vigencia);
                });
                if (duplicataCPF) {
                    throw new Error(
                        `CPF já cadastrado!\n\nO CPF "${cpfStr}" já pertence ao consultor "${duplicataCPF.nome_consultores}" no sistema (ano ${anoAtual}).\n\nSe precisar atualizar os dados, edite o consultor existente na lista.`
                    );
                }
            }
            if (newConsultantData.email_consultor) {
                const emailLimpo = newConsultantData.email_consultor.toLowerCase().trim();
                const duplicataEmail = consultants.find((c: any) =>
                    (c.email_consultor || '').toLowerCase().trim() === emailLimpo
                );
                if (duplicataEmail) {
                    throw new Error(
                        `E-mail já cadastrado!\n\nO e-mail "${newConsultantData.email_consultor}" já pertence ao consultor "${duplicataEmail.nome_consultores}" no sistema.\n\nSe precisar atualizar os dados, edite o consultor existente na lista.`
                    );
                }
            }

            // ✅ FIX v1.7: Interceptar window.alert() durante onImport
            // ManageConsultants usa alert() para erros do Supabase — capturamos antes de exibir
            let alertCapturado: string | null = null;
            const alertOriginal = window.alert;
            window.alert = (msg: any) => {
                alertCapturado = String(msg || '');
                console.log(`🔇 Alert interceptado: ${alertCapturado}`);
                // NÃO chama alertOriginal — suprimimos o alert nativo
            };

            let importResult: any;
            try {
                importResult = await Promise.resolve(onImport(newConsultantData));
            } finally {
                // Sempre restaurar window.alert após a chamada
                window.alert = alertOriginal;
            }

            // Verificar se alert foi disparado com mensagem de erro
            if (alertCapturado) {
                const msgLower = alertCapturado.toLowerCase();
                if (msgLower.includes('duplicate') || msgLower.includes('unique') || msgLower.includes('duplicat')) {
                    throw new Error(
                        `CPF já cadastrado!\n\nO CPF "${cpfStr || 'informado'}" já existe no sistema para o ano ${anoAtual}.\n\nSe precisar atualizar os dados, edite o consultor existente na lista.`
                    );
                }
                // Outro erro do alert — converter em erro amigável
                throw new Error(`Erro ao salvar consultor: ${alertCapturado}`);
            }

            // Verificar erro no retorno (caso ManageConsultants retorne objeto de erro)
            if (importResult && importResult.error) {
                const sbError = importResult.error;
                if (sbError.code === '23505' || sbError.message?.includes('unique') || sbError.message?.includes('duplicate')) {
                    throw new Error(
                        `CPF já cadastrado!\n\nO CPF "${cpfStr || 'informado'}" já existe no sistema para o ano ${anoAtual}.\n\nEdite o consultor existente na lista.`
                    );
                }
                throw new Error(`Erro ao salvar: ${sbError.message || 'Erro desconhecido'}`);
            }
            
            setMessage({ text: `✅ "${consultantName}" importado com sucesso!`, type: 'success' });

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
