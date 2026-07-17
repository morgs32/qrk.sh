import { makeContract } from '@zerospin/core/contracts/makeContract';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeModel } from '@zerospin/core/models/makeModel';
import { makeTable } from '@zerospin/core/models/makeTable';
import { primitives } from '@zerospin/core/models/primitives';

/**
 * Use table refs for concrete same-database relations, `primitives.self` for relations to the current table, opaque IDs for identities with no local relational target, and `Model.primaryKey` for payload model keys.
 *
 * @bad Do not use `primitives.opaqueId` when a persisted column targets one concrete table in the same database.
 * @bad Do not use `primitives.opaqueId` for a relation to the current table.
 * @bad Do not use `primitives.ref` for external, polymorphic, provenance, or cross-database identities.
 * @bad Do not put `primitives.ref` or raw `primitives.primaryKey` descriptors in contract payloads.
 * @bad Do not omit the required `autogenerate` decision from a payload model key.
 */
const User = makeModel({
  abbreviation: 'usr',
  modelName: 'user',
  attributes: {
    clerkUserId: primitives.opaqueId({ abbreviation: 'clerkusr' }),
    name: primitives.text(),
  },
  version: 1,
});

const auditEventTable = makeTable({
  name: 'auditEvent',
  shape: {
    id: primitives.primaryKey({ abbreviation: 'aevt' }),
    userId: primitives.ref({
      table: User.table,
      relation: 'user',
      inverse: 'auditEvents',
    }),
    externalRequestId: primitives.opaqueId({ abbreviation: 'req' }),
  },
});

const categoryTable = makeTable({
  name: 'category',
  shape: {
    id: primitives.primaryKey({ abbreviation: 'cat' }),
    parentCategoryId: primitives.self({
      relation: 'parentCategory',
      inverse: 'childCategories',
      nullable: true,
    }),
  },
});

export const userDbConfig = makeResourceDbConfig({
  models: { user: User },
  otherTables: {
    auditEvent: auditEventTable,
    category: categoryTable,
  },
});

export const createUser = makeContract({
  commandName: 'createUser',
  payload: {
    id: User.primaryKey({ autogenerate: true }),
    clerkUserId: primitives.opaqueId({ abbreviation: 'clerkusr' }),
    name: primitives.text(),
  },
  version: '1.0.0',
});

export const renameUser = makeContract({
  commandName: 'renameUser',
  payload: {
    id: User.primaryKey({ autogenerate: false }),
    name: primitives.text(),
  },
  version: '1.0.0',
});
