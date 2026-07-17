import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeTable } from '@zerospin/core/models/makeTable';
import { primitives } from '@zerospin/core/models/primitives';

const replicasTable = makeTable({
  name: 'replicas',
  shape: {
    id: primitives.primaryKey({ abbreviation: 'frp' }),
    accountId: primitives.text(),
    accountName: primitives.text(),
    actorId: primitives.text(),
    actorName: primitives.text(),
    frontendName: primitives.text(),
    frontendVersion: primitives.text(),
    databaseName: primitives.text(),
  },
  indexes: [
    {
      name: 'replicas_actor_frontend_version_idx',
      columns: ['actorId', 'frontendName', 'frontendVersion'],
      unique: true,
    },
    {
      name: 'replicas_frontend_idx',
      columns: ['frontendName'],
    },
  ],
});

export const userDbConfig = makeDbConfig({
  tables: {
    replicas: replicasTable,
  },
});

export const userSchemas = userDbConfig.schema;
export const { replicas } = userSchemas;
