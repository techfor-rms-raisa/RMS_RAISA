/**
 * Supabase Client Configuration
 * Configuração do cliente Supabase para acesso ao banco de dados
 */

import { createClient } from '@supabase/supabase-js';

// Supabase URL e chave pública (anon key)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ ERRO: Variáveis de ambiente do Supabase não configuradas!');
  console.error('Configure SUPABASE_URL e SUPABASE_ANON_KEY no arquivo .env.local ou no Vercel');
}

// Criar e exportar o cliente Supabase
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Exportar tipos úteis
export type { PostgrestError } from '@supabase/supabase-js';
