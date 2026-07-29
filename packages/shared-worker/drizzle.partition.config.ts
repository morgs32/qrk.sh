import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/SharedWorker/partitionSchemas.ts',
  out: './src/SharedWorker/drizzle/partition',
});
