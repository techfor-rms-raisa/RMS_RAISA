/**
 * API Route: Send Email via Resend
 * RMS-RAISA v52.1
 * 
 * Endpoint para envio de emails de alerta de risco crítico
 * Usa Resend como provedor de email (funciona em serverless)
 * 
 * OTIMIZADO v52.1: Template ajustado para evitar filtros de SPAM
 * - Removidos emojis do assunto
 * - Tom mais profissional e menos alarmista
 * - Melhor proporção texto/HTML
 * - Headers de entregabilidade
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';

// Inicializar Resend com API Key do ambiente
const resend = new Resend(process.env.RESEND_API_KEY);

// Configuração do remetente
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'RMS-RAISA <notificacoes@techfortirms.online>';

interface EmailRequest {
  to: string;
  toName: string;
  subject: string;
  consultantName?: string;
  consultantCargo?: string;
  clientName?: string;
  inclusionDate?: string;
  summary: string;
  type: 'critical_risk' | 'password_recovery' | 'general';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Apenas POST permitido
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verificar se API Key está configurada
  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY não configurada');
    return res.status(500).json({ 
      error: 'Email service not configured',
      details: 'RESEND_API_KEY environment variable is missing'
    });
  }

  try {
    const body: EmailRequest = req.body;

    // Validar campos obrigatórios
    if (!body.to || !body.subject) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        details: 'to and subject are required'
      });
    }

    console.log(`Enviando email para: ${body.to}`);
    console.log(`Tipo: ${body.type}`);

    let htmlContent: string;
    let textContent: string;
    let subject: string;

    // Gerar conteúdo baseado no tipo de email
    if (body.type === 'critical_risk') {
      // Assunto otimizado - sem emojis, profissional
      subject = `RMS-RAISA: Atenção Necessária - ${body.consultantName} - Avaliação de Risco`;
      htmlContent = generateCriticalRiskEmailHTML(body);
      textContent = generateCriticalRiskEmailText(body);
    } else if (body.type === 'password_recovery') {
      subject = `RMS-RAISA: Recuperação de Senha`;
      htmlContent = generatePasswordRecoveryHTML(body);
      textContent = generatePasswordRecoveryText(body);
    } else {
      subject = body.subject;
      htmlContent = `<p>${body.summary}</p>`;
      textContent = body.summary;
    }

    // Enviar email via Resend com headers otimizados
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [body.to],
      subject: subject,
      html: htmlContent,
      text: textContent,
      headers: {
        'X-Priority': '1',
        'X-Entity-Ref-ID': `rms-${Date.now()}`,
      },
    });

    if (error) {
      console.error('Erro Resend:', error);
      return res.status(500).json({ 
        error: 'Failed to send email',
        details: error.message
      });
    }

    console.log(`Email enviado com sucesso! ID: ${data?.id}`);
    
    return res.status(200).json({ 
      success: true,
      messageId: data?.id,
      to: body.to
    });

  } catch (error: any) {
    console.error('Erro ao enviar email:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message
    });
  }
}

/**
 * Gera HTML do email de alerta de risco - OTIMIZADO PARA EVITAR SPAM
 * - Sem emojis
 * - Tom profissional
 * - Cores mais neutras
 * - Boa proporção texto/HTML
 */
