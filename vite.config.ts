import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: ['3000-id8kuotry735gknl0iee4-ab255f57.manusvm.computer', 'localhost', '127.0.0.1'],
    },
    plugins: [react()],
    hmr: {
      protocol: 'wss',
      host: '3000-id8kuotry735gknl0iee4-ab255f57.manusvm.computer',
      port: 443,
    },
    define: {
      'process.env.VITE_GEMINI_API': JSON.stringify(env.VITE_GEMINI_API),
      'process.env.SUPABASE_URL': JSON.stringify(env.SUPABASE_URL),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(env.SUPABASE_ANON_KEY)
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