import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, the browser talks only to :5173; /api and /uploads are proxied to the Express server.
// => same origin => no CORS headaches, and the httpOnly auth cookie "just works".
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5001',
      '/uploads': 'http://localhost:5001',
    },
  },
});
