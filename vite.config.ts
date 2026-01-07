import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// DEBUG: Mostrar todas as variáveis VITE_* disponíveis no build
console.log('═══════════════════════════════════════════════════════');
console.log('🔧 VITE BUILD - DEBUG ENVIRONMENT VARIABLES');
console.log('═══════════════════════════════════════════════════════');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('VERCEL:', process.env.VERCEL);
console.log('VERCEL_ENV:', process.env.VERCEL_ENV);
console.log('');
console.log('VITE_SUPABASE_URL exists:', !!process.env.VITE_SUPABASE_URL);
console.log('VITE_SUPABASE_ANON_KEY exists:', !!process.env.VITE_SUPABASE_ANON_KEY);
console.log('');
console.log('All env vars starting with VITE_:');
Object.keys(process.env)
  .filter(key => key.startsWith('VITE_'))
  .forEach(key => console.log(`  ${key}: ${process.env[key]?.substring(0, 20)}...`));
console.log('═══════════════════════════════════════════════════════');

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react()],
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
});
