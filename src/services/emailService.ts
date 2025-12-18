/**
 * Email Service - RMS RAISA v51
 * Serviço de envio de emails via EmailJS
 * Inclui notificação automática para Risco Crítico (Score 5)
 */

import emailjs from '@emailjs/browser';
import { User, Consultant, Client } from '../components/types';

// --- EMAILJS CONFIGURATION ---
const SERVICE_ID = "service_n9l30w7";
const TEMPLATE_ID = "template_m4etler";
const PUBLIC_KEY = "QZenXL-lVW_U_P2jT";

// Initialize EmailJS
emailjs.init(PUBLIC_KEY);

/**
 * Envia email de recuperação de senha
 */
export const sendPasswordRecoveryEmail = async (user: User): Promise<boolean> => {
    const messageBody = `Olá ${user.nome_usuario}

Você solicitou alteração de Senha, para fazer um novo Login, use a senha temporária "Novo@"
Após efetuar o Login, altere a senha novamente de acordo com sua preferência.

Grato

TECH FOR TI 
RMS - Risk Management Systems`;

    const templateParams = {
        to_name: user.nome_usuario,
        to_email: user.email_usuario,
        subject: "RMS - Risk Management Systems - Recuperação de senha",
        message: messageBody,
    };

    try {
        await emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams);
        console.log(`✅ Email de recuperação enviado para ${user.email_usuario}`);
        return true;
    } catch (error) {
        console.error("❌ Erro ao enviar email de recuperação:", error);
        return false;
    }
};

/**
 * Envia alerta de risco para um usuário específico
 */
export const sendRiskAlertEmail = async (
    recipientUser: User, 
    consultant: Consultant, 
    clientName: string,
    hrManagerName: string
): Promise<boolean> => {
    const inclusionDate = consultant.data_inclusao_consultores 
        ? new Date(consultant.data_inclusao_consultores).toLocaleDateString('pt-BR')
        : 'Data não informada';

    const messageBody = `Olá ${recipientUser.nome_usuario}

Identificamos um grau de Risco 5 - CRÍTICO, para o Consultor ${consultant.nome_consultores} - ${consultant.cargo_consultores || 'Cargo não informado'} contratado em ${inclusionDate} 
atuando no Cliente: ${clientName}.

As estratégias de Retenção já foram publicadas e notificadas para ${hrManagerName}

Grato

TECHFOR TI 
RMS - Risk Management Systems`;

    const templateParams = {
        to_name: recipientUser.nome_usuario,
        to_email: recipientUser.email_usuario,
        subject: "🚨 RMS - ALERTA CRÍTICO - Consultor em Risco Máximo",
        message: messageBody,
    };

    try {
        await emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams);
        console.log(`✅ Alerta de Risco CRÍTICO enviado para ${recipientUser.email_usuario}`);
        return true;
    } catch (error) {
        console.error("❌ Erro ao enviar alerta de risco:", error);
        return false;
    }
};

/**
 * Interface para resultado do envio de notificações
 */
export interface CriticalRiskNotificationResult {
    success: boolean;
    emailsSent: number;
    emailsFailed: number;
    recipients: string[];
    errors: string[];
}

/**
 * 🚨 NOVA FUNÇÃO: Envia notificações de Risco Crítico (Score 5)
 * Notifica apenas os usuários associados ao consultor:
 * - Gestor de R&S (gestor_rs_id)
 * - Gestão de Pessoas (id_gestao_de_pessoas)
 * - Analista de R&S (analista_rs_id do usuário logado, se aplicável)
 * 
 * @param consultant - Consultor que atingiu risco crítico
 * @param users - Lista de usuários do sistema (app_users)
 * @param clientName - Nome do cliente onde o consultor atua
 * @param summary - Resumo da análise de risco
 * @returns Resultado do envio de notificações
 */
