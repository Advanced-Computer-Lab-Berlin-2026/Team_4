import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Read the backend port at startup. Secrets are not exposed to the client bundle.
export default defineConfig(({ mode }) => {
  const serverEnv = loadEnv(mode, fileURLToPath(new URL('../server', import.meta.url)), '');
  const port = parseInt(process.env.PORT || serverEnv.PORT, 10) || 5000;
  const target = `http://localhost:${port}`;
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: { '/api': target, '/uploads': target },
    },
  };
});
