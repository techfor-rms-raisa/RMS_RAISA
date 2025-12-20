import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Client, UsuarioCliente, CoordenadorCliente, User } from '@/types';

interface ImportModuleProps {
    users: User[];
    clients: Client[];
    managers: UsuarioCliente[];
    coordinators: CoordenadorCliente[];
    batchAddClients: (data: any[]) => void;
    batchAddManagers: (data: any[]) => void;
    batchAddCoordinators: (data: any[]) => void;
    batchAddConsultants: (data: any[]) => void;
}

type ImportType = 'CLIENTES' | 'GESTORES' | 'COORDENADORES' | 'CONSULTORES';

const ImportModule: React.FC<ImportModuleProps> = ({ 
    users, clients, managers, coordinators, 
    batchAddClients, batchAddManagers, batchAddCoordinators, batchAddConsultants 
}) => {
    const [loading, setLoading] = useState<string | null>(null);
    const [logs, setLogs] = useState<string[]>([]);

    const addLog = (msg: string, type: 'success' | 'error' = 'success') => {
        setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${type === 'error' ? '❌' : '✅'} ${msg}`, ...prev]);
    };

    const normalize = (str: string) => str ? String(str).trim().toLowerCase() : '';

    // Função para normalizar nomes de colunas (aceita maiúsculas, minúsculas e variações)
    const normalizeColumnName = (name: string) => {
        return String(name).trim().toUpperCase().replace(/\s+/g, '_');
    };

    // Função para buscar valor de coluna com múltiplas variações de nome
    const getColumnValue = (row: any, possibleNames: string[]) => {
        for (const name of possibleNames) {
            if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
                return row[name];
            }
        }
        return undefined;
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: ImportType) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(type);
        setLogs([]);
        addLog(`Iniciando importação de ${type}...`, 'success');

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);

                if (data.length === 0) throw new Error("Arquivo vazio ou formato incorreto.");

                // Normalizar nomes das colunas
                const normalizedData = data.map((row: any) => {
                    const normalizedRow: any = {};
                    Object.keys(row).forEach(key => {
                        const normalizedKey = normalizeColumnName(key);
                        normalizedRow[normalizedKey] = row[key];
                    });
                    return normalizedRow;
                });

                processData(type, normalizedData);
            } catch (err) {
                console.error(err);
                addLog(`Erro crítico: ${err instanceof Error ? err.message : String(err)}`, 'error');
            } finally {
                setLoading(null);
                // Reset input
                e.target.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };

    const processData = (type: ImportType, data: any[]) => {
        let successCount = 0;
        let errorsCount = 0;
        const batchData: any[] = [];

        data.forEach((row: any, index) => {
            const line = index + 2; // Excel header is row 1
            try {
                if (type === 'CLIENTES') {
                    // Buscar RAZAO_SOCIAL com múltiplas variações
                    const razaoSocial = getColumnValue(row, [
                        'RAZAO_SOCIAL',
                        'RAZAO_SOCIAL_CLIENTE',
                        'NOME_CLIENTE',
                        'CLIENTE'
                    ]);
                    
                    if (!razaoSocial) throw new Error("RAZAO_SOCIAL obrigatória.");
                    
                    // Buscar emails com múltiplas variações
                    const emailComercial = getColumnValue(row, [
                        'EMAIL_GESTAO_COMERCIAL',
                        'EMAIL_GESTOR_COMERCIAL',
                        'EMAIL_COMERCIAL'
                    ]);
                    
                    const emailPessoas = getColumnValue(row, [
                        'EMAIL_GESTAO_PESSOAS',
                        'EMAIL_GESTOR_PESSOAS',
                        'EMAIL_PESSOAS',
                        'EMAIL_GP'
                    ]);
                    
                    const emailRS = getColumnValue(row, [
                        'EMAIL_ANALISTA_RS',
                        'EMAIL_GESTOR_RS',
                        'EMAIL_RS',
                        'EMAIL_GESTAO_COMERCIAL',  // Fallback
                        'EMAIL_GESTOR_COMERCIAL'   // Fallback
                    ]);

                    // Resolve internal users IDs by email
                    const comUser = users.find(u => normalize(u.email_usuario) === normalize(emailComercial));
                    const gpUser = users.find(u => normalize(u.email_usuario) === normalize(emailPessoas));
                    const rsUser = users.find(u => normalize(u.email_usuario) === normalize(emailRS));

                    if (!comUser) throw new Error(`Usuário Comercial (${emailComercial}) não encontrado.`);
                    if (!gpUser) throw new Error(`Usuário GP (${emailPessoas}) não encontrado.`);
                    if (!rsUser) throw new Error(`Usuário R&S (${emailRS}) não encontrado.`);

                    batchData.push({
                        razao_social_cliente: razaoSocial,
                        ativo_cliente: true,
                        id_gestao_comercial: comUser.id,
                        id_gestao_de_pessoas: gpUser.id,
                        id_gestor_rs: rsUser.id
                    });
                }
                else if (type === 'GESTORES') {
                    // Required: NOME_CLIENTE, NOME_GESTOR
                    const nomeCliente = getColumnValue(row, ['NOME_CLIENTE', 'CLIENTE', 'RAZAO_SOCIAL']);
                    const nomeGestor = getColumnValue(row, ['NOME_GESTOR', 'GESTOR']);
                    
                    if (!nomeCliente || !nomeGestor) throw new Error("NOME_CLIENTE e NOME_GESTOR obrigatórios.");

                    const client = clients.find(c => normalize(c.razao_social_cliente) === normalize(nomeCliente));
                    if (!client) throw new Error(`Cliente '${nomeCliente}' não existe.`);

                    batchData.push({
                        id_cliente: client.id,
                        nome_gestor_cliente: nomeGestor,
                        cargo_gestor: row.CARGO || 'Gestor',
                        ativo: true,
                        analista_rs_id: client.id_gestor_rs // Default to Client's RS
                    });
                }
                else if (type === 'COORDENADORES') {
                    // Required: NOME_CLIENTE, NOME_GESTOR, NOME_COORDENADOR
                    const nomeCliente = getColumnValue(row, ['NOME_CLIENTE', 'CLIENTE', 'RAZAO_SOCIAL']);
                    const nomeGestor = getColumnValue(row, ['NOME_GESTOR', 'GESTOR']);
                    const nomeCoordenador = getColumnValue(row, ['NOME_COORDENADOR', 'COORDENADOR']);
                    
                    if (!nomeCliente || !nomeGestor || !nomeCoordenador) throw new Error("Dados obrigatórios faltando.");

                    const client = clients.find(c => normalize(c.razao_social_cliente) === normalize(nomeCliente));
                    if (!client) throw new Error(`Cliente '${nomeCliente}' não existe.`);

                    const manager = managers.find(m => m.id_cliente === client.id && normalize(m.nome_gestor_cliente) === normalize(nomeGestor));
                    if (!manager) throw new Error(`Gestor '${nomeGestor}' não encontrado no cliente.`);

                    batchData.push({
                        id_gestor_cliente: manager.id,
                        nome_coordenador_cliente: nomeCoordenador,
                        cargo_coordenador_cliente: row.CARGO || 'Coordenador',
                        ativo: true
                    });
                }
                else if (type === 'CONSULTORES') {
                    // Required: NOME_CONSULTOR, CARGO, DATA_INICIO, NOME_CLIENTE, NOME_GESTOR
                    const nomeConsultor = getColumnValue(row, ['NOME_CONSULTOR', 'CONSULTOR', 'NOME']);
                    const nomeCliente = getColumnValue(row, ['NOME_CLIENTE', 'CLIENTE', 'RAZAO_SOCIAL']);
                    const nomeGestor = getColumnValue(row, ['NOME_GESTOR', 'GESTOR']);
                    const dataInicio = getColumnValue(row, ['DATA_INICIO', 'DATA_INCLUSAO', 'DATA']);
                    
                    if (!nomeConsultor || !nomeCliente || !nomeGestor || !dataInicio) throw new Error("Dados obrigatórios faltando.");

                    const client = clients.find(c => normalize(c.razao_social_cliente) === normalize(nomeCliente));
                    if (!client) throw new Error(`Cliente '${nomeCliente}' não existe.`);

                    const manager = managers.find(m => m.id_cliente === client.id && normalize(m.nome_gestor_cliente) === normalize(nomeGestor));
                    if (!manager) throw new Error(`Gestor '${nomeGestor}' não encontrado no cliente.`);

                    let coordId = null;
                    const nomeCoordenador = getColumnValue(row, ['NOME_COORDENADOR', 'COORDENADOR']);
                    if (nomeCoordenador) {
                        const coord = coordinators.find(c => c.id_gestor_cliente === manager.id && normalize(c.nome_coordenador_cliente) === normalize(nomeCoordenador));
                        if (coord) coordId = coord.id;
                    }

                    // Format Date
                    // Expecting DD/MM/YYYY
                    let startDate = new Date().toISOString().split('T')[0];
                    if (String(dataInicio).includes('/')) {
                        const parts = String(dataInicio).split('/');
                        if (parts.length === 3) startDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                    }

                    batchData.push({
                        ano_vigencia: new Date().getFullYear(),
                        nome_consultores: nomeConsultor,
                        email_consultor: row.EMAIL_CONSULTOR || '',
                        cargo_consultores: row.CARGO,
                        data_inclusao_consultores: startDate,
                        status: 'Ativo',
                        motivo_desligamento: undefined,
                        valor_faturamento: row.VALOR_FATURAMENTO ? parseFloat(row.VALOR_FATURAMENTO) : 0,
                        gestor_imediato_id: manager.id,
                        coordenador_id: coordId,
                        analista_rs_id: client.id_gestor_rs,
                        id_gestao_de_pessoas: client.id_gestao_de_pessoas
                    });
                }

                successCount++;
            } catch (err) {
                errorsCount++;
                addLog(`Linha ${line}: ${err instanceof Error ? err.message : 'Erro desconhecido'}`, 'error');
            }
        });

        // Commit Batch
        if (batchData.length > 0) {
            if (type === 'CLIENTES') batchAddClients(batchData);
            if (type === 'GESTORES') batchAddManagers(batchData);
            if (type === 'COORDENADORES') batchAddCoordinators(batchData);
            if (type === 'CONSULTORES') batchAddConsultants(batchData);
            
            addLog(`Sucesso! ${batchData.length} registros importados.`, 'success');
        } else {
            addLog(`Nenhum registro válido para importar.`, 'error');
        }

        if (errorsCount > 0) {
            addLog(`${errorsCount} linhas ignoradas por erro. Verifique o log.`, 'error');
        }
    };

    return (
        <div className="p-6">
            <h2 className="text-2xl font-bold text-[#4D5253] mb-6">Importação de Dados em Massa</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {/* 1. CLIENTES */}
                <div className="bg-white p-6 rounded-lg shadow-md border-t-4 border-blue-500">
                    <h3 className="font-bold text-lg mb-2">1. Clientes</h3>
                    <p className="text-xs text-gray-500 mb-4">Requer: RAZAO_SOCIAL, Emails de Gestão</p>
                    <label className={`block text-center cursor-pointer bg-blue-600 text-white py-2 rounded hover:bg-blue-700 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
                        {loading === 'CLIENTES' ? 'Processando...' : 'Carregar XLS'}
                        <input type="file" className="hidden" accept=".xlsx, .xls" onChange={(e) => handleFileUpload(e, 'CLIENTES')} disabled={!!loading} />
                    </label>
                </div>

                {/* 2. GESTORES */}
                <div className="bg-white p-6 rounded-lg shadow-md border-t-4 border-orange-500">
                    <h3 className="font-bold text-lg mb-2">2. Gestores</h3>
                    <p className="text-xs text-gray-500 mb-4">Requer: NOME_CLIENTE, NOME_GESTOR</p>
                    <label className={`block text-center cursor-pointer bg-orange-600 text-white py-2 rounded hover:bg-orange-700 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
                        {loading === 'GESTORES' ? 'Processando...' : 'Carregar XLS'}
                        <input type="file" className="hidden" accept=".xlsx, .xls" onChange={(e) => handleFileUpload(e, 'GESTORES')} disabled={!!loading} />
                    </label>
                </div>

                {/* 3. COORDENADORES */}
                <div className="bg-white p-6 rounded-lg shadow-md border-t-4 border-purple-500">
                    <h3 className="font-bold text-lg mb-2">3. Coordenadores</h3>
                    <p className="text-xs text-gray-500 mb-4">Requer: NOME_GESTOR, NOME_COORDENADOR</p>
                    <label className={`block text-center cursor-pointer bg-purple-600 text-white py-2 rounded hover:bg-purple-700 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
                        {loading === 'COORDENADORES' ? 'Processando...' : 'Carregar XLS'}
                        <input type="file" className="hidden" accept=".xlsx, .xls" onChange={(e) => handleFileUpload(e, 'COORDENADORES')} disabled={!!loading} />
                    </label>
                </div>

                {/* 4. CONSULTORES */}
                <div className="bg-white p-6 rounded-lg shadow-md border-t-4 border-green-500">
                    <h3 className="font-bold text-lg mb-2">4. Consultores</h3>
                    <p className="text-xs text-gray-500 mb-4">Requer: NOME_CONSULTOR, NOME_CLIENTE...</p>
                    <label className={`block text-center cursor-pointer bg-green-600 text-white py-2 rounded hover:bg-green-700 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
                        {loading === 'CONSULTORES' ? 'Processando...' : 'Carregar XLS'}
                        <input type="file" className="hidden" accept=".xlsx, .xls" onChange={(e) => handleFileUpload(e, 'CONSULTORES')} disabled={!!loading} />
                    </label>
                </div>
            </div>

            {/* LOG AREA */}
            <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm h-64 overflow-y-auto">
                <div className="mb-2 font-bold text-gray-400">Log de Processamento:</div>
                {logs.length === 0 && <span className="text-gray-600">Aguardando arquivo...</span>}
                {logs.map((log, i) => (
                    <div key={i} className="mb-1">{log}</div>
                ))}
            </div>
        </div>
    );
};

export default ImportModule;