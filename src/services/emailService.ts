/**
 * Email Service - RMS RAISA v52.2
 * Serviço de envio de emails via Resend (backend)
 * Inclui notificação automática para Risco Crítico (Score 5)
 * 
 * ALTERAÇÃO v51: Migrado de EmailJS (frontend) para Resend (backend)
 * ALTERAÇÃO v52.1: Template otimizado para evitar filtros de SPAM
 * ALTERAÇÃO v52.2: Assinatura do email com nome do Gestão de Pessoas do cliente
 */

import { User, Consultant, Client, UsuarioCliente } from '@/types';

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
 * Interface para resposta da API de email
 */
interface EmailAPIResponse {
    success: boolean;
    messageId?: string;
    error?: string;
    details?: string;
}

/**
 * Envia email via API route do backend (Resend)
 */
const sendEmailViaAPI = async (
    to: string,
    toName: string,
    subject: string,
    type: 'critical_risk' | 'password_recovery' | 'general',
    data: {
        consultantName?: string;
        consultantCargo?: string;
        clientName?: string;
        inclusionDate?: string;
        summary: string;
        gestaoPessoasName?: string; // Nome do Gestão de Pessoas do cliente
    }
): Promise<boolean> => {
    try {
        console.log(`📧 Enviando email para ${to} via API...`);
        
        const response = await fetch('/api/send-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                to,
                toName,
                subject,
                type,
                ...data
            })
        });

        const result: EmailAPIResponse = await response.json();

        if (!response.ok || !result.success) {
            console.error(`❌ Erro ao enviar email: ${result.error || 'Unknown error'}`);
            return false;
        }

        console.log(`✅ Email enviado com sucesso! ID: ${result.messageId}`);
        return true;
    } catch (error: any) {
        console.error('❌ Erro de conexão ao enviar email:', error.message);
        return false;
    }
};

/**
 * Envia email de recuperação de senha
 */
export const sendPasswordRecoveryEmail = async (user: User): Promise<boolean> => {
    return sendEmailViaAPI(
        user.email_usuario,
        user.nome_usuario,
        "RMS - Risk Management Systems - Recuperação de senha",
        'password_recovery',
        {
            summary: 'Solicitação de recuperação de senha'
        }
    );
};

/**
 * Envia alerta de risco para um usuário específico
 */
export const sendRiskAlertEmail = async (
    recipientUser: User, 
    consultant: Consultant, 
    clientName: string,
    summary: string
): Promise<boolean> => {
    const inclusionDate = consultant.data_inclusao_consultores 
        ? new Date(consultant.data_inclusao_consultores).toLocaleDateString('pt-BR')
        : 'Data não informada';

    return sendEmailViaAPI(
        recipientUser.email_usuario,
        recipientUser.nome_usuario,
        `RMS-RAISA: Atenção Necessária - ${consultant.nome_consultores}`,
        'critical_risk',
        {
            consultantName: consultant.nome_consultores,
            consultantCargo: consultant.cargo_consultores || 'Não informado',
            clientName,
            inclusionDate,
            summary
        }
    );
};

/**
 * 🚨 FUNÇÃO PRINCIPAL: Envia notificações de Risco Crítico (Score 5)
 * 
 * CORRIGIDO v52: Agora busca os destinatários através do CLIENTE + Administradores
 * 
 * Destinatários:
 * - Gestão Comercial do cliente
 * - Gestão de Pessoas do cliente
 * - Focal R&S do cliente
 * - Gestores específicos do consultor (se diferentes)
 * - Todos os Administradores do sistema
 * 
 * Fluxo correto:
 * 1. Consultor → gestor_imediato_id → usuarios_cliente
 * 2. usuarios_cliente → id_cliente → clients
 * 3. clients → id_gestao_comercial, id_gestao_de_pessoas, id_gestor_rs → app_users
 * 4. Todos os usuários com tipo_usuario = 'Administrador'
 * 
 * @param consultant - Consultor que atingiu risco crítico
 * @param users - Lista de usuários do sistema (app_users)
 * @param usuariosCliente - Lista de gestores de clientes
 * @param clients - Lista de clientes
 * @param summary - Resumo da análise de risco
 * @returns Resultado do envio de notificações
 */
