import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { requireClerkKey } from './clerkConfig';

export default defineConfig(({ mode }) => {
    const env = { ...loadEnv(mode, '.', ''), ...process.env };
    const publishableKey = requireClerkKey(env, mode === 'production', 'publishable');
    return {
      define: {
        'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': JSON.stringify(publishableKey),
      },
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
