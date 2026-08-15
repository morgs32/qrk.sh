import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/SharedWorker/userReplicaSchemas.ts',
  out: './src/SharedWorker/drizzle/userReplica',
});
