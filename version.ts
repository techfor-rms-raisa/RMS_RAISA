/**
 * ARQUIVO DE VERSÃO E TRACE
 * Fornece informações de versão e rastreamento para logs do Vercel
 * 
 * Este arquivo é importado por analyze-activity-report.ts para mostrar
 * qual versão está rodando e quais variáveis de ambiente estão disponíveis
 * 
 * v52 - Migração para Resend (backend) + Correção destinatários via Cliente
 */

/**
 * VERSÃO DA APLICAÇÃO
 * Atualize este número sempre que fizer um novo deploy
 * Formato: v[MAJOR].[MINOR].[PATCH]
 */
export const APP_VERSION = {
  major: 1,
  minor: 0,
  patch: 52,
  timestamp: new Date().toISOString(),
  
  toString(): string {
    return `v${this.major}.${this.minor}.${this.patch}`;
  },
  
  getFullInfo(): string {
    return `${this.toString()} (${this.timestamp})`;
  }
};

/**
 * FEATURES TRACE
 * Lista de funcionalidades ativas nesta versão
 */
export const FEATURES_TRACE = {
  geminiAI: {
    enabled: true,
    sdk: '@google/genai',
    model: 'gemini-2.5-flash',
    schema: 'structured'
  },
  reportAnalysis: {
    enabled: true,
    version: '52'
  },
  technicalQuestions: {
    enabled: true,
    version: '1.0'
  },
  cronJobs: {
    enabled: true,
    jobs: ['repriorizacao', 'analise-mensal', 'limpeza-notificacoes']
  },
  // 🚨 NOVO v51: Notificação de Risco Crítico
  criticalRiskNotification: {
    enabled: true,
    version: '1.0',
    triggerScore: 5,
    recipients: ['gestor_rs_id', 'id_gestao_de_pessoas']
  }
};

/**
 * ENVIRONMENT TRACE
 * Rastreamento de variáveis de ambiente
 */
export const ENV_TRACE = {
  getEnvironmentInfo(): object {
    return {
      NODE_ENV: process.env.NODE_ENV || 'unknown',
      VITE_API_KEY_present: !!process.env.VITE_API_KEY,
      API_KEY_present: !!process.env.API_KEY,
      VITE_SUPABASE_URL_present: !!process.env.VITE_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY_present: !!process.env.VITE_SUPABASE_ANON_KEY,
      vercelEnv: process.env.VERCEL_ENV || 'unknown',
      vercelRegion: process.env.VERCEL_REGION || 'unknown'
    };
  }
};

/**
 * INICIALIZAR TRACES
 * Chamado na primeira requisição para logar informações de versão
 */
export function initializeTraces(): void {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    🚀 RMS_RAISA INICIALIZADO              ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║ Versão:                ${APP_VERSION.toString().padEnd(40)} ║`);
  console.log(`║ Build Time:            ${APP_VERSION.timestamp.padEnd(40)} ║`);
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║                       📋 FEATURES ATIVAS                  ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║ Gemini AI:             ${(FEATURES_TRACE.geminiAI.enabled ? '✅' : '❌')} ${FEATURES_TRACE.geminiAI.sdk.padEnd(35)} ║`);
  console.log(`║ Modelo:                ${FEATURES_TRACE.geminiAI.model.padEnd(40)} ║`);
  console.log(`║ Report Analysis:       ${(FEATURES_TRACE.reportAnalysis.enabled ? '✅' : '❌')} v${FEATURES_TRACE.reportAnalysis.version.padEnd(35)} ║`);
  console.log(`║ Technical Questions:   ${(FEATURES_TRACE.technicalQuestions.enabled ? '✅' : '❌')} v${FEATURES_TRACE.technicalQuestions.version.padEnd(35)} ║`);
  console.log(`║ Cron Jobs:             ${(FEATURES_TRACE.cronJobs.enabled ? '✅' : '❌')} ${FEATURES_TRACE.cronJobs.jobs.length} jobs ativo${FEATURES_TRACE.cronJobs.jobs.length > 1 ? 's' : ''.padEnd(32)} ║`);
  console.log(`║ 🚨 Critical Risk Alert: ${(FEATURES_TRACE.criticalRiskNotification.enabled ? '✅' : '❌')} Score ${FEATURES_TRACE.criticalRiskNotification.triggerScore}                             ║`);
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║                    🌍 AMBIENTE DE EXECUÇÃO                ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  
  const envInfo = ENV_TRACE.getEnvironmentInfo();
  Object.entries(envInfo).forEach(([key, value]) => {
    const displayValue = typeof value === 'boolean' 
      ? (value ? '✅ SIM' : '❌ NÃO') 
      : String(value);
    console.log(`║ ${key.padEnd(28)} ${displayValue.padEnd(28)} ║`);
  });
  
  console.log('╚════════════════════════════════════════════════════════════╝\n');
}

/**
 * LOG DE VERSÃO
 * Função auxiliar para logar a versão em qualquer lugar
 */
export function logVersion(): void {
  console.log(`\n📌 RMS_RAISA ${APP_VERSION.getFullInfo()}\n`);
}

/**
 * VERIFICAR VERSÃO
 * Função para verificar se a versão está correta
 */
export function verifyVersion(expectedVersion: string): boolean {
  const currentVersion = APP_VERSION.toString();
  const isCorrect = currentVersion === expectedVersion;
  
  if (!isCorrect) {
    console.warn(`⚠️ [VERSION] Versão esperada: ${expectedVersion}, mas encontrada: ${currentVersion}`);
  }
  
  return isCorrect;
}
