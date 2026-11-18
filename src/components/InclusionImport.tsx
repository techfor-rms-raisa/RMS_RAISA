/**
 * InclusionImport.tsx - Importador de Ficha de Inclusão
 * 
 * VERSÃO: v3.0 - 18/11/2026
 * 
 * CORREÇÕES:
 * - ✅ v3.0: Parser POSICIONAL (src/utils/fichaInclusaoParser.ts). Causa raiz: o pdf.js entrega o texto
 *            na ordem do content stream do Excel, não na ordem visual. Corrige: e-mail do APROVADOR
 *            gravado como e-mail do consultor; NOME do contato de emergência no lugar do consultor;
 *            DATA EMISSÃO no lugar da DATA DE INÍCIO; FATURAMENTO herdando o VALOR; EMPRESA, TECNOLOGIA
 *            e OBSERVAÇÕES incompletas; SUBSTITUIÇÃO ativada por "XXXXX". Cada campo é lido somente no
 *            seu rótulo SUBLINHADO do modelo e na sua seção (cabeçalho ignorado para e-mail/telefone).
 * - ✅ v2.5: Email — fallback global em 3 camadas; captura email pessoal do consultor
 *            mesmo quando pdf.js extrai sem prefixo "E-MAIL:" e antes de DADOS DO PROFISSIONAL
 * - ✅ v2.4: Celular regex DDD com traço | Substituição por ordem de checkbox | emailsGestor por domínio
 * - ✅ v2.2: verificação de duplicata de email inclui ano_vigencia
 * - ✅ v1.9: RH: extração definitiva por regex após data de emissão + busca por analistas
 * - ✅ v1.8: Analista R&S: findUserByName filtra tipo_usuario; exclui GP do rodapé
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
import { extrairItensFicha, montarLinhasVisuais, parseFichaInclusao, FichaInclusaoDados } from '@/utils/fichaInclusaoParser';

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

    // ✅ FIX v1.8: findUserByName com filtro opcional de tipo_usuario
    // Para Analista R&S, só busca em users com tipo correto — evita confundir com Gestão de Pessoas
    const findUserByName = (name: string, tiposPermitidos?: string[]): User | null => {
        if (!name || name === 'XXX' || name === 'xxx') return null;
        
        const normalizedName = normalize(name);
        console.log(`🔍 Buscando usuário: "${name}" (normalizado: "${normalizedName}")`);
        
        // Pool de busca: filtrar por tipos permitidos se especificado
        const pool = tiposPermitidos && tiposPermitidos.length > 0
            ? users.filter(u => tiposPermitidos.includes(u.tipo_usuario))
            : users;
        
        let user = pool.find(u => normalize(u.nome_usuario) === normalizedName);
        if (user) {
            console.log(`✅ Usuário encontrado (exato): ${user.nome_usuario} (ID: ${user.id})`);
            return user;
        }
        
        const firstName = normalizedName.split(' ')[0];
        user = pool.find(u => normalize(u.nome_usuario).startsWith(firstName));
        if (user) {
            console.log(`✅ Usuário encontrado (primeiro nome): ${user.nome_usuario} (ID: ${user.id})`);
            return user;
        }
        
        user = pool.find(u => normalize(u.nome_usuario).includes(normalizedName) || normalizedName.includes(normalize(u.nome_usuario)));
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

            // ✅ v3.0: Leitura POSICIONAL da ficha (ordem visual reconstruída pelas coordenadas X/Y)
            // CAUSA RAIZ: o pdf.js devolve os itens na ordem do content stream do Excel, NÃO na ordem
            // visual. O parser antigo (linha a linha) pegava o E-MAIL do aprovador/solicitante, o NOME
            // do contato de emergência e a DATA EMISSÃO no lugar dos campos do profissional.
            // Agora cada campo é lido SOMENTE no seu rótulo sublinhado e na sua seção do modelo
            // FORM0005.18 — os 2 e-mails do cabeçalho nunca são considerados (utils/fichaInclusaoParser.ts).
            const arrayBuffer = await file.arrayBuffer();
            const pdfDoc = await pdfjsLib.getDocument(arrayBuffer).promise;
            let ficha: FichaInclusaoDados;
            try {
                const linhasFicha = montarLinhasVisuais(await extrairItensFicha(pdfDoc));
                console.log('📄 Ficha em ordem visual:\n' + linhasFicha.map(l => l.cells.map(c => c.str).join(' | ')).join('\n'));
                ficha = parseFichaInclusao(linhasFicha);
            } finally {
                void pdfDoc.destroy();
            }
            ficha.avisos.forEach(aviso => console.warn(`⚠️ Ficha de Inclusão: ${aviso}`));

            const clientName = ficha.cliente;
            const managerName = ficha.nomeSolicitante;
            const coordName = ficha.responsavelAprovador;
            const consultantName = ficha.nomeConsultor;
            const role = ficha.funcao;
            const startDateStr = ficha.dataInicio;
            const hourlyRateStr = ficha.faturamentoMensal;
            const celularStr = ficha.celular;
            const cpfStr = ficha.cpf;
            const valorPagamentoStr = ficha.valorPagamento;
            const emailStr = ficha.email;
            const cnpjStr = ficha.cnpj;
            const empresaStr = ficha.empresa;
            const dtAniversarioStr = ficha.dtNascimento;
            const especialidadeStr = ficha.tecnologia;
            const substituicao = ficha.substituicao;
            const nomeSubstituidoStr = ficha.nomeSubstituido;
            const modalidadeContratoStr = ficha.formaContratacao;
            const faturavel = ficha.faturavel;
            const observacoesStr = ficha.observacoes;
            const recursosHumanosStr = ficha.recursosHumanos;

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

            // ✅ FIX v1.8: Buscar analista_rs_id filtrando por tipo_usuario Analista de R&S
            // Evita retornar usuário de Gestão de Pessoas com nome similar
            let analistaRsId: number | null = null;
            if (recursosHumanosStr) {
                const tiposAnalista = ['Analista de R&S', 'Gestão de R&S', 'Administrador'];
                const analistaUser = findUserByName(recursosHumanosStr, tiposAnalista);
                if (analistaUser) {
                    analistaRsId = analistaUser.id;
                    console.log(`✅ Analista R&S encontrado: ${analistaUser.nome_usuario} (ID: ${analistaUser.id})`);
                } else {
                    // Fallback: buscar sem filtro de tipo (caso o tipo esteja diferente no banco)
                    const analistaFallback = findUserByName(recursosHumanosStr);
                    if (analistaFallback) {
                        analistaRsId = analistaFallback.id;
                        console.log(`✅ Analista R&S encontrado (fallback sem filtro): ${analistaFallback.nome_usuario}`);
                    }
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
                // ✅ FIX v2.2: verificar duplicata de email APENAS para o ano vigente (mesmo critério do banco)
                // A constraint é (email_consultor, ano_vigencia) — não bloquear emails de anos anteriores
                const duplicataEmail = consultants.find((c: any) =>
                    (c.email_consultor || '').toLowerCase().trim() === emailLimpo &&
                    (c.ano_vigencia === anoAtual || !c.ano_vigencia)
                );
                if (duplicataEmail) {
                    throw new Error(
                        `E-mail já cadastrado!\n\nO e-mail "${newConsultantData.email_consultor}" já pertence ao consultor "${duplicataEmail.nome_consultores}" no sistema (ano ${anoAtual}).\n\nSe precisar atualizar os dados, edite o consultor existente na lista.`
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
// v3.0 — build 18112026
