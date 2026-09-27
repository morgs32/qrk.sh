import react from '@vitejs/plugin-react';
import { backupWorkerPlugin } from '@zerospin/backup-worker/vite';
import { nodeWorkerPlugin } from '@zerospin/browser/vite';
import { defineConfig } from 'vite';
export default defineConfig({
  plugins: [backupWorkerPlugin(), nodeWorkerPlugin(), react()],
});
