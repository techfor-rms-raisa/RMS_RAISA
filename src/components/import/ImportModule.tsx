/**
 * ImportModule.tsx - Módulo de Importação em Massa
 * 
 * ATUALIZADO: Card "4. Consultores" substituído pelo ConsultantCSVImport completo
 * 
 * Importações disponíveis:
 * 1. Clientes (XLS)
 * 2. Gestores (XLS)
 * 3. Coordenadores (XLS)
 * 4. Consultores (CSV) - Nova rotina completa com todos os campos
 */

import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Client, UsuarioCliente, CoordenadorCliente, User } from '@/types';
import ConsultantCSVImport from '../ConsultantCSVImport';

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

type ImportType = 'CLIENTES' | 'GESTORES' | 'COORDENADORES';

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
                        'RAZÃO_SOCIAL',
                        'CLIENTE',
                        'NOME_CLIENTE',
                        'NOME'
                    ]);
                    
                    if (!razaoSocial) throw new Error("RAZAO_SOCIAL não encontrado.");

                    // Verificar duplicado
                    const exists = clients.some(c => normalize(c.razao_social_cliente) === normalize(razaoSocial));
                    if (exists) throw new Error(`Cliente "${razaoSocial}" já existe.`);

                    // Buscar emails de gestão
                    const emailGestorRs = getColumnValue(row, ['EMAIL_GESTOR_RS', 'EMAIL_RS', 'GESTOR_RS']);
                    const emailGestaoDesp = getColumnValue(row, ['EMAIL_GESTAO_DESPESAS', 'EMAIL_DESPESAS', 'GESTAO_DESPESAS']);
                    const emailGestao = getColumnValue(row, ['EMAIL_GESTAO_PESSOAS', 'EMAIL_PESSOAS', 'GESTAO_PESSOAS']);

                    // Match Users
                    const gestorRs = emailGestorRs ? users.find(u => normalize(u.email_usuario) === normalize(emailGestorRs)) : null;
                    const gestaoDespesas = emailGestaoDesp ? users.find(u => normalize(u.email_usuario) === normalize(emailGestaoDesp)) : null;
                    const gestaoPessoas = emailGestao ? users.find(u => normalize(u.email_usuario) === normalize(emailGestao)) : null;

                    batchData.push({
                        razao_social_cliente: razaoSocial,
                        id_gestor_rs: gestorRs?.id || null,
                        id_gestao_despesas: gestaoDespesas?.id || null,
                        id_gestao_de_pessoas: gestaoPessoas?.id || null,
                        ativo: true
                    });
                }
                else if (type === 'GESTORES') {
                    // Required: NOME_CLIENTE, NOME_GESTOR
                    const nomeCliente = getColumnValue(row, ['NOME_CLIENTE', 'CLIENTE', 'RAZAO_SOCIAL']);
                    const nomeGestor = getColumnValue(row, ['NOME_GESTOR', 'GESTOR', 'NOME']);
                    
                    if (!nomeCliente || !nomeGestor) throw new Error("Dados obrigatórios faltando.");

                    const client = clients.find(c => normalize(c.razao_social_cliente) === normalize(nomeCliente));
                    if (!client) throw new Error(`Cliente '${nomeCliente}' não existe.`);

                    // Verificar duplicado
                    const exists = managers.some(m => m.id_cliente === client.id && normalize(m.nome_gestor_cliente) === normalize(nomeGestor));
                    if (exists) throw new Error(`Gestor "${nomeGestor}" já existe no cliente.`);

                    batchData.push({
                        id_cliente: client.id,
                        nome_gestor_cliente: nomeGestor,
                        cargo_gestor_cliente: row.CARGO || 'Gestor',
                        ativo: true
                    });
                }
                else if (type === 'COORDENADORES') {
                    // Required: NOME_GESTOR, NOME_COORDENADOR
                    const nomeGestor = getColumnValue(row, ['NOME_GESTOR', 'GESTOR']);
                    const nomeCoordenador = getColumnValue(row, ['NOME_COORDENADOR', 'COORDENADOR', 'NOME']);
                    
                    if (!nomeGestor || !nomeCoordenador) throw new Error("Dados obrigatórios faltando.");

                    const manager = managers.find(m => normalize(m.nome_gestor_cliente) === normalize(nomeGestor));
                    if (!manager) throw new Error(`Gestor '${nomeGestor}' não existe.`);

                    // Verificar duplicado
                    const exists = coordinators.some(c => c.id_gestor_cliente === manager.id && normalize(c.nome_coordenador_cliente) === normalize(nomeCoordenador));
                    if (exists) throw new Error(`Coordenador "${nomeCoordenador}" já existe.`);

                    batchData.push({
                        id_gestor_cliente: manager.id,
                        nome_coordenador_cliente: nomeCoordenador,
                        cargo_coordenador_cliente: row.CARGO || 'Coordenador',
                        ativo: true
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
            
            {/* Grid de cards para Clientes, Gestores e Coordenadores */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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
            </div>

            {/* LOG AREA para Clientes/Gestores/Coordenadores */}
            {logs.length > 0 && (
                <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm h-48 overflow-y-auto mb-8">
                    <div className="mb-2 font-bold text-gray-400">Log de Processamento:</div>
                    {logs.map((log, i) => (
                        <div key={i} className="mb-1">{log}</div>
                    ))}
                </div>
            )}

            {/* 4. CONSULTORES - Componente dedicado com CSV */}
            <div className="mt-4">
                <ConsultantCSVImport 
                    clients={clients} 
                    managers={managers} 
                    coordinators={coordinators} 
                    users={users} 
                    onImportBatch={batchAddConsultants} 
                />
            </div>
        </div>
    );
};

export default ImportModule;
