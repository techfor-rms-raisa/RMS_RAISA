/**
 * API Route: Send Email via Resend
 * RMS-RAISA v51
 * 
 * Endpoint para envio de emails de alerta de risco crítico
 * Usa Resend como provedor de email (funciona em serverless)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';

// Inicializar Resend com API Key do ambiente
const resend = new Resend(process.env.RESEND_API_KEY);

// Configuração do remetente
// IMPORTANTE: Após verificar seu domínio no Resend, altere para seu email
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'RMS-RAISA Alertas <alertas@techfortirms.online>';

interface EmailRequest {
  to: string;
  toName: string;
  subject: string;
  consultantName: string;
  consultantCargo?: string;
  clientName: string;
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
    console.error('❌ RESEND_API_KEY não configurada');
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

    console.log(`📧 Enviando email para: ${body.to}`);
    console.log(`📋 Tipo: ${body.type}`);
    console.log(`📌 Assunto: ${body.subject}`);

    let htmlContent: string;
    let textContent: string;

    // Gerar conteúdo baseado no tipo de email
    if (body.type === 'critical_risk') {
      htmlContent = generateCriticalRiskEmailHTML(body);
      textContent = generateCriticalRiskEmailText(body);
    } else if (body.type === 'password_recovery') {
      htmlContent = generatePasswordRecoveryHTML(body);
      textContent = generatePasswordRecoveryText(body);
    } else {
      htmlContent = `<p>${body.summary}</p>`;
      textContent = body.summary;
    }

    // Enviar email via Resend
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [body.to],
      subject: body.subject,
      html: htmlContent,
      text: textContent,
    });

    if (error) {
      console.error('❌ Erro Resend:', error);
      return res.status(500).json({ 
        error: 'Failed to send email',
        details: error.message
      });
    }

    console.log(`✅ Email enviado com sucesso! ID: ${data?.id}`);
    
    return res.status(200).json({ 
      success: true,
      messageId: data?.id,
      to: body.to
    });

  } catch (error: any) {
    console.error('❌ Erro ao enviar email:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message
    });
  }
}

/**
 * Gera HTML do email de alerta de risco crítico
 */
function generateCriticalRiskEmailHTML(data: EmailRequest): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Alerta de Risco Crítico</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 20px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">🚨 ALERTA DE RISCO CRÍTICO</h1>
  </div>
  
  <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 20px; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px;">Olá <strong>${data.toName}</strong>,</p>
    
    <p style="font-size: 16px;">Identificamos um grau de <strong style="color: #dc2626;">Risco 5 - CRÍTICO</strong> para o consultor abaixo:</p>
    
    <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;">
      <h3 style="margin: 0 0 10px 0; color: #991b1b;">📋 DADOS DO CONSULTOR</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 5px 0; font-weight: bold; width: 140px;">Nome:</td>
          <td style="padding: 5px 0;">${data.consultantName}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; font-weight: bold;">Cargo:</td>
          <td style="padding: 5px 0;">${data.consultantCargo || 'Não informado'}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; font-weight: bold;">Cliente:</td>
          <td style="padding: 5px 0;">${data.clientName}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; font-weight: bold;">Data de Contratação:</td>
          <td style="padding: 5px 0;">${data.inclusionDate || 'Não informada'}</td>
        </tr>
      </table>
    </div>
    
    <div style="background: #f3f4f6; padding: 15px; margin: 20px 0; border-radius: 8px;">
      <h3 style="margin: 0 0 10px 0; color: #374151;">📊 RESUMO DA ANÁLISE</h3>
      <p style="margin: 0; white-space: pre-line;">${data.summary}</p>
    </div>
    
    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;">
      <h3 style="margin: 0 0 10px 0; color: #92400e;">⚠️ AÇÃO NECESSÁRIA</h3>
      <p style="margin: 0;">Este consultor requer <strong>atenção imediata</strong>. Por favor, acesse o sistema RMS para visualizar as estratégias de retenção recomendadas e tomar as providências necessárias.</p>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="https://techfortirms.online" style="background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Acessar RMS-RAISA</a>
    </div>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
    
    <p style="font-size: 12px; color: #6b7280; text-align: center;">
      TECHFOR TI<br>
      RMS - Risk Management Systems<br>
      <a href="https://techfortirms.online" style="color: #3b82f6;">https://techfortirms.online</a>
    </p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Gera texto plano do email de alerta de risco crítico
 */
function generateCriticalRiskEmailText(data: EmailRequest): string {
  return `
🚨 ALERTA DE RISCO CRÍTICO 🚨

Olá ${data.toName},

Identificamos um grau de Risco 5 - CRÍTICO para o consultor abaixo:

📋 DADOS DO CONSULTOR:
• Nome: ${data.consultantName}
• Cargo: ${data.consultantCargo || 'Não informado'}
• Cliente: ${data.clientName}
• Data de Contratação: ${data.inclusionDate || 'Não informada'}

📊 RESUMO DA ANÁLISE:
${data.summary}

⚠️ AÇÃO NECESSÁRIA:
Este consultor requer atenção imediata. Por favor, acesse o sistema RMS para visualizar as estratégias de retenção recomendadas e tomar as providências necessárias.

Acesse: https://techfortirms.online

---
TECHFOR TI
RMS - Risk Management Systems
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
  <title>Recuperação de Senha</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 20px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">🔐 Recuperação de Senha</h1>
  </div>
  
  <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 20px; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px;">Olá <strong>${data.toName}</strong>,</p>
    
    <p style="font-size: 16px;">Você solicitou alteração de senha. Para fazer um novo login, use a senha temporária:</p>
    
    <div style="background: #f3f4f6; padding: 20px; margin: 20px 0; border-radius: 8px; text-align: center;">
      <code style="font-size: 24px; font-weight: bold; color: #1d4ed8;">Novo@</code>
    </div>
    
    <p style="font-size: 16px;">Após efetuar o login, altere a senha novamente de acordo com sua preferência.</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="https://techfortirms.online" style="background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Acessar RMS-RAISA</a>
    </div>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
    
    <p style="font-size: 12px; color: #6b7280; text-align: center;">
      TECHFOR TI<br>
      RMS - Risk Management Systems<br>
      <a href="https://techfortirms.online" style="color: #3b82f6;">https://techfortirms.online</a>
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
🔐 Recuperação de Senha

Olá ${data.toName},

Você solicitou alteração de senha. Para fazer um novo login, use a senha temporária:

Senha: Novo@

Após efetuar o login, altere a senha novamente de acordo com sua preferência.

Acesse: https://techfortirms.online

---
TECHFOR TI
RMS - Risk Management Systems
  `.trim();
}