function generateCriticalRiskEmailHTML(data: EmailRequest): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Notificação RMS-RAISA</title>
</head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  
  <!-- Header com logo/marca -->
  <div style="background-color: #1e40af; padding: 25px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 600;">RMS-RAISA</h1>
    <p style="color: #93c5fd; margin: 5px 0 0 0; font-size: 14px;">Risk Management Systems</p>
  </div>
  
  <!-- Corpo do email -->
  <div style="background-color: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
    
    <p style="font-size: 16px; margin-bottom: 20px;">Prezado(a) <strong>${data.toName}</strong>,</p>
    
    <p style="font-size: 15px; margin-bottom: 20px;">
      Informamos que foi identificada uma situação que requer sua atenção no acompanhamento do consultor abaixo.
      A análise de risco indicou <strong style="color: #b91c1c;">nível máximo de atenção (Grau 5)</strong>.
    </p>
    
    <!-- Dados do Consultor -->
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; margin: 20px 0; border-radius: 6px;">
      <h3 style="margin: 0 0 15px 0; color: #1e40af; font-size: 16px; border-bottom: 2px solid #1e40af; padding-bottom: 8px;">
        Dados do Consultor
      </h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
          <td style="padding: 8px 0; font-weight: 600; color: #64748b; width: 140px;">Nome:</td>
          <td style="padding: 8px 0; color: #1e293b;">${data.consultantName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: 600; color: #64748b;">Cargo:</td>
          <td style="padding: 8px 0; color: #1e293b;">${data.consultantCargo || 'Não informado'}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: 600; color: #64748b;">Cliente:</td>
          <td style="padding: 8px 0; color: #1e293b;">${data.clientName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: 600; color: #64748b;">Data de Inclusão:</td>
          <td style="padding: 8px 0; color: #1e293b;">${data.inclusionDate || 'Não informada'}</td>
        </tr>
      </table>
    </div>
    
    <!-- Resumo da Análise -->
    <div style="background-color: #fffbeb; border: 1px solid #fcd34d; padding: 20px; margin: 20px 0; border-radius: 6px;">
      <h3 style="margin: 0 0 12px 0; color: #92400e; font-size: 16px;">
        Resumo da Análise
      </h3>
      <p style="margin: 0; font-size: 14px; color: #78350f; white-space: pre-line;">${data.summary}</p>
    </div>
    
    <!-- Próximos Passos -->
    <div style="background-color: #f0fdf4; border: 1px solid #86efac; padding: 20px; margin: 20px 0; border-radius: 6px;">
      <h3 style="margin: 0 0 12px 0; color: #166534; font-size: 16px;">
        Próximos Passos
      </h3>
      <p style="margin: 0; font-size: 14px; color: #15803d;">
        Recomendamos acessar o sistema RMS-RAISA para visualizar o histórico completo de avaliações, 
        as estratégias de retenção sugeridas e registrar as ações tomadas.
      </p>
    </div>
    
    <!-- Botão de Acesso -->
    <div style="text-align: center; margin: 30px 0;">
      <a href="https://techfortirms.online" 
         style="background-color: #1e40af; color: #ffffff; padding: 14px 35px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; font-size: 15px;">
        Acessar Sistema RMS-RAISA
      </a>
    </div>
    
    <p style="font-size: 14px; color: #64748b; margin-top: 25px;">
      Atenciosamente,<br>
      <strong>Equipe RMS-RAISA</strong>
    </p>
    
  </div>
  
  <!-- Footer -->
  <div style="background-color: #f1f5f9; padding: 20px; border-radius: 0 0 8px 8px; text-align: center; border: 1px solid #e5e7eb; border-top: none;">
    <p style="font-size: 12px; color: #64748b; margin: 0;">
      <strong>TECHFOR TI</strong><br>
      Risk Management Systems - RMS-RAISA<br>
      <a href="https://techfortirms.online" style="color: #1e40af; text-decoration: none;">techfortirms.online</a>
    </p>
    <p style="font-size: 11px; color: #94a3b8; margin: 10px 0 0 0;">
      Este é um email automático do sistema RMS-RAISA. Por favor, não responda diretamente a este email.
    </p>
  </div>
  
</body>
</html>
  `.trim();
}

/**
 * Gera texto plano do email - OTIMIZADO PARA EVITAR SPAM
 */
function generateCriticalRiskEmailText(data: EmailRequest): string {
  return `
RMS-RAISA - Notificação de Acompanhamento

Prezado(a) ${data.toName},

Informamos que foi identificada uma situação que requer sua atenção no acompanhamento do consultor abaixo.
A análise de risco indicou nível máximo de atenção (Grau 5).

DADOS DO CONSULTOR:
- Nome: ${data.consultantName}
- Cargo: ${data.consultantCargo || 'Não informado'}
- Cliente: ${data.clientName}
- Data de Inclusão: ${data.inclusionDate || 'Não informada'}

RESUMO DA ANÁLISE:
${data.summary}

PRÓXIMOS PASSOS:
Recomendamos acessar o sistema RMS-RAISA para visualizar o histórico completo de avaliações, 
as estratégias de retenção sugeridas e registrar as ações tomadas.

Acesse: https://techfortirms.online

Atenciosamente,
Equipe RMS-RAISA

---
TECHFOR TI
Risk Management Systems - RMS-RAISA
https://techfortirms.online

Este é um email automático do sistema RMS-RAISA.
  `.trim();
}

/**
 * Gera HTML do email de recuperação de senha
 */
function generatePasswordRecoveryHTML(data: EmailRequest): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recuperação de Senha - RMS-RAISA</title>
</head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  
  <div style="background-color: #1e40af; padding: 25px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 600;">RMS-RAISA</h1>
    <p style="color: #93c5fd; margin: 5px 0 0 0; font-size: 14px;">Risk Management Systems</p>
  </div>
  
  <div style="background-color: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
    
    <p style="font-size: 16px; margin-bottom: 20px;">Prezado(a) <strong>${data.toName}</strong>,</p>
    
    <p style="font-size: 15px; margin-bottom: 20px;">
      Recebemos uma solicitação de recuperação de senha para sua conta no sistema RMS-RAISA.
    </p>
    
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 25px; margin: 20px 0; border-radius: 6px; text-align: center;">
      <p style="margin: 0 0 10px 0; font-size: 14px; color: #64748b;">Sua nova senha temporária é:</p>
      <code style="font-size: 28px; font-weight: bold; color: #1e40af; background-color: #e0e7ff; padding: 10px 25px; border-radius: 4px; display: inline-block;">Novo@</code>
    </div>
    
    <p style="font-size: 14px; color: #64748b;">
      Por segurança, recomendamos que você altere esta senha após efetuar o login.
    </p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="https://techfortirms.online" 
         style="background-color: #1e40af; color: #ffffff; padding: 14px 35px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; font-size: 15px;">
        Acessar Sistema RMS-RAISA
      </a>
    </div>
    
    <p style="font-size: 14px; color: #64748b; margin-top: 25px;">
      Atenciosamente,<br>
      <strong>Equipe RMS-RAISA</strong>
    </p>
    
  </div>
  
  <div style="background-color: #f1f5f9; padding: 20px; border-radius: 0 0 8px 8px; text-align: center; border: 1px solid #e5e7eb; border-top: none;">
    <p style="font-size: 12px; color: #64748b; margin: 0;">
      <strong>TECHFOR TI</strong><br>
      Risk Management Systems - RMS-RAISA<br>
      <a href="https://techfortirms.online" style="color: #1e40af; text-decoration: none;">techfortirms.online</a>
    </p>
    <p style="font-size: 11px; color: #94a3b8; margin: 10px 0 0 0;">
      Se você não solicitou esta recuperação de senha, por favor ignore este email.
    </p>
  </div>
  
</body>
</html>
  `.trim();
}

/**
 * Gera texto plano do email de recuperação de senha
 */
function generatePasswordRecoveryText(data: EmailRequest): string {
  return `
RMS-RAISA - Recuperação de Senha

Prezado(a) ${data.toName},

Recebemos uma solicitação de recuperação de senha para sua conta no sistema RMS-RAISA.

Sua nova senha temporária é: Novo@

Por segurança, recomendamos que você altere esta senha após efetuar o login.

Acesse: https://techfortirms.online

Atenciosamente,
Equipe RMS-RAISA

---
TECHFOR TI
Risk Management Systems - RMS-RAISA
https://techfortirms.online

Se você não solicitou esta recuperação de senha, por favor ignore este email.
  `.trim();
}
