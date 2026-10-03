import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: { port: 3040, strictPort: true },
  preview: { port: 3041, strictPort: true },
  test: { include: ['src/**/*.spec.ts'], environment: 'node' },
});
