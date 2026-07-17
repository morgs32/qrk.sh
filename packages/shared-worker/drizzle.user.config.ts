import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/SharedWorker/userSchemas.ts',
  out: './src/SharedWorker/drizzle/user',
});
