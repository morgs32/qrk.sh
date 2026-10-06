import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [react(), tailwindcss()],
  server: { port: 3040, strictPort: true },
  preview: { port: 3041, strictPort: true },
  test: { include: ['src/**/*.spec.ts'], environment: 'node' },
});
