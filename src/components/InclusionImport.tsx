// src/components/InclusionImport.tsx
// ✅ v3.0 - Versão limpa com foco nos campos problemáticos:
// - RECURSOS HUMANOS: Busca específica pelo header e posição
// - OBSERVAÇÕES: Captura até NOTEBOOK (sem dois pontos)
// - VALOR PAGAMENTO: Busca após DADOS PAGAMENTO
// - DATA DE INÍCIO: Busca específica (não confundir com DATA EMISSÃO)

import React, { useState } from 'react';
import { Client, User, UsuarioCliente, CoordenadorCliente } from '@/types';
import * as pdfjsLib from 'pdfjs-dist';

// ✅ CORREÇÃO: Configurar worker para ESModules (Vite)
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// Suppress console warnings from pdf.js
if (typeof window !== 'undefined') {
    const originalWarn = console.warn;
    console.warn = (...args) => {
        if (args[0]?.includes?.('pdf.js')) return;
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
        
        // Busca exata
        let user = users.find(u => normalize(u.nome_usuario) === normalizedName);
        if (user) {
            console.log(`✅ Usuário encontrado (exato): ${user.nome_usuario} (ID: ${user.id})`);
            return user;
        }
        
        // Busca por primeiro nome
        const firstName = normalizedName.split(' ')[0];
        user = users.find(u => normalize(u.nome_usuario).startsWith(firstName));
        if (user) {
            console.log(`✅ Usuário encontrado (primeiro nome): ${user.nome_usuario} (ID: ${user.id})`);
            return user;
        }
        
        // Busca contém
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

            // Log das linhas para debug
            console.log('📋 Total de linhas:', lines.length);

            for (let i = 0; i < lines.length; i++) {
                const cleanLine = lines[i];
                const nextLine = lines[i + 1] || '';
                
                // Detectar seções
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
                
                // ===== NOME DO CONSULTOR =====
                if (cleanLine.match(/^NOME:/i) && 
                    !cleanLine.match(/SOLICITANTE|BANCO|EMERGÊNCIA|PROFISSIONAL SUBSTITUÍDO/i) &&
                    !inInformacoesEmergencia) {
                    const extractedName = cleanLine.replace(/^NOME:/i, '').trim();
                    if (extractedName && extractedName !== 'XXX' && !extractedName.match(/Banco|Inter|Itaú|Bradesco|Santander|Caixa/i)) {
                        consultantName = extractedName;
                        console.log(`✅ Nome extraído: ${consultantName}`);
                    }
                }
                
                // ===== FUNÇÃO/CARGO =====
                if (cleanLine.match(/^FUNÇÃO:/i)) {
                    role = cleanLine.replace(/^FUNÇÃO:/i, '').trim();
                    role = role.replace(/\s*SR\s*\(\s*X?\s*\)|\s*PL\s*\(\s*X?\s*\)|\s*JR\s*\(\s*X?\s*\)/gi, '').trim();
                }
                
                // ===== DATA DE INÍCIO (NÃO confundir com DATA EMISSÃO) =====
                if (cleanLine.match(/^DATA DE INÍCIO$/i) || cleanLine.match(/^DATA INÍCIO$/i)) {
                    console.log(`🔍 Encontrado label DATA DE INÍCIO na linha ${i}`);
                    // A data está na próxima linha
                    if (nextLine && nextLine.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
                        startDateStr = nextLine;
                        console.log(`✅ Data de Início extraída: ${startDateStr}`);
                    }
                }
                // Também verificar se a data está na mesma linha
                if (cleanLine.match(/DATA DE INÍCIO.*?(\d{2}\/\d{2}\/\d{4})/i)) {
                    const match = cleanLine.match(/(\d{2}\/\d{2}\/\d{4})/);
                    if (match && !startDateStr) {
                        startDateStr = match[1];
                        console.log(`✅ Data de Início extraída (mesma linha): ${startDateStr}`);
                    }
                }
                
                // ===== CELULAR =====
                if (cleanLine.match(/TELEFONE CELULAR\s*:/i)) {
                    const match = cleanLine.match(/TELEFONE CELULAR\s*:\s*([\d\s\-]+)/i);
                    if (match) celularStr = match[1].replace(/\s/g, '');
                }
                
                // ===== CPF =====
                if (cleanLine.match(/^CPF:/i) || cleanLine.match(/^CPF\s*:/i)) {
                    cpfStr = cleanLine.replace(/^CPF\s*:/i, '').trim();
                }
                
                // ===== EMAIL =====
                if ((cleanLine.match(/^E-?MAIL\s*:/i) || cleanLine.match(/^EMAIL\s*:/i)) && 
                    !cleanLine.match(/SOLICITANTE/i) &&
                    !inInformacoesEmergencia) {
                    const match = cleanLine.match(/E-?MAIL\s*:\s*([^\s]+@[^\s]+)/i);
                    if (match) {
                        const extractedEmail = match[1].toLowerCase();
                        const isClientEmail = extractedEmail.match(/@(icesp|fastshop|techfor|cliente|empresa)/i);
                        const isPersonalEmail = extractedEmail.match(/@(gmail|hotmail|outlook|yahoo|live|uol|bol|terra|ig|globo|icloud)/i);
                        
                        if (!isClientEmail || isPersonalEmail) {
                            if (!emailStr || isPersonalEmail) {
                                emailStr = extractedEmail;
                                console.log(`✅ Email extraído: ${emailStr}`);
                            }
                        } else {
                            console.log(`⚠️ Email ignorado (cliente): ${extractedEmail}`);
                        }
                    }
                }
                
                // ===== CNPJ =====
                if (cleanLine.match(/^CNPJ:/i)) {
                    cnpjStr = cleanLine.replace(/^CNPJ:/i, '').trim();
                    if (cnpjStr === 'XXX') cnpjStr = '';
                }
                
                // ===== EMPRESA =====
                if (cleanLine.match(/^EMPRESA:/i) && !cleanLine.match(/ENDEREÇO EMPRESA/i)) {
                    empresaStr = cleanLine.replace(/^EMPRESA:/i, '').trim();
                    if (empresaStr === 'XXX') empresaStr = '';
                }
                
                // ===== DATA NASCIMENTO =====
                if (cleanLine.match(/^DT NASCIMENTO:/i)) {
                    const match = cleanLine.match(/(\d{2}\/\d{2}\/\d{4})/);
                    if (match) dtAniversarioStr = match[1];
                }
                
                // ===== TECNOLOGIA =====
                if (cleanLine.match(/^TECNOLOGIA:/i)) {
                    especialidadeStr = cleanLine.replace(/^TECNOLOGIA:/i, '').trim();
                }
                
                // ===== FATURAMENTO MENSAL =====
                if (cleanLine.match(/FATURAMENTO MENSAL/i)) {
                    let match = cleanLine.match(/R?\$?\s*([\d.,]+)/i);
                    if (!match && nextLine) {
                        match = nextLine.match(/R?\$?\s*([\d.,]+)/);
                    }
                    if (match) hourlyRateStr = match[1];
                }
                
                // ===== VALOR PAGAMENTO =====
                if (cleanLine === 'VALOR' && inDadosPagamento) {
                    console.log(`🔍 Encontrado label VALOR na seção DADOS PAGAMENTO (linha ${i})`);
                    // Procurar o valor nas próximas linhas
                    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
                        const testLine = lines[j].trim();
                        // Se for um número monetário
                        if (testLine.match(/^R?\$?\s*[\d.,]+$/) || testLine.match(/^[\d]+[.,][\d]+$/)) {
                            valorPagamentoStr = testLine.replace(/R\$\s*/, '');
                            console.log(`✅ Valor Pagamento extraído: ${valorPagamentoStr}`);
                            break;
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
                // Detectar CLT isolado
                if (!modalidadeContratoStr && cleanLine === 'CLT') {
                    modalidadeContratoStr = 'CLT';
                    console.log(`✅ Modalidade CLT detectada (linha isolada)`);
                }
                
                // ===== SUBSTITUIÇÃO =====
                if (cleanLine.match(/INCLUSÃO REF\.?\s*SUBSTITUIÇÃO/i)) {
                    substituicao = true;
                }
                
                // ===== NOME DO PROFISSIONAL SUBSTITUÍDO =====
                if (cleanLine.match(/NOME DO PROFISSIONAL SUBSTITUÍDO/i)) {
                    let valor = cleanLine.replace(/NOME DO PROFISSIONAL SUBSTITUÍDO\s*:?/i, '').trim();
                    // Se vazio, tentar próxima linha
                    if ((!valor || valor === 'XXX') && nextLine && !nextLine.match(/OBSERVAÇÕES|NOTEBOOK|SMARTPHONE/i)) {
                        valor = nextLine.trim();
                    }
                    if (valor && valor !== 'XXX' && valor.length >= 3) {
                        nomeSubstituidoStr = valor;
                        substituicao = true;
                        console.log(`✅ Nome Substituído: ${nomeSubstituidoStr}`);
                    }
                }
                
                // ===== OBSERVAÇÕES =====
                if (cleanLine.match(/^OBSERVAÇÕES\s*:?$/i) || cleanLine.match(/^OBSERVAÇÕES\s*:/i)) {
                    console.log(`🔍 Encontrado label OBSERVAÇÕES na linha ${i}`);
                    let obs = cleanLine.replace(/^OBSERVAÇÕES\s*:?/i, '').trim();
                    
                    // Capturar próximas linhas até NOTEBOOK ou SMARTPHONE
                    let j = i + 1;
                    while (j < lines.length) {
                        const nextObs = lines[j].trim();
                        
                        // Parar se encontrar NOTEBOOK ou SMARTPHONE
                        if (nextObs.match(/^NOTEBOOK/i) || nextObs.match(/^SMARTPHONE/i)) {
                            console.log(`🔍 Observações: parando em "${nextObs}"`);
                            break;
                        }
                        
                        // Adicionar texto
                        if (nextObs && nextObs.length > 0) {
                            obs += ' ' + nextObs;
                        }
                        j++;
                    }
                    
                    obs = obs.replace(/\s+/g, ' ').trim();
                    
                    if (obs && obs.length > 10) {
                        observacoesStr = obs;
                        console.log(`✅ Observações extraídas (${obs.length} chars): ${observacoesStr.substring(0, 100)}...`);
                    }
                }
                
                // ===== RECURSOS HUMANOS =====
                // Quando encontrar o header "RECURSOS HUMANOS", buscar o valor correspondente
                if (cleanLine === 'RECURSOS HUMANOS') {
                    console.log(`🔍 Encontrado header RECURSOS HUMANOS na linha ${i}`);
                    
                    // A estrutura do PDF no rodapé é:
                    // DATA EMISSÃO | RECURSOS HUMANOS | GERENTE COMERCIAL | DIRETORIA | GESTÃO DE PESSOAS
                    // 12/01/2026   | LARISSA CONCEIÇÃO| MESSIAS OLIVEIRA | ...       | PRISCILA
                    
                    // Precisamos encontrar a linha com a data e pegar o valor da coluna RECURSOS HUMANOS
                    // No texto extraído, cada célula é uma linha separada
                    
                    // Procurar a data de emissão
                    for (let k = i + 1; k < Math.min(i + 15, lines.length); k++) {
                        const testLine = lines[k].trim();
                        
                        // Se encontrou a data de emissão
                        if (testLine.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
                            console.log(`🔍 Data de emissão encontrada na linha ${k}: ${testLine}`);
                            
                            // O próximo nome (não header) é o valor de RECURSOS HUMANOS
                            if (k + 1 < lines.length) {
                                const valorRH = lines[k + 1].trim();
                                // Verificar se é um nome válido
                                if (valorRH && 
                                    valorRH.length > 3 &&
                                    valorRH.match(/^[A-Za-zÀ-ÿ\s]+$/) &&
                                    !valorRH.match(/^(GERENTE|DIRETORIA|GESTÃO|DATA|RECURSOS|COMERCIAL)/i)) {
                                    recursosHumanosStr = valorRH;
                                    console.log(`✅ Recursos Humanos extraído: ${recursosHumanosStr}`);
                                }
                            }
                            break;
                        }
                    }
                }
            }
            
            // ===== FALLBACKS =====
            
            // Fallback para Nome
            if (!consultantName) {
                const allLines = text.split('\n');
                for (const line of allLines) {
                    if (line.match(/^NOME:\s*[A-Za-zÀ-ÿ]/i) && !line.match(/SOLICITANTE|BANCO|EMERGÊNCIA/i)) {
                        const extracted = line.replace(/^NOME:/i, '').trim();
                        if (extracted && extracted !== 'XXX' && extracted.length > 3) {
                            consultantName = extracted;
                            console.log(`✅ Nome extraído (fallback): ${consultantName}`);
                            break;
                        }
                    }
                }
            }
            
            // Fallback para Email
            if (!emailStr) {
                const emailMatches = text.match(/[a-zA-Z0-9._%+-]+@(gmail|hotmail|outlook|yahoo|live|uol|bol|terra|ig|globo|icloud)\.[a-zA-Z]{2,}/gi);
                if (emailMatches && emailMatches.length > 0) {
                    emailStr = emailMatches[0].toLowerCase();
                    console.log(`✅ Email extraído (fallback): ${emailStr}`);
                }
            }
            
            // Fallback para DATA DE INÍCIO
            if (!startDateStr) {
                // Buscar especificamente "DATA DE INÍCIO" seguido de data
                const dataMatch = text.match(/DATA\s*(?:DE\s*)?INÍCIO[\s\n]*(\d{2}\/\d{2}\/\d{4})/i);
                if (dataMatch) {
                    startDateStr = dataMatch[1];
                    console.log(`✅ Data de Início extraída (fallback regex): ${startDateStr}`);
                }
            }
            
            // Fallback para VALOR PAGAMENTO
            if (!valorPagamentoStr) {
                // Buscar na seção DADOS PAGAMENTO
                const pagamentoMatch = text.match(/DADOS PAGAMENTO[\s\S]*?VALOR[\s\n]*R?\$?\s*([\d.,]+)/i);
                if (pagamentoMatch) {
                    valorPagamentoStr = pagamentoMatch[1];
                    console.log(`✅ Valor Pagamento extraído (fallback): ${valorPagamentoStr}`);
                }
            }
            
            // Fallback para RECURSOS HUMANOS
            if (!recursosHumanosStr) {
                // Procurar no texto o padrão de tabela
                const rhMatch = text.match(/RECURSOS HUMANOS[\s\S]*?(\d{2}\/\d{2}\/\d{4})\s*\n\s*([A-Za-zÀ-ÿ\s]+?)(?:\n|GERENTE|MESSIAS)/i);
                if (rhMatch && rhMatch[2]) {
                    const nome = rhMatch[2].trim();
                    if (nome.length > 3 && !nome.match(/GERENTE|COMERCIAL|DIRETORIA/i)) {
                        recursosHumanosStr = nome;
                        console.log(`✅ Recursos Humanos extraído (fallback): ${recursosHumanosStr}`);
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
                const cleaned = value.replace(/[^\d,.-]/g, '').replace(',', '.');
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
            
            const startDateObj = new Date(startDate);
            const anoVigencia = startDateObj.getFullYear();

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
