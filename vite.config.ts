import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = { ...loadEnv(mode, '.', ''), ...process.env };
    return {
      server: {
        port: 5000,
        host: '0.0.0.0',
        allowedHosts: true,
        watch: {
          ignored: ['**/.local/**', '**/dist/**', '**/.cache/**'],
        },
      },
      plugins: [react()],
      // Note: AI provider keys are intentionally NOT exposed to the client.
      // All AI calls go through authenticated /api/ai/* endpoints on the server.
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
