/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const serverPort = Number(process.env.SERVER_PORT ?? 3001);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/socket.io': { target: `http://localhost:${serverPort}`, ws: true },
      '/healthz': { target: `http://localhost:${serverPort}` },
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 15000,
  },
});
