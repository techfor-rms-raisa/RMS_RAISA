/**
 * VERSION CONTROL & TRACE CONFIGURATION
 * Centraliza informações de versão e traces para debugging
 */

export const APP_VERSION = "V2.6";

export interface FeatureTrace {
  name: string;
  enabled: boolean;
  version: string;
}

export const FEATURES_TRACE: FeatureTrace[] = [
  { name: 'RMS Core', enabled: true, version: '2.6' },
  { name: 'RAISA Recruitment', enabled: true, version: '1.0' },
  { name: 'AI Analysis', enabled: true, version: '2.0' },
  { name: 'Compliance Module', enabled: true, version: '1.5' },
  { name: 'Behavioral Memory', enabled: true, version: '1.0' },
];

export interface EnvTrace {
  key: string;
  present: boolean;
  masked?: string;
}

export const ENV_TRACE: EnvTrace[] = [];

export function initializeTraces(): void {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log(`║ RMS-RAISA ${APP_VERSION} - Trace Initialization              ║`);
  console.log('╠════════════════════════════════════════════════════════════╣');
  
  // Check environment variables
  const envVars = ['API_KEY', 'VITE_API_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  
  envVars.forEach(key => {
    const value = process.env[key];
    const present = !!value;
    const masked = present ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}` : 'NOT SET';
    
    ENV_TRACE.push({ key, present, masked });
    console.log(`║ ${key}: ${present ? '✅' : '❌'} ${masked.padEnd(20)} ║`);
  });
  
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║ Features:                                                   ║');
  
  FEATURES_TRACE.forEach(feature => {
    console.log(`║ ${feature.enabled ? '✅' : '❌'} ${feature.name.padEnd(20)} v${feature.version.padEnd(10)} ║`);
  });
  
  console.log('╚════════════════════════════════════════════════════════════╝');
}