export const sendCriticalRiskNotifications = async (
    consultant: Consultant,
    users: User[],
    usuariosCliente: UsuarioCliente[],
    clients: Client[],
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

    // 1. Encontrar o gestor imediato do consultor (usuarios_cliente)
    const gestorImediato = usuariosCliente.find(uc => uc.id === consultant.gestor_imediato_id);
    
    if (!gestorImediato) {
        console.warn(`⚠️ Gestor imediato não encontrado para consultor ${consultant.nome_consultores}`);
        result.errors.push('Gestor imediato não encontrado');
    }

    // 2. Encontrar o cliente através do gestor imediato
    const client = gestorImediato 
        ? clients.find(c => c.id === gestorImediato.id_cliente)
        : null;

    if (!client) {
        console.warn(`⚠️ Cliente não encontrado para consultor ${consultant.nome_consultores}`);
        result.errors.push('Cliente não encontrado');
        return result;
    }

    const clientName = client.razao_social_cliente;
    console.log(`📋 Cliente identificado: ${clientName} (ID: ${client.id})`);

    // 3. Coletar IDs dos usuários que devem ser notificados (do CLIENTE)
    const userIdsToNotify: Set<number> = new Set();

    // Gestão Comercial do cliente
    if (client.id_gestao_comercial) {
        userIdsToNotify.add(client.id_gestao_comercial);
        console.log(`📧 Gestão Comercial (ID: ${client.id_gestao_comercial}) será notificado`);
    }

    // Gestão de Pessoas do cliente
    if (client.id_gestao_de_pessoas) {
        userIdsToNotify.add(client.id_gestao_de_pessoas);
        console.log(`📧 Gestão de Pessoas (ID: ${client.id_gestao_de_pessoas}) será notificado`);
    }

    // Gestor R&S (Focal) do cliente
    if (client.id_gestor_rs) {
        userIdsToNotify.add(client.id_gestor_rs);
        console.log(`📧 Focal R&S (ID: ${client.id_gestor_rs}) será notificado`);
    }

    // 4. Também notificar gestores específicos do consultor (se diferentes)
    if (consultant.gestor_rs_id && !userIdsToNotify.has(consultant.gestor_rs_id)) {
        userIdsToNotify.add(consultant.gestor_rs_id);
        console.log(`📧 Gestor R&S do consultor (ID: ${consultant.gestor_rs_id}) será notificado`);
    }

    if (consultant.id_gestao_de_pessoas && !userIdsToNotify.has(consultant.id_gestao_de_pessoas)) {
        userIdsToNotify.add(consultant.id_gestao_de_pessoas);
        console.log(`📧 Gestão de Pessoas do consultor (ID: ${consultant.id_gestao_de_pessoas}) será notificado`);
    }

    // 5. Notificar todos os Administradores do sistema
    const adminUsers = users.filter(user => 
        user.tipo_usuario === 'Administrador' && 
        user.ativo_usuario !== false && 
        user.receber_alertas_email !== false &&
        user.email_usuario && 
        user.email_usuario.includes('@')
    );
    
    adminUsers.forEach(admin => {
        if (!userIdsToNotify.has(admin.id)) {
            userIdsToNotify.add(admin.id);
            console.log(`📧 Administrador ${admin.nome_usuario} (ID: ${admin.id}) será notificado`);
        }
    });

    // 6. Filtrar usuários que devem receber notificação
    const recipientUsers = users.filter(user => {
        // Verificar se o usuário está na lista de IDs a notificar
        const shouldNotify = userIdsToNotify.has(user.id);
        
        // Verificar se o usuário está ativo e aceita receber alertas
        const isActive = user.ativo_usuario !== false;
        const acceptsAlerts = user.receber_alertas_email !== false;
        
        // Verificar se tem email válido
        const hasValidEmail = user.email_usuario && user.email_usuario.includes('@');

        if (shouldNotify) {
            if (!isActive) {
                console.log(`⚠️ Usuário ${user.nome_usuario} (ID: ${user.id}) está inativo - não será notificado`);
                return false;
            }
            if (!acceptsAlerts) {
                console.log(`⚠️ Usuário ${user.nome_usuario} (ID: ${user.id}) não aceita alertas por email`);
                return false;
            }
            if (!hasValidEmail) {
                console.log(`⚠️ Usuário ${user.nome_usuario} (ID: ${user.id}) não tem email válido`);
                return false;
            }
            return true;
        }
        
        return false;
    });

    if (recipientUsers.length === 0) {
        console.warn('⚠️ Nenhum usuário elegível para receber notificação de risco crítico');
        result.errors.push('Nenhum usuário elegível para notificação');
        return result;
    }

    console.log(`📬 ${recipientUsers.length} usuário(s) serão notificados:`);
    recipientUsers.forEach(u => console.log(`   - ${u.nome_usuario} (${u.email_usuario})`));

    // 6. Preparar data de inclusão
    const inclusionDate = consultant.data_inclusao_consultores 
        ? new Date(consultant.data_inclusao_consultores).toLocaleDateString('pt-BR')
        : 'Data não informada';

    // 6.1 Buscar nome do Gestão de Pessoas do cliente para assinatura do email
    const gestaoPessoasUser = client.id_gestao_de_pessoas 
        ? users.find(u => u.id === client.id_gestao_de_pessoas)
        : null;
    const gestaoPessoasName = gestaoPessoasUser?.nome_usuario || 'Equipe RMS-RAISA';

    // 7. Enviar email para cada destinatário
    for (const user of recipientUsers) {
        const success = await sendEmailViaAPI(
            user.email_usuario,
            user.nome_usuario,
            `RMS-RAISA: Atenção Necessária - ${consultant.nome_consultores}`,
            'critical_risk',
            {
                consultantName: consultant.nome_consultores,
                consultantCargo: consultant.cargo_consultores || 'Não informado',
                clientName,
                inclusionDate,
                summary,
                gestaoPessoasName
            }
        );

        if (success) {
            result.emailsSent++;
            result.recipients.push(user.email_usuario);
        } else {
            result.emailsFailed++;
            result.errors.push(`Falha ao enviar para ${user.email_usuario}`);
        }

        // Pequeno delay entre envios para evitar rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
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
