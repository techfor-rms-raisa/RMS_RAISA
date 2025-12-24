import React, { useState, useRef } from 'react';
import { Client, UsuarioCliente, CoordenadorCliente, User, ConsultantStatus, TerminationReason } from '@/types';

interface ConsultantCSVImportProps {
    clients: Client[];
    managers: UsuarioCliente[];
    coordinators: CoordenadorCliente[];
    users: User[];
    onImportBatch: (consultantsData: any[]) => void;
}

interface ImportResult {
    success: number;
    errors: string[];
    warnings: string[];
}

interface ParsedConsultant {
    rowNumber: number;
    data: any;
    errors: string[];
    warnings: string[];
}

const ConsultantCSVImport: React.FC<ConsultantCSVImportProps> = ({ 
    clients, 
    managers, 
    coordinators, 
    users,
    onImportBatch 
}) => {
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<ImportResult | null>(null);
    const [previewData, setPreviewData] = useState<ParsedConsultant[]>([]);
    const [showPreview, setShowPreview] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ===== FUNÇÕES DE NORMALIZAÇÃO =====
    
    const normalize = (str: any): string => {
        if (!str) return '';
        return String(str)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    };

    const cleanText = (str: any): string => {
        if (!str || str === 'null' || str === 'undefined') return '';
        return String(str).trim();
    };

    /**
     * Limpa e valida CPF - máximo 14 caracteres (XXX.XXX.XXX-XX)
     * Remove espaços extras e caracteres inválidos
     */
    const cleanCPF = (cpf: any): string | null => {
        if (!cpf || cpf === 'null' || cpf === 'undefined' || cpf === '***') return null;
        
        let cleaned = String(cpf).trim();
        
        // Se estiver vazio após trim, retorna null
        if (!cleaned) return null;
        
        // Remove espaços internos
        cleaned = cleaned.replace(/\s+/g, '');
        
        // Se for apenas números, formata como CPF
        const onlyNumbers = cleaned.replace(/\D/g, '');
        if (onlyNumbers.length === 11) {
            cleaned = `${onlyNumbers.slice(0,3)}.${onlyNumbers.slice(3,6)}.${onlyNumbers.slice(6,9)}-${onlyNumbers.slice(9,11)}`;
        }
        
        // Corrige formato errado (ponto em vez de hífen no final): XXX.XXX.XXX.XX -> XXX.XXX.XXX-XX
        if (/^\d{3}\.\d{3}\.\d{3}\.\d{2}$/.test(cleaned)) {
            cleaned = cleaned.slice(0, 11) + '-' + cleaned.slice(12);
        }
        
        // Garantir que não exceda 14 caracteres
        if (cleaned.length > 14) {
            cleaned = cleaned.slice(0, 14);
        }
        
        return cleaned || null;
    };

    /**
     * Limpa e valida CNPJ - máximo 18 caracteres (XX.XXX.XXX/XXXX-XX)
     * Remove espaços extras e caracteres inválidos
     */
    const cleanCNPJ = (cnpj: any): string | null => {
        if (!cnpj || cnpj === 'null' || cnpj === 'undefined' || cnpj === '***') return null;
        
        let cleaned = String(cnpj).trim();
        
        // Se estiver vazio após trim, retorna null
        if (!cleaned) return null;
        
        // Remove espaços internos
        cleaned = cleaned.replace(/\s+/g, '');
        
        // Remove aspas que possam ter sobrado do CSV
        cleaned = cleaned.replace(/"/g, '');
        
        // Se for apenas números, formata como CNPJ
        const onlyNumbers = cleaned.replace(/\D/g, '');
        if (onlyNumbers.length === 14) {
            cleaned = `${onlyNumbers.slice(0,2)}.${onlyNumbers.slice(2,5)}.${onlyNumbers.slice(5,8)}/${onlyNumbers.slice(8,12)}-${onlyNumbers.slice(12,14)}`;
        }
        
        // Garantir que não exceda 18 caracteres
        if (cleaned.length > 18) {
            cleaned = cleaned.slice(0, 18);
        }
        
        return cleaned || null;
    };

    /**
     * Limpa telefone/celular - remove caracteres especiais extras
     */
    const cleanPhone = (phone: any): string | null => {
        if (!phone || phone === 'null' || phone === 'undefined') return null;
        
        let cleaned = String(phone).trim();
        if (!cleaned) return null;
        
        // Remove espaços extras mas mantém formato legível
        cleaned = cleaned.replace(/\s+/g, ' ').trim();
        
        return cleaned || null;
    };

    // ===== CONVERSÕES DE FORMATO =====
    
    /**
     * Converte data serial do Excel para YYYY-MM-DD
     * Excel usa dias desde 01/01/1900 (com bug do ano bissexto de 1900)
     */
    const excelSerialToDate = (serial: any): string | null => {
        if (!serial || serial === 'null' || serial === '') return null;
        
        // Se já é uma data no formato DD/MM/YYYY
        if (typeof serial === 'string' && serial.includes('/')) {
            const parts = serial.split('/');
            if (parts.length === 3) {
                return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
        }
        
        const num = parseFloat(serial);
        if (isNaN(num)) return null;
        
        // Excel serial date: dias desde 01/01/1900
        // Ajuste para o bug do Excel (considera 1900 como ano bissexto)
        const excelEpoch = new Date(1899, 11, 30); // 30/12/1899
        const date = new Date(excelEpoch.getTime() + num * 24 * 60 * 60 * 1000);
        
        return date.toISOString().split('T')[0];
    };

    /**
     * Converte data BR (DD/MM/YYYY) para YYYY-MM-DD
     */
    const dateBRToISO = (dateBR: string): string | null => {
        if (!dateBR || dateBR === 'null') return null;
        
        const parts = dateBR.trim().split('/');
        if (parts.length !== 3) return null;
        
        const [day, month, year] = parts;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    };

    /**
     * Converte valor monetário BR para número
     * "69,61" -> 69.61
     * "1.234,56" -> 1234.56
     */
    const parseCurrencyBR = (value: any): number | null => {
        if (!value || value === 'null' || value === '') return null;
        
        const str = String(value).trim();
        // Remove pontos de milhar e substitui vírgula por ponto
        const normalized = str.replace(/\./g, '').replace(',', '.');
        const num = parseFloat(normalized);
        
        return isNaN(num) ? null : num;
    };

    /**
     * Converte texto "true"/"false" para boolean
     */
    const parseBoolean = (value: any): boolean => {
        if (typeof value === 'boolean') return value;
        if (!value || value === 'null') return true; // Default: ativo
        return String(value).toLowerCase() === 'true';
    };

    /**
     * Valida e normaliza status
     */
    const parseStatus = (value: any): ConsultantStatus => {
        const normalized = cleanText(value).toLowerCase();
        if (normalized === 'perdido') return 'Perdido';
        if (normalized === 'encerrado') return 'Encerrado';
        return 'Ativo';
    };

    /**
     * Valida e normaliza motivo de desligamento
     */
    const parseTerminationReason = (value: any): TerminationReason | null => {
        if (!value || value === 'null' || value === '') return null;
        
        const text = cleanText(value);
        const validReasons: TerminationReason[] = [
            'Baixa Performance Técnica',
            'Problemas Comportamentais',
            'Excesso de Faltas e Atrasos',
            'Baixa Produtividade',
            'Não Cumprimento de Atividades',
            'Performance Técnica e Comportamental',
            'Abandono de Função',
            'Internalizado pelo Cliente',
            'Oportunidade Financeira',
            'Oportunidade de Carreira',
            'Outros'
        ];
        
        // Busca exata
        const exactMatch = validReasons.find(r => normalize(r) === normalize(text));
        if (exactMatch) return exactMatch;
        
        // Busca parcial
        const partialMatch = validReasons.find(r => 
            normalize(r).includes(normalize(text)) || normalize(text).includes(normalize(r))
        );
        if (partialMatch) return partialMatch;
        
        return 'Outros';
    };

    // ===== FUNÇÕES DE BUSCA DE RELACIONAMENTOS =====

    /**
     * Busca cliente por razão social
     */
    const findClientByName = (name: string): Client | null => {
        if (!name) return null;
        const normalizedName = normalize(name);
        return clients.find(c => normalize(c.razao_social_cliente) === normalizedName) || null;
    };

    /**
     * Busca gestor por nome dentro de um cliente
     */
    const findManagerByName = (name: string, clientId: number): { manager: UsuarioCliente | null; warning?: string } => {
        if (!name) return { manager: null };
        
        const normalizedName = normalize(name);
        const clientManagers = managers.filter(m => m.id_cliente === clientId);
        
        // Busca exata
        let manager = clientManagers.find(m => normalize(m.nome_gestor_cliente) === normalizedName);
        if (manager) return { manager };
        
        // Busca parcial (primeiro nome)
        const firstName = normalizedName.split(' ')[0];
        manager = clientManagers.find(m => normalize(m.nome_gestor_cliente).startsWith(firstName));
        if (manager) {
            return { 
                manager, 
                warning: `Gestor "${name}" encontrado por aproximação como "${manager.nome_gestor_cliente}"` 
            };
        }
        
        // Fallback: primeiro gestor ativo
        const activeManager = clientManagers.find(m => m.ativo);
        if (activeManager) {
            return { 
                manager: activeManager, 
                warning: `Gestor "${name}" não encontrado. Usando "${activeManager.nome_gestor_cliente}" como fallback` 
            };
        }
        
        return { manager: null };
    };

    /**
     * Busca coordenador por nome dentro de um gestor
     */
    const findCoordinatorByName = (name: string, managerId: number): { coordinator: CoordenadorCliente | null; warning?: string } => {
        if (!name) return { coordinator: null };
        
        const normalizedName = normalize(name);
        const managerCoordinators = coordinators.filter(c => c.id_gestor_cliente === managerId);
        
        // Busca exata
        let coordinator = managerCoordinators.find(c => normalize(c.nome_coordenador_cliente) === normalizedName);
        if (coordinator) return { coordinator };
        
        // Busca parcial
        const firstName = normalizedName.split(' ')[0];
        coordinator = managerCoordinators.find(c => normalize(c.nome_coordenador_cliente).startsWith(firstName));
        if (coordinator) {
            return { 
                coordinator, 
                warning: `Coordenador "${name}" encontrado por aproximação como "${coordinator.nome_coordenador_cliente}"` 
            };
        }
        
        return { coordinator: null };
    };

    /**
     * Busca usuário por email
     */
    const findUserByEmail = (email: string): User | null => {
        if (!email) return null;
        const normalizedEmail = normalize(email);
        return users.find(u => normalize(u.email_usuario) === normalizedEmail) || null;
    };

    // ===== PARSER DO CSV =====

    /**
     * Parser CSV robusto que lida com:
     * - Campos entre aspas
     * - Quebras de linha dentro de campos entre aspas
     * - Aspas escapadas ("")
     */
    const parseCSV = (content: string): string[][] => {
        const result: string[][] = [];
        let currentRow: string[] = [];
        let currentCell = '';
        let insideQuotes = false;
        
        for (let i = 0; i < content.length; i++) {
            const char = content[i];
            const nextChar = content[i + 1];
            
            if (insideQuotes) {
                // Dentro de aspas
                if (char === '"') {
                    if (nextChar === '"') {
                        // Aspas escapadas ("") - adiciona uma aspa
                        currentCell += '"';
                        i++; // Pula a próxima aspa
                    } else {
                        // Fim do campo entre aspas
                        insideQuotes = false;
                    }
                } else {
                    // Qualquer outro caractere (incluindo \n) é parte do campo
                    currentCell += char;
                }
            } else {
                // Fora de aspas
                if (char === '"') {
                    // Início de campo entre aspas
                    insideQuotes = true;
                } else if (char === ';') {
                    // Fim do campo (separador)
                    currentRow.push(currentCell.trim());
                    currentCell = '';
                } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
                    // Fim da linha
                    if (char === '\r') i++; // Pula o \n do \r\n
                    
                    currentRow.push(currentCell.trim());
                    
                    // Só adiciona linhas não vazias
                    if (currentRow.some(cell => cell !== '')) {
                        result.push(currentRow);
                    }
                    
                    currentRow = [];
                    currentCell = '';
                } else if (char !== '\r') {
                    // Caractere normal
                    currentCell += char;
                }
            }
        }
        
        // Adicionar última célula e linha se houver
        if (currentCell || currentRow.length > 0) {
            currentRow.push(currentCell.trim());
            if (currentRow.some(cell => cell !== '')) {
                result.push(currentRow);
            }
        }
        
        return result;
    };

    const processRow = (row: string[], headers: string[], rowNumber: number): ParsedConsultant => {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        // Criar objeto com valores do CSV
        const rowData: Record<string, string> = {};
        headers.forEach((header, index) => {
            rowData[header] = row[index] || '';
        });

        // 🔍 DEBUG: Mostrar dados do CSV (apenas primeira linha)
        if (rowNumber === 2) {
            console.log('🔍 DEBUG - Headers:', headers);
            console.log('🔍 DEBUG - Row data completo:', rowData);
            console.log('🔍 DEBUG - celular no CSV:', rowData['celular']);
            console.log('🔍 DEBUG - dt_aniversario no CSV:', rowData['dt_aniversario']);
            console.log('🔍 DEBUG - cnpj_consultor no CSV:', rowData['cnpj_consultor']);
            console.log('🔍 DEBUG - empresa_consultor no CSV:', rowData['empresa_consultor']);
            console.log('🔍 DEBUG - valor_pagamento no CSV:', rowData['valor_pagamento']);
        }

        // 1. Buscar Cliente
        const clientName = cleanText(rowData['razao_social_cliente']);
        const client = findClientByName(clientName);
        if (!client) {
            errors.push(`Cliente "${clientName}" não encontrado`);
            return { rowNumber, data: null, errors, warnings };
        }

        // 2. Buscar Gestor
        const managerName = cleanText(rowData['gestor_imediato_id']);
        const { manager, warning: managerWarning } = findManagerByName(managerName, client.id);
        if (!manager) {
            errors.push(`Gestor "${managerName}" não encontrado para o cliente "${clientName}"`);
            return { rowNumber, data: null, errors, warnings };
        }
        if (managerWarning) warnings.push(managerWarning);

        // 3. Buscar Coordenador (opcional)
        const coordName = cleanText(rowData['coordenador_id']);
        let coordId: number | null = null;
        if (coordName) {
            const { coordinator, warning: coordWarning } = findCoordinatorByName(coordName, manager.id);
            if (coordinator) {
                coordId = coordinator.id;
            } else {
                warnings.push(`Coordenador "${coordName}" não encontrado`);
            }
            if (coordWarning) warnings.push(coordWarning);
        }

        // 4. Buscar Analista R&S por email
        const analistaEmail = cleanText(rowData['analista_rs_id']);
        let analistaId: number | null = null;
        if (analistaEmail) {
            const analista = findUserByEmail(analistaEmail);
            if (analista) {
                analistaId = analista.id;
            } else {
                // Fallback: usar do cliente
                analistaId = client.id_gestor_rs || null;
                if (analistaEmail !== '') {
                    warnings.push(`Analista "${analistaEmail}" não encontrado. Usando analista do cliente.`);
                }
            }
        } else {
            analistaId = client.id_gestor_rs || null;
        }

        // 5. Buscar Gestão de Pessoas por email
        const gpEmail = cleanText(rowData['id_gestao_de_pessoas']);
        let gpId: number | null = null;
        if (gpEmail) {
            const gp = findUserByEmail(gpEmail);
            if (gp) {
                gpId = gp.id;
            } else {
                gpId = client.id_gestao_de_pessoas || null;
                if (gpEmail !== '') {
                    warnings.push(`Gestão de Pessoas "${gpEmail}" não encontrado. Usando GP do cliente.`);
                }
            }
        } else {
            gpId = client.id_gestao_de_pessoas || null;
        }

        // 6. Processar demais campos
        const nomeConsultor = cleanText(rowData['nome_consultores']);
        if (!nomeConsultor) {
            errors.push('Nome do consultor é obrigatório');
            return { rowNumber, data: null, errors, warnings };
        }

        const status = parseStatus(rowData['status']);
        const ativoConsultor = parseBoolean(rowData['ativo_consultor']);
        
        // Consistência: se status é Perdido/Encerrado, ativo deve ser false
        const finalAtivo = status === 'Ativo' ? ativoConsultor : false;

        // 🔍 DEBUG: Processar e logar cada campo
        const celularProcessado = cleanPhone(rowData['celular']);
        const dtAniversarioProcessado = dateBRToISO(rowData['dt_aniversario']);
        const cnpjProcessado = cleanCNPJ(rowData['cnpj_consultor']);
        const empresaProcessado = cleanText(rowData['empresa_consultor']) || null;
        const valorPagamentoProcessado = parseCurrencyBR(rowData['valor_pagamento']);

        if (rowNumber === 2) {
            console.log('🔍 DEBUG PROCESSAMENTO:');
            console.log('  celular bruto:', rowData['celular'], '-> processado:', celularProcessado);
            console.log('  dt_aniversario bruto:', rowData['dt_aniversario'], '-> processado:', dtAniversarioProcessado);
            console.log('  cnpj_consultor bruto:', rowData['cnpj_consultor'], '-> processado:', cnpjProcessado);
            console.log('  empresa_consultor bruto:', rowData['empresa_consultor'], '-> processado:', empresaProcessado);
            console.log('  valor_pagamento bruto:', rowData['valor_pagamento'], '-> processado:', valorPagamentoProcessado);
        }

        const consultantData = {
            nome_consultores: nomeConsultor,
            email_consultor: cleanText(rowData['email_consultor']) || null,
            cpf: cleanCPF(rowData['cpf']),
            cargo_consultores: cleanText(rowData['cargo_consultores']) || 'Consultor',
            ano_vigencia: parseInt(rowData['ano_vigencia']) || new Date().getFullYear(),
            data_inclusao_consultores: dateBRToISO(rowData['data_inclusao_consultores']) || new Date().toISOString().split('T')[0],
            data_ultima_alteracao: dateBRToISO(rowData['data_ultima_alteracao']) || null,
            data_saida: excelSerialToDate(rowData['data_saida']),
            status: status,
            motivo_desligamento: parseTerminationReason(rowData['motivo_desligamento']),
            ativo_consultor: finalAtivo,
            gestor_imediato_id: manager.id,
            coordenador_id: coordId,
            analista_rs_id: analistaId,
            id_gestao_de_pessoas: gpId,
            valor_faturamento: parseCurrencyBR(rowData['valor_faturamento']),
            valor_pagamento: valorPagamentoProcessado,
            celular: celularProcessado,
            dt_aniversario: dtAniversarioProcessado,
            cnpj_consultor: cnpjProcessado,
            empresa_consultor: empresaProcessado,
        };

        // 🔍 DEBUG: Mostrar objeto final
        if (rowNumber === 2) {
            console.log('🔍 DEBUG consultantData FINAL:', consultantData);
        }

        return { rowNumber, data: consultantData, errors, warnings };
    };

    /**
     * Lê arquivo com detecção automática de encoding
     * Tenta UTF-8 primeiro, depois Windows-1252 (comum em CSVs do Excel BR)
     */
    const readFileWithEncoding = async (file: File): Promise<string> => {
        // Primeiro, tenta ler como UTF-8
        const arrayBuffer = await file.arrayBuffer();
        
        // Tenta decodificar como UTF-8
        const utf8Decoder = new TextDecoder('utf-8');
        const utf8Content = utf8Decoder.decode(arrayBuffer);
        
        // Verifica se tem caracteres de substituição (indica encoding errado)
        // O caractere � (U+FFFD) aparece quando UTF-8 não consegue decodificar
        if (!utf8Content.includes('\uFFFD') && !utf8Content.includes('�')) {
            console.log('📄 Arquivo lido como UTF-8');
            return utf8Content;
        }
        
        // Se UTF-8 falhou, tenta Windows-1252 (padrão do Excel no Windows BR)
        try {
            const win1252Decoder = new TextDecoder('windows-1252');
            const win1252Content = win1252Decoder.decode(arrayBuffer);
            console.log('📄 Arquivo lido como Windows-1252');
            return win1252Content;
        } catch (e) {
            console.log('📄 Fallback para ISO-8859-1');
            // Fallback para ISO-8859-1 (Latin-1)
            const latin1Decoder = new TextDecoder('iso-8859-1');
            return latin1Decoder.decode(arrayBuffer);
        }
    };

    // ===== HANDLERS =====

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsLoading(true);
        setResult(null);
        setPreviewData([]);

        try {
            // Verificar extensão
            if (!file.name.endsWith('.csv')) {
                throw new Error('Formato inválido. Por favor selecione um arquivo CSV.');
            }

            // Ler arquivo com detecção de encoding
            const content = await readFileWithEncoding(file);
            const rows = parseCSV(content);

            if (rows.length < 2) {
                throw new Error('Arquivo vazio ou sem dados.');
            }

            // Primeira linha = headers
            const headers = rows[0].map(h => h.trim());
            console.log('📋 Headers encontrados:', headers);

            // Processar linhas de dados
            const parsedRows: ParsedConsultant[] = [];
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                
                // Pular linhas vazias
                if (row.every(cell => !cell.trim())) continue;
                
                const parsed = processRow(row, headers, i + 1);
                parsedRows.push(parsed);
            }

            setPreviewData(parsedRows);
            setShowPreview(true);

            // Calcular resumo
            const successCount = parsedRows.filter(r => r.data !== null).length;
            const errorCount = parsedRows.filter(r => r.errors.length > 0).length;
            const allWarnings = parsedRows.flatMap(r => r.warnings.map(w => `Linha ${r.rowNumber}: ${w}`));
            const allErrors = parsedRows.flatMap(r => r.errors.map(e => `Linha ${r.rowNumber}: ${e}`));

            setResult({
                success: successCount,
                errors: allErrors,
                warnings: allWarnings
            });

        } catch (error) {
            console.error('Erro ao processar CSV:', error);
            setResult({
                success: 0,
                errors: [error instanceof Error ? error.message : 'Erro desconhecido'],
                warnings: []
            });
        } finally {
            setIsLoading(false);
            // Reset file input
            e.target.value = '';
        }
    };

    const handleConfirmImport = () => {
        const validData = previewData
            .filter(p => p.data !== null)
            .map(p => p.data);

        if (validData.length === 0) {
            alert('Nenhum registro válido para importar.');
            return;
        }

        // 🔍 DEBUG: Verificar dados antes de enviar
        console.log('📋 Dados a serem importados (primeiro registro):', validData[0]);
        console.log('📋 Campos do primeiro registro:', Object.keys(validData[0] || {}));
        console.log('📋 celular:', validData[0]?.celular);
        console.log('📋 dt_aniversario:', validData[0]?.dt_aniversario);
        console.log('📋 cnpj_consultor:', validData[0]?.cnpj_consultor);
        console.log('📋 empresa_consultor:', validData[0]?.empresa_consultor);
        console.log('📋 valor_pagamento:', validData[0]?.valor_pagamento);

        onImportBatch(validData);
        setShowPreview(false);
        setPreviewData([]);
        setResult(prev => prev ? { ...prev, success: validData.length } : null);
    };

    const handleCancel = () => {
        setShowPreview(false);
        setPreviewData([]);
        setResult(null);
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-md mb-8 border-t-4 border-green-600">
            <h2 className="text-xl font-bold text-[#4D5253] mb-4">
                📊 Importação em Lote (CSV)
            </h2>
            
            <p className="text-sm text-gray-600 mb-4">
                Importe múltiplos consultores de um arquivo CSV. O arquivo deve usar ponto-e-vírgula (;) como separador.
            </p>

            <div className="flex flex-col sm:flex-row items-start gap-4">
                <label className={`cursor-pointer bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 transition-colors duration-300 shadow-sm flex items-center ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <span className="mr-2 text-lg">📁</span>
                    {isLoading ? 'Processando...' : 'Selecionar CSV'}
                    <input 
                        ref={fileInputRef}
                        type="file" 
                        className="hidden" 
                        onChange={handleFileSelect} 
                        accept=".csv" 
                        disabled={isLoading} 
                    />
                </label>
                
                <div className="text-xs text-gray-500">
                    <p className="font-medium mb-1">Colunas esperadas:</p>
                    <p className="italic">razao_social_cliente; nome_consultores; email_consultor; cpf; cargo_consultores; ano_vigencia; data_inclusao_consultores; status; ativo_consultor; gestor_imediato_id; coordenador_id; analista_rs_id; id_gestao_de_pessoas; valor_faturamento; valor_pagamento; celular; dt_aniversario; cnpj_consultor; empresa_consultor</p>
                </div>
            </div>

            {/* Resultado do processamento */}
            {result && !showPreview && (
                <div className="mt-4 p-4 rounded-md bg-gray-50 border">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">{result.success > 0 ? '✅' : '❌'}</span>
                        <span className="font-bold text-lg">
                            {result.success} registro(s) importado(s) com sucesso
                        </span>
                    </div>
                    
                    {result.warnings.length > 0 && (
                        <div className="mt-2">
                            <p className="font-medium text-yellow-700">⚠️ Avisos ({result.warnings.length}):</p>
                            <ul className="text-sm text-yellow-600 list-disc list-inside max-h-32 overflow-y-auto">
                                {result.warnings.slice(0, 10).map((w, i) => (
                                    <li key={i}>{w}</li>
                                ))}
                                {result.warnings.length > 10 && (
                                    <li>... e mais {result.warnings.length - 10} avisos</li>
                                )}
                            </ul>
                        </div>
                    )}
                    
                    {result.errors.length > 0 && (
                        <div className="mt-2">
                            <p className="font-medium text-red-700">❌ Erros ({result.errors.length}):</p>
                            <ul className="text-sm text-red-600 list-disc list-inside max-h-32 overflow-y-auto">
                                {result.errors.slice(0, 10).map((e, i) => (
                                    <li key={i}>{e}</li>
                                ))}
                                {result.errors.length > 10 && (
                                    <li>... e mais {result.errors.length - 10} erros</li>
                                )}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {/* Preview Modal */}
            {showPreview && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
                        <div className="p-4 border-b bg-gray-50">
                            <h3 className="text-lg font-bold">Preview da Importação</h3>
                            <p className="text-sm text-gray-600">
                                ✅ {previewData.filter(p => p.data).length} válidos | 
                                ❌ {previewData.filter(p => p.errors.length > 0).length} com erros
                            </p>
                        </div>
                        
                        <div className="p-4 overflow-auto max-h-[60vh]">
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="bg-gray-100">
                                        <th className="border p-2 text-left">Linha</th>
                                        <th className="border p-2 text-left">Status</th>
                                        <th className="border p-2 text-left">Nome</th>
                                        <th className="border p-2 text-left">Cliente</th>
                                        <th className="border p-2 text-left">Gestor</th>
                                        <th className="border p-2 text-left">Observações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewData.slice(0, 50).map((row, idx) => (
                                        <tr key={idx} className={row.errors.length > 0 ? 'bg-red-50' : row.warnings.length > 0 ? 'bg-yellow-50' : ''}>
                                            <td className="border p-2">{row.rowNumber}</td>
                                            <td className="border p-2">
                                                {row.errors.length > 0 ? '❌' : row.warnings.length > 0 ? '⚠️' : '✅'}
                                            </td>
                                            <td className="border p-2">{row.data?.nome_consultores || '-'}</td>
                                            <td className="border p-2">{row.data ? clients.find(c => managers.find(m => m.id === row.data.gestor_imediato_id)?.id_cliente === c.id)?.razao_social_cliente : '-'}</td>
                                            <td className="border p-2">{row.data ? managers.find(m => m.id === row.data.gestor_imediato_id)?.nome_gestor_cliente : '-'}</td>
                                            <td className="border p-2 text-xs">
                                                {row.errors.length > 0 && <span className="text-red-600">{row.errors.join('; ')}</span>}
                                                {row.warnings.length > 0 && <span className="text-yellow-600">{row.warnings.join('; ')}</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {previewData.length > 50 && (
                                <p className="text-sm text-gray-500 mt-2">
                                    Mostrando 50 de {previewData.length} registros...
                                </p>
                            )}
                        </div>
                        
                        <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
                            <button
                                onClick={handleCancel}
                                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-100"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirmImport}
                                disabled={previewData.filter(p => p.data).length === 0}
                                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                            >
                                Importar {previewData.filter(p => p.data).length} Registros
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ConsultantCSVImport;
