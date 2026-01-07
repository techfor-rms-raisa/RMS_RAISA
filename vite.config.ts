import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Em produção (Vercel), as variáveis vêm de process.env
  // Em desenvolvimento local, vêm do .env.local
  const VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
  const VITE_SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

  // Log para debug no build
  console.log('🔧 [Vite Build] Mode:', mode);
  console.log('🔧 [Vite Build] VITE_SUPABASE_URL presente:', !!VITE_SUPABASE_URL);
  console.log('🔧 [Vite Build] VITE_SUPABASE_ANON_KEY presente:', !!VITE_SUPABASE_ANON_KEY);

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    define: {
      // Injetar as variáveis de ambiente no bundle
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(VITE_SUPABASE_URL),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(VITE_SUPABASE_ANON_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@/types': path.resolve(__dirname, './src/types'),
        '@/components': path.resolve(__dirname, './src/components'),
        '@/services': path.resolve(__dirname, './src/services'),
        '@/hooks': path.resolve(__dirname, './src/hooks'),
        '@/config': path.resolve(__dirname, './src/config'),
      }
    }
  };
});