export const sendCriticalRiskNotifications = async (
    consultant: Consultant,
    users: User[],
    clientName: string,
    summary: string
): Promise<CriticalRiskNotificationResult> => {
    const result: CriticalRiskNotificationResult = {
        success: false,
        emailsSent: 0,
        emailsFailed: 0,
        recipients: [],
        errors: []
    };

    console.log(`🚨 Iniciando notificações de Risco Crítico para ${consultant.nome_consultores}...`);

    // Coletar IDs dos usuários que devem ser notificados
    const userIdsToNotify: Set<number> = new Set();

    // 1. Gestor de R&S do consultor
    if (consultant.gestor_rs_id) {
        userIdsToNotify.add(consultant.gestor_rs_id);
        console.log(`📧 Gestor R&S (ID: ${consultant.gestor_rs_id}) será notificado`);
    }

    // 2. Gestão de Pessoas do consultor
    if (consultant.id_gestao_de_pessoas) {
        userIdsToNotify.add(consultant.id_gestao_de_pessoas);
        console.log(`📧 Gestão de Pessoas (ID: ${consultant.id_gestao_de_pessoas}) será notificado`);
    }

    // Filtrar usuários que devem receber notificação
    const recipientUsers = users.filter(user => {
        // Verificar se o usuário está na lista de IDs a notificar
        const shouldNotify = userIdsToNotify.has(user.id);
        
        // Verificar se o usuário está ativo e aceita receber alertas
        const isActive = user.ativo_usuario !== false;
        const acceptsAlerts = user.receber_alertas_email !== false;
        
        // Verificar se tem email válido
        const hasValidEmail = user.email_usuario && user.email_usuario.includes('@');

        if (shouldNotify && isActive && acceptsAlerts && hasValidEmail) {
            return true;
        }
        
        if (shouldNotify && !isActive) {
            console.log(`⚠️ Usuário ${user.nome_usuario} (ID: ${user.id}) está inativo`);
        }
        if (shouldNotify && !acceptsAlerts) {
            console.log(`⚠️ Usuário ${user.nome_usuario} (ID: ${user.id}) não aceita alertas por email`);
        }
        
        return false;
    });

    if (recipientUsers.length === 0) {
        console.warn('⚠️ Nenhum usuário elegível para receber notificação de risco crítico');
        result.errors.push('Nenhum usuário elegível para notificação');
        return result;
    }

    console.log(`📬 ${recipientUsers.length} usuário(s) serão notificados`);

    // Preparar data de inclusão
    const inclusionDate = consultant.data_inclusao_consultores 
        ? new Date(consultant.data_inclusao_consultores).toLocaleDateString('pt-BR')
        : 'Data não informada';

    // Enviar email para cada destinatário
    for (const user of recipientUsers) {
        const messageBody = `Olá ${user.nome_usuario},

🚨 ALERTA DE RISCO CRÍTICO 🚨

Identificamos um grau de Risco 5 - CRÍTICO para o consultor abaixo:

📋 DADOS DO CONSULTOR:
• Nome: ${consultant.nome_consultores}
• Cargo: ${consultant.cargo_consultores || 'Não informado'}
• Cliente: ${clientName}
• Data de Contratação: ${inclusionDate}

📊 RESUMO DA ANÁLISE:
${summary}

⚠️ AÇÃO NECESSÁRIA:
Este consultor requer atenção imediata. Por favor, acesse o sistema RMS para visualizar as estratégias de retenção recomendadas e tomar as providências necessárias.

---
TECHFOR TI
RMS - Risk Management Systems
https://techfortirms.online`;

        const templateParams = {
            to_name: user.nome_usuario,
            to_email: user.email_usuario,
            subject: `🚨 ALERTA CRÍTICO - ${consultant.nome_consultores} - Risco Máximo Detectado`,
            message: messageBody,
        };

        try {
            await emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams);
            console.log(`✅ Email enviado para ${user.nome_usuario} (${user.email_usuario})`);
            result.emailsSent++;
            result.recipients.push(user.email_usuario);
        } catch (error: any) {
            console.error(`❌ Falha ao enviar para ${user.email_usuario}:`, error);
            result.emailsFailed++;
            result.errors.push(`Falha ao enviar para ${user.email_usuario}: ${error.message || 'Erro desconhecido'}`);
        }

        // Pequeno delay entre envios para evitar rate limiting do EmailJS
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    result.success = result.emailsSent > 0;
    
    console.log(`📊 Resultado: ${result.emailsSent} enviados, ${result.emailsFailed} falhas`);
    
    return result;
};

/**
 * Verifica se um score de risco é crítico (Score 5)
 */
export const isCriticalRisk = (riskScore: number | null | undefined): boolean => {
    return riskScore === 5;
};
