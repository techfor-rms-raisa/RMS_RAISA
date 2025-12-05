import emailjs from '@emailjs/browser';
import { User, Consultant, Client } from '../src/components/types';

// --- EMAILJS CONFIGURATION ---
const SERVICE_ID = "service_n9l30w7";
const TEMPLATE_ID = "template_m4etler";
const PUBLIC_KEY = "QZenXL-lVW_U_P2jT";

// Initialize EmailJS
emailjs.init(PUBLIC_KEY);

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
        console.log(`Email de recuperação enviado para ${user.email_usuario}`);
        return true;
    } catch (error) {
        console.error("Erro ao enviar email de recuperação:", error);
        return false;
    }
};

export const sendRiskAlertEmail = async (
    recipientUser: User, 
    consultant: Consultant, 
    clientName: string,
    hrManagerName: string
): Promise<boolean> => {
    const inclusionDate = new Date(consultant.data_inclusao_consultores).toLocaleDateString('pt-BR');

    const messageBody = `Olá ${recipientUser.nome_usuario}

Identificamos um grau de Risco 1 - VERMELHO, para o Consultor ${consultant.nome_consultores} - ${consultant.cargo_consultores} contratado em ${inclusionDate} 
atuando no Cliente: ${clientName}.

As estratégias de Retenção já foram publicadas e notificadas para ${hrManagerName}

Grato

TECHFOR TI 
RMS - Risk Management Systems`;

    const templateParams = {
        to_name: recipientUser.nome_usuario,
        to_email: recipientUser.email_usuario,
        subject: "Risk Management Systems - Alerta Consultor em Risco",
        message: messageBody,
    };

    try {
        await emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams);
        console.log(`Alerta de Risco enviado para ${recipientUser.email_usuario}`);
        return true;
    } catch (error) {
        console.error("Erro ao enviar alerta de risco:", error);
        return false;
    }
};