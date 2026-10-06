import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      'virtual:zerospin-studio-agents': fileURLToPath(
        new URL('./src/fixtures/agents.ts', import.meta.url),
      ),
    },
  },
  plugins: [react(), tailwindcss()],
});
