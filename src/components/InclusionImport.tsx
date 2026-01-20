// src/components/InclusionImport.tsx
// ✅ v2.6 - Correção RECURSOS HUMANOS, VALOR PAGAMENTO e OBSERVAÇÕES
// - RECURSOS HUMANOS: lógica de posição de coluna na tabela
// - VALOR PAGAMENTO: múltiplas estratégias de extração
// - OBSERVAÇÕES: captura texto real, ignora checkboxes
// - Logs detalhados para debug

import React, { useState } from 'react';
import { Client, User, UsuarioCliente, CoordenadorCliente } from '@/types';
import * as pdfjsLib from 'pdfjs-dist';

// ✅ CORREÇÃO v2.2: Configurar worker para ESModules (Vite)
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// Suppress console warnings from pdf.js
if (typeof window !== 'undefined') {
    const originalWarn = console.warn;
    console.warn = (...args) => {
        if (args[0]?.includes?.('pdf.js')) return;
        originalWarn.apply(console, args);
    };
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
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument(arrayBuffer);
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
     * ✅ v2.5: Melhorado com múltiplas estratégias de busca
     */
    const findUserByName = (name: string): User | null => {
        if (!name || name === 'XXX' || name === 'xxx') return null;
        
        const normalizedName = normalize(name);
        console.log(`🔍 Buscando usuário: "${name}" (normalizado: "${normalizedName}")`);
        console.log(`📋 Usuários disponíveis: ${users.map(u => u.nome_usuario).join(', ')}`);
        
        // Busca exata
        let user = users.find(u => normalize(u.nome_usuario) === normalizedName);
        if (user) {
            console.log(`✅ Usuário encontrado (exato): ${user.nome_usuario} (ID: ${user.id})`);
            return user;
        }
        
        // Busca parcial (primeiro nome)
        const firstName = normalizedName.split(' ')[0];
        user = users.find(u => normalize(u.nome_usuario).startsWith(firstName));
        if (user) {
            console.log(`⚠️ Usuário encontrado por aproximação (primeiro nome): "${user.nome_usuario}" (ID: ${user.id}) para "${name}"`);
            return user;
        }
        
        // Busca contém (nome completo)
        user = users.find(u => normalize(u.nome_usuario).includes(normalizedName) || normalizedName.includes(normalize(u.nome_usuario)));
        if (user) {
            console.log(`⚠️ Usuário encontrado por busca parcial (contém): "${user.nome_usuario}" (ID: ${user.id}) para "${name}"`);
            return user;
        }
        
        // ✅ v2.5: Busca por qualquer parte do nome
        const nameParts = normalizedName.split(' ').filter(p => p.length > 2);
        for (const part of nameParts) {
            user = users.find(u => normalize(u.nome_usuario).includes(part));
            if (user) {
                console.log(`⚠️ Usuário encontrado por parte do nome: "${user.nome_usuario}" (ID: ${user.id}) para parte "${part}"`);
                return user;
            }
        }
        
        // ✅ v2.5: Busca reversa - nome do usuário contém parte do input
        for (const u of users) {
            const userNameParts = normalize(u.nome_usuario).split(' ').filter(p => p.length > 2);
            for (const userPart of userNameParts) {
                if (normalizedName.includes(userPart)) {
                    console.log(`⚠️ Usuário encontrado por busca reversa: "${u.nome_usuario}" (ID: ${u.id}) para "${name}"`);
                    return u;
                }
            }
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
            
            console.log('📄 Texto extraído do PDF:', text);
            
            // ✅ v2.5: Log das linhas para debug de DATA DE INÍCIO
            const debugLines = text.split('\n').map((l, idx) => `${idx}: ${l.trim()}`).join('\n');
            console.log('📋 Linhas do PDF:\n', debugLines);
            
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
                
                // Data de Início - ✅ CORREÇÃO v2.5: Múltiplos padrões de busca
                // IMPORTANTE: Não confundir com DATA EMISSÃO
                if (cleanLine.match(/DATA\s*(?:DE\s*)?INÍCIO/i) && !cleanLine.match(/EMISSÃO/i)) {
                    console.log(`🔍 Encontrado label DATA DE INÍCIO na linha: "${cleanLine}"`);
                    
                    // Pode estar na mesma linha ou na próxima
                    let match = cleanLine.match(/(\d{2}\/\d{2}\/\d{4})/);
                    if (match) {
                        console.log(`  → Data na mesma linha: ${match[1]}`);
                    }
                    
                    if (!match && nextLine) {
                        match = nextLine.match(/(\d{2}\/\d{2}\/\d{4})/);
                        if (match) {
                            console.log(`  → Data na próxima linha: ${match[1]}`);
                        }
                    }
                    
                    // Tentar também formato com hífen ou ponto
                    if (!match) {
                        match = cleanLine.match(/(\d{2}[-\.]\d{2}[-\.]\d{4})/);
                    }
                    
                    if (match && !startDateStr) {
                        startDateStr = match[1].replace(/[-\.]/g, '/');
                        console.log(`✅ Data de Início extraída (loop): ${startDateStr}`);
                    }
                }
                
                // ✅ v2.5: Buscar data isolada após "DATA DE INÍCIO" (formato do PDF pode separar)
                // Verificar se a linha anterior era DATA DE INÍCIO e esta linha é só a data
                if (!startDateStr && cleanLine.match(/^\d{2}\/\d{2}\/\d{4}$/) && i > 0) {
                    const prevLine = lines[i - 1] || '';
                    const prevPrevLine = lines[i - 2] || '';
                    
                    // Verificar se linha anterior ou duas linhas atrás contém DATA DE INÍCIO
                    if (prevLine.match(/DATA\s*(?:DE\s*)?INÍCIO/i) || prevPrevLine.match(/DATA\s*(?:DE\s*)?INÍCIO/i)) {
                        // Certificar que não é DATA EMISSÃO
                        if (!prevLine.match(/EMISSÃO/i) && !prevPrevLine.match(/EMISSÃO/i)) {
                            startDateStr = cleanLine;
                            console.log(`✅ Data de Início extraída (linha isolada): ${startDateStr}`);
                        }
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
                
                // Valor Pagamento - ✅ v2.6: Busca mais flexível com múltiplos padrões
                if (cleanLine.match(/^VALOR$/i) || cleanLine.match(/^VALOR\s*R\$/i) || cleanLine.match(/^VALOR\s*:\s*R?\$/i)) {
                    let match = cleanLine.match(/R?\$?\s*([\d.,]+)/i);
                    if (!match && nextLine) {
                        match = nextLine.match(/R?\$?\s*([\d.,]+)/);
                    }
                    if (match && !valorPagamentoStr) {
                        valorPagamentoStr = match[1];
                        console.log(`✅ Valor Pagamento extraído (label VALOR): ${valorPagamentoStr}`);
                    }
                }
                
                // ✅ v2.6: Detectar valor monetário isolado (R$ 2.603,17) após label VALOR
                if (!valorPagamentoStr && cleanLine.match(/^R?\$?\s*[\d.,]+$/)) {
                    // Verificar se a linha anterior era VALOR
                    const prevLine = i > 0 ? lines[i - 1].trim() : '';
                    if (prevLine.match(/^VALOR$/i)) {
                        const match = cleanLine.match(/R?\$?\s*([\d.,]+)/);
                        if (match) {
                            valorPagamentoStr = match[1];
                            console.log(`✅ Valor Pagamento extraído (linha após VALOR): ${valorPagamentoStr}`);
                        }
                    }
                }
                
                // ✅ v2.6: Detectar formato "2.603,17" na seção de pagamento
                if (!valorPagamentoStr && inDadosPagamento && cleanLine.match(/^[\d.,]+$/)) {
                    const val = cleanLine.trim();
                    // Verificar se parece um valor monetário (tem vírgula ou ponto)
                    if (val.match(/[\d]+[.,][\d]+/)) {
                        valorPagamentoStr = val;
                        console.log(`✅ Valor Pagamento extraído (valor isolado seção): ${valorPagamentoStr}`);
                    }
                }
                
                // ✅ v2.4: Detectar valor com R$ na mesma linha do label
                if (!valorPagamentoStr && cleanLine.match(/VALOR\s*(?:MENSAL|PAGAMENTO)?\s*[:\-]?\s*R\$\s*([\d.,]+)/i)) {
                    const match = cleanLine.match(/R\$\s*([\d.,]+)/i);
                    if (match) {
                        valorPagamentoStr = match[1];
                        console.log(`✅ Valor extraído (formato R$): ${valorPagamentoStr}`);
                    }
                }
                
                // ✅ v2.4: Detectar valor monetário isolado após linha "VALOR"
                if (!valorPagamentoStr && cleanLine.match(/^R?\$?\s*[\d.,]+$/) && i > 0) {
                    const prevLine = lines[i - 1] || '';
                    if (prevLine.match(/^VALOR$/i)) {
                        const match = cleanLine.match(/R?\$?\s*([\d.,]+)/);
                        if (match) {
                            valorPagamentoStr = match[1];
                            console.log(`✅ Valor Pagamento extraído (linha seguinte): ${valorPagamentoStr}`);
                        }
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
                
                // ✅ FORMA DE CONTRATAÇÃO (PJ, CLT, etc.) - CORREÇÃO v2.3: Buscar em qualquer seção
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
                    if (modalidadeContratoStr) {
                        console.log(`✅ Modalidade de Contrato extraída: ${modalidadeContratoStr}`);
                    }
                }
                
                // ✅ v2.3: Detectar CLT isolado na linha (caso o PDF tenha formatação diferente)
                if (!modalidadeContratoStr && cleanLine.match(/^\s*CLT\s*$/i)) {
                    modalidadeContratoStr = 'CLT';
                    console.log(`✅ Modalidade CLT detectada (linha isolada)`);
                }
                if (!modalidadeContratoStr && cleanLine.match(/^\s*PJ\s*$/i)) {
                    modalidadeContratoStr = 'PJ';
                    console.log(`✅ Modalidade PJ detectada (linha isolada)`);
                }
                
                // ✅ INCLUSÃO REF.SUBSTITUIÇÃO (checkbox para substituição)
                if (cleanLine.match(/INCLUSÃO REF\.?\s*SUBSTITUIÇÃO/i)) {
                    substituicao = true;
                }
                
                // ✅ NOME DO PROFISSIONAL SUBSTITUÍDO - CORREÇÃO v2.3: Busca mais robusta
                if (cleanLine.match(/NOME DO PROFISSIONAL SUBSTITUÍDO/i) || cleanLine.match(/PROFISSIONAL SUBSTITUÍDO/i)) {
                    let valor = cleanLine.replace(/NOME DO PROFISSIONAL SUBSTITUÍDO\s*:?/i, '').replace(/PROFISSIONAL SUBSTITUÍDO\s*:?/i, '').trim();
                    
                    // Se o valor está vazio, pode estar na próxima linha
                    if ((!valor || valor === 'XXX' || valor === 'xxx' || valor.length < 3) && nextLine) {
                        // Verificar se a próxima linha não é outro campo
                        if (!nextLine.match(/^(OBSERVAÇÕES|NOTEBOOK|SMARTPHONE|DATA EMISSÃO|RECURSOS|GESTÃO)/i)) {
                            valor = nextLine.trim();
                        }
                    }
                    
                    // Se encontrou valor válido
                    if (valor && valor !== 'XXX' && valor !== 'xxx' && valor.length >= 3) {
                        // Limpar possíveis sufixos como "(Confidencial)"
                        valor = valor.replace(/\s*\(Confidencial\)/i, '').trim();
                        nomeSubstituidoStr = valor;
                        substituicao = true; // Se tem nome, é substituição
                        console.log(`✅ Nome Substituído extraído: ${nomeSubstituidoStr}`);
                        console.log(`✅ Substituição setada como TRUE`);
                    }
                }
                
                // ✅ OBSERVAÇÕES - CORREÇÃO v2.6: Capturar texto real, ignorar checkboxes
                if (cleanLine.match(/^OBSERVAÇÕES\s*:?/i)) {
                    let obs = cleanLine.replace(/^OBSERVAÇÕES\s*:?/i, '').trim();
                    console.log(`🔍 Encontrado label OBSERVAÇÕES, conteúdo inicial: "${obs}"`);
                    
                    // Continuar nas próximas linhas até encontrar campos de checkbox ou seção
                    let j = i + 1;
                    // Parar quando encontrar: NOTEBOOK, SMARTPHONE (checkboxes), ou campos de rodapé
                    // Note: NOTEBOOK pode vir sem ":" no texto extraído
                    const stopPatterns = /^(NOTEBOOK|SMARTPHONE|DATA EMISSÃO|RECURSOS HUMANOS|GERENTE|DIRETORIA|GESTÃO DE PESSOAS|NOME DO PROFISSIONAL|FORMA DE CONTRATAÇÃO|FATURÁVEL|DADOS PAGAMENTO|DADOS FATURAMENTO|CERTIFICAÇÃO)/i;
                    
                    while (j < lines.length) {
                        const nextObs = lines[j].trim();
                        
                        // Se encontrar padrão de parada, parar
                        if (nextObs.match(stopPatterns)) {
                            console.log(`🔍 Observações: parando em "${nextObs}"`);
                            break;
                        }
                        
                        // Se encontrar checkbox isolado (NÃO ou SIM sozinhos ou com parênteses), parar
                        if (nextObs.match(/^(NÃO|SIM)\s*(\(|\[|X|$)/i)) {
                            console.log(`🔍 Observações: parando em checkbox "${nextObs}"`);
                            break;
                        }
                        
                        // Se encontrar linha com "NÃO SIM" (checkbox), parar
                        if (nextObs.match(/NÃO\s+SIM/i)) {
                            console.log(`🔍 Observações: parando em checkbox NÃO SIM "${nextObs}"`);
                            break;
                        }
                        
                        // Se for texto de observação válido (não é checkbox), adicionar
                        if (nextObs && nextObs.length > 0 && 
                            !nextObs.match(/^(NÃO|SIM|X|\(\s*\)|\[\s*\]|XXX)$/i) &&
                            !nextObs.match(/^\s*:\s*$/)) {
                            obs += ' ' + nextObs;
                        }
                        j++;
                    }
                    
                    // Limpar o texto das observações
                    obs = obs.replace(/\s+/g, ' ').trim();
                    
                    // Remover qualquer checkbox que tenha sido capturado acidentalmente
                    obs = obs.replace(/NOTEBOOK\s*:?\s*NÃO.*/i, '').trim();
                    obs = obs.replace(/SMARTPHONE\s*:?\s*NÃO.*/i, '').trim();
                    obs = obs.replace(/\s*:\s*NÃO\s+SIM.*/i, '').trim();
                    
                    if (obs && obs.length > 10) {
                        observacoesStr = obs;
                        console.log(`✅ Observações extraídas (${obs.length} chars): ${observacoesStr}`);
                    } else {
                        console.log(`⚠️ Observações muito curtas ou vazias: "${obs}"`);
                    }
                    
                    // Verifica se nas observações menciona substituição
                    if (observacoesStr.match(/substitui|substituição|substituindo/i)) {
                        substituicao = true;
                        const subMatch = observacoesStr.match(/substitui(?:ção|ndo)?\s+(?:de\s+)?(?:o\s+|a\s+)?([A-Za-zÀ-ÿ\s]+?)(?:\.|,|$)/i);
                        if (subMatch && !nomeSubstituidoStr) {
                            nomeSubstituidoStr = subMatch[1].trim();
                            console.log(`✅ Nome substituído extraído das observações: ${nomeSubstituidoStr}`);
                        }
                    }
                }
                
                // ✅ v2.6: RECURSOS HUMANOS (Analista R&S) - Estratégia baseada em posição de coluna
                // A estrutura do PDF é uma tabela onde:
                // Linha de headers: DATA EMISSÃO | RECURSOS HUMANOS | GERENTE COMERCIAL | DIRETORIA | GESTÃO DE PESSOAS
                // Linha de valores: 12/01/2026 | LARISSA CONCEIÇÃO | MESSIAS OLIVEIRA | ... | PRISCILA
                // 
                // No texto extraído, pode aparecer como linhas separadas:
                // "RECURSOS HUMANOS"
                // "GERENTE COMERCIAL"
                // ... (outros headers)
                // "LARISSA CONCEIÇÃO" (valores)
                // ...
                
                if (cleanLine.match(/^RECURSOS HUMANOS$/i)) {
                    console.log(`🔍 Encontrado header RECURSOS HUMANOS na linha ${i}`);
                    
                    // Estratégia: Encontrar a posição desta coluna entre os headers
                    // e depois pegar o valor correspondente
                    
                    // Verificar se as próximas linhas são outros headers da tabela
                    const tableHeaders = ['RECURSOS HUMANOS', 'GERENTE COMERCIAL', 'DIRETORIA', 'GESTÃO DE PESSOAS'];
                    let headerIndex = 0; // RECURSOS HUMANOS é o primeiro (índice 0 após DATA EMISSÃO)
                    
                    // Procurar onde começam os valores (linha que NÃO é um header conhecido)
                    for (let k = i + 1; k < Math.min(i + 10, lines.length); k++) {
                        const testLine = lines[k].trim();
                        
                        // Se encontrou uma data, estamos na linha de valores
                        if (testLine.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
                            // A próxima linha após a data deve ser o valor de RECURSOS HUMANOS
                            if (k + 1 < lines.length) {
                                const valorRH = lines[k + 1].trim();
                                if (valorRH && valorRH.length > 3 && !valorRH.match(/GERENTE|DIRETORIA|GESTÃO|COMERCIAL|DATA|EMISSÃO/i)) {
                                    recursosHumanosStr = valorRH;
                                    console.log(`✅ Recursos Humanos extraído (posição após data): ${recursosHumanosStr}`);
                                }
                            }
                            break;
                        }
                        
                        // Se a linha é um nome próprio (não é header), pode ser o valor
                        if (!tableHeaders.some(h => testLine.toUpperCase().includes(h)) && 
                            !testLine.match(/DATA|EMISSÃO|NOTEBOOK|SMARTPHONE/i) &&
                            testLine.match(/^[A-Za-zÀ-ÿ\s]+$/) &&
                            testLine.length > 5) {
                            
                            // Verificar se não é um valor de outra coluna
                            // RECURSOS HUMANOS é a primeira coluna de nomes
                            // Contar quantos headers já passamos
                            let headersPassados = 0;
                            for (let m = i; m < k; m++) {
                                if (tableHeaders.some(h => lines[m].trim().toUpperCase() === h)) {
                                    headersPassados++;
                                }
                            }
                            
                            // Se passamos apenas "RECURSOS HUMANOS", este é o valor correto
                            if (headersPassados <= 1) {
                                recursosHumanosStr = testLine;
                                console.log(`✅ Recursos Humanos extraído (primeiro valor): ${recursosHumanosStr}`);
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
            
            // ✅ v2.6: Fallback para RECURSOS HUMANOS - baseado em posição de coluna
            if (!recursosHumanosStr) {
                const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                
                // Encontrar o índice do header "RECURSOS HUMANOS"
                let rhHeaderIndex = -1;
                let tableStartIndex = -1;
                
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].match(/^RECURSOS HUMANOS$/i)) {
                        rhHeaderIndex = i;
                        console.log(`🔍 Fallback: Header RECURSOS HUMANOS encontrado na linha ${i}`);
                        break;
                    }
                }
                
                if (rhHeaderIndex >= 0) {
                    // Contar quantos headers de tabela existem após RECURSOS HUMANOS
                    // até encontrar a linha com a data (DATA EMISSÃO valor)
                    const tableHeaders = ['GERENTE COMERCIAL', 'DIRETORIA', 'GESTÃO DE PESSOAS'];
                    let headersAfterRH = 0;
                    
                    for (let i = rhHeaderIndex + 1; i < Math.min(rhHeaderIndex + 10, lines.length); i++) {
                        const line = lines[i].toUpperCase();
                        
                        // Se encontrou a data, os valores começam aqui
                        if (lines[i].match(/^\d{2}\/\d{2}\/\d{4}$/)) {
                            tableStartIndex = i;
                            console.log(`🔍 Fallback: Data encontrada na linha ${i}, ${headersAfterRH} headers entre RH e data`);
                            break;
                        }
                        
                        // Contar headers
                        if (tableHeaders.some(h => line.includes(h))) {
                            headersAfterRH++;
                        }
                    }
                    
                    // O valor de RECURSOS HUMANOS é a primeira linha após a data
                    // (índice = tableStartIndex + 1)
                    if (tableStartIndex >= 0 && tableStartIndex + 1 < lines.length) {
                        const valorRH = lines[tableStartIndex + 1];
                        if (valorRH && valorRH.length > 3 && 
                            valorRH.match(/^[A-Za-zÀ-ÿ\s]+$/) &&
                            !valorRH.match(/GERENTE|DIRETORIA|GESTÃO|COMERCIAL/i)) {
                            recursosHumanosStr = valorRH;
                            console.log(`✅ Recursos Humanos extraído (fallback posição): ${recursosHumanosStr}`);
                        }
                    }
                }
            }
            
            // ✅ v2.5: Fallback para DATA DE INÍCIO - MUITO ESPECÍFICO
            if (!startDateStr) {
                // Estratégia 1: Buscar "DATA DE INÍCIO" seguido de data (com ou sem quebra de linha)
                let dataInicioMatch = text.match(/DATA\s*DE\s*INÍCIO[\s\n:]*(\d{2}\/\d{2}\/\d{4})/i);
                
                // Estratégia 2: Buscar "DATA INÍCIO" (sem "DE")
                if (!dataInicioMatch) {
                    dataInicioMatch = text.match(/DATA\s*INÍCIO[\s\n:]*(\d{2}\/\d{2}\/\d{4})/i);
                }
                
                // Estratégia 3: Buscar linha que começa com data após "DATA DE INÍCIO"
                if (!dataInicioMatch) {
                    const lines = text.split('\n');
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].match(/DATA\s*(?:DE\s*)?INÍCIO/i)) {
                            // Verificar se a data está na mesma linha
                            const sameLine = lines[i].match(/(\d{2}\/\d{2}\/\d{4})/);
                            if (sameLine) {
                                dataInicioMatch = sameLine;
                                break;
                            }
                            // Verificar próximas 3 linhas
                            for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
                                const nextMatch = lines[j].trim().match(/^(\d{2}\/\d{2}\/\d{4})$/);
                                if (nextMatch) {
                                    dataInicioMatch = nextMatch;
                                    break;
                                }
                            }
                            if (dataInicioMatch) break;
                        }
                    }
                }
                
                // NÃO usar fallback genérico da seção DADOS PAGAMENTO (pode pegar DATA EMISSÃO)
                
                if (dataInicioMatch) {
                    startDateStr = dataInicioMatch[1];
                    console.log(`✅ Data de Início extraída (fallback específico): ${startDateStr}`);
                }
            }
            
            // ✅ v2.4: Fallback para MODALIDADE DE CONTRATO - busca global
            if (!modalidadeContratoStr) {
                // Buscar padrão "FORMA DE CONTRATAÇÃO ... CLT" ou "... PJ"
                if (text.match(/FORMA DE CONTRATAÇÃO[\s\S]{0,50}CLT/i) || text.match(/\bCLT\b/)) {
                    modalidadeContratoStr = 'CLT';
                    console.log(`✅ Modalidade CLT extraída (fallback global)`);
                } else if (text.match(/FORMA DE CONTRATAÇÃO[\s\S]{0,50}PJ/i)) {
                    modalidadeContratoStr = 'PJ';
                    console.log(`✅ Modalidade PJ extraída (fallback global)`);
                }
            }
            
            // ✅ v2.6: Fallback para VALOR PAGAMENTO - múltiplas estratégias
            if (!valorPagamentoStr) {
                console.log('🔍 Fallback: Buscando VALOR PAGAMENTO...');
                
                // Estratégia 1: Buscar após "VALOR" na seção DADOS PAGAMENTO
                let valorMatch = text.match(/DADOS PAGAMENTO[\s\S]*?VALOR[\s\n:]*R?\$?\s*([\d.,]+)/i);
                
                // Estratégia 2: Buscar "VALOR" seguido de número (qualquer lugar)
                if (!valorMatch) {
                    valorMatch = text.match(/\bVALOR\s*[\n:]+\s*R?\$?\s*([\d.,]+)/i);
                }
                
                // Estratégia 3: Buscar linha após "VALOR" que contenha número
                if (!valorMatch) {
                    const lines = text.split('\n');
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].trim().match(/^VALOR$/i)) {
                            // Verificar próximas 3 linhas
                            for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
                                const testLine = lines[j].trim();
                                const numMatch = testLine.match(/^R?\$?\s*([\d.,]+)$/);
                                if (numMatch) {
                                    valorMatch = numMatch;
                                    console.log(`🔍 Fallback: VALOR encontrado na linha ${j}: ${testLine}`);
                                    break;
                                }
                            }
                            if (valorMatch) break;
                        }
                    }
                }
                
                // Estratégia 4: Buscar qualquer R$ X.XXX,XX na seção DADOS PAGAMENTO
                if (!valorMatch) {
                    const pagamentoSection = text.match(/DADOS PAGAMENTO[\s\S]*?(?:DADOS FATURAMENTO|NOTEBOOK|SMARTPHONE|$)/i);
                    if (pagamentoSection) {
                        valorMatch = pagamentoSection[0].match(/R\$\s*([\d.,]+)/i);
                        if (valorMatch) {
                            console.log(`🔍 Fallback: R$ encontrado na seção DADOS PAGAMENTO: ${valorMatch[1]}`);
                        }
                    }
                }
                
                // Estratégia 5: Buscar formato "2.603,17" (número com vírgula decimal) na seção
                if (!valorMatch) {
                    const lines = text.split('\n');
                    let inPagamento = false;
                    for (const line of lines) {
                        if (line.match(/DADOS PAGAMENTO/i)) inPagamento = true;
                        if (line.match(/DADOS FATURAMENTO|NOTEBOOK|SMARTPHONE/i)) inPagamento = false;
                        
                        if (inPagamento) {
                            const numMatch = line.trim().match(/^([\d]+\.[\d]+,[\d]+)$/);
                            if (numMatch) {
                                valorMatch = numMatch;
                                console.log(`🔍 Fallback: Valor formato X.XXX,XX encontrado: ${numMatch[1]}`);
                                break;
                            }
                        }
                    }
                }
                
                if (valorMatch) {
                    valorPagamentoStr = valorMatch[1];
                    console.log(`✅ Valor Pagamento extraído (fallback): ${valorPagamentoStr}`);
                } else {
                    console.log(`⚠️ Valor Pagamento NÃO encontrado em nenhuma estratégia`);
                }
            }
            
            // ✅ v2.4: Fallback para NOME SUBSTITUÍDO - busca global
            if (!nomeSubstituidoStr) {
                const subMatch = text.match(/(?:NOME DO PROFISSIONAL SUBSTITUÍDO|PROFISSIONAL SUBSTITUÍDO)[:\s]*([A-Za-zÀ-ÿ\s]+?)(?:\(|OBSERVAÇÕES|NOTEBOOK|NÃO|SIM|$)/i);
                if (subMatch) {
                    const nome = subMatch[1].trim().replace(/\s*\(Confidencial\)/i, '').trim();
                    if (nome && nome.length >= 3 && nome !== 'XXX') {
                        nomeSubstituidoStr = nome;
                        substituicao = true;
                        console.log(`✅ Nome Substituído extraído (fallback): ${nomeSubstituidoStr}`);
                    }
                }
            }
            
            // ✅ v2.6: Fallback para OBSERVAÇÕES - capturar texto real
            if (!observacoesStr) {
                console.log('🔍 Fallback: Buscando OBSERVAÇÕES...');
                
                // O texto de observações está em um campo amarelo no PDF
                // Geralmente começa com palavras como "ATUARÁ", "UTILIZARÁ", "GESTÃO", "FAVOR", "EM CASO"
                
                // Estratégia 1: Buscar texto após "OBSERVAÇÕES:" até "NOTEBOOK"
                const obsPatterns = [
                    // Padrão 1: OBSERVAÇÕES seguido de texto até NOTEBOOK (sem ":")
                    /OBSERVAÇÕES\s*:?\s*([\s\S]+?)(?=NOTEBOOK|SMARTPHONE|NOME DO PROFISSIONAL)/i,
                    // Padrão 2: Texto que começa com palavras típicas de observações
                    /OBSERVAÇÕES\s*:?\s*((?:ATUARÁ|UTILIZARÁ|GESTÃO|FAVOR|EM CASO|DEVERÁ|IMPORTANTE)[^]*?)(?=NOTEBOOK|SMARTPHONE)/i,
                    // Padrão 3: Texto em maiúsculas após OBSERVAÇÕES
                    /OBSERVAÇÕES\s*:?\s*([A-Z][A-ZÀÁÂÃÉÊÍÓÔÕÚÇ\s,.:;\-\(\)0-9]{20,})/i
                ];
                
                for (const pattern of obsPatterns) {
                    const obsMatch = text.match(pattern);
                    if (obsMatch) {
                        let obs = obsMatch[1]
                            .replace(/\n/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim();
                        
                        // Limpar checkboxes capturados acidentalmente
                        obs = obs.replace(/NOTEBOOK\s*:?\s*NÃO.*/i, '').trim();
                        obs = obs.replace(/SMARTPHONE\s*:?\s*NÃO.*/i, '').trim();
                        obs = obs.replace(/\s*:?\s*NÃO\s+SIM.*/i, '').trim();
                        obs = obs.replace(/\s*NÃO\s*SIM\s*$/i, '').trim();
                        obs = obs.replace(/\s*\(\s*\)\s*\(\s*\)\s*$/i, '').trim();
                        obs = obs.replace(/CERTIFICAÇÃO\s*:?\s*XXX.*/i, '').trim();
                        
                        if (obs && obs.length > 20) {
                            observacoesStr = obs;
                            console.log(`✅ Observações extraídas (fallback ${pattern.toString().substring(0, 30)}...): ${observacoesStr}`);
                            break;
                        }
                    }
                }
                
                if (!observacoesStr) {
                    console.log(`⚠️ Observações NÃO encontradas em nenhum padrão`);
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
