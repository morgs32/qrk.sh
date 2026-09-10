import { contracts } from '@zerospin/core/contracts/index';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { models } from '@zerospin/core/models/index';
import { makeTable, primitives } from '@zerospin/schema';

/**
 * Use table refs for concrete same-database relations, `primitives.self` for relations to the current table, foreign keys for identities with no local relational target, and `primitives.foreignKey` for caller-supplied payload IDs. Every persisted table ref becomes an immediate SQLite foreign key with default NO ACTION behavior, so pass resource-model and other-table definitions through one `makeResourceDbConfig` graph.
 *
 * @bad Do not use `primitives.foreignKey` when a persisted column targets one concrete table in the same database.
 * @bad Do not use `primitives.foreignKey` for a relation to the current table.
 * @bad Do not use `primitives.ref` for external, polymorphic, provenance, or cross-database identities.
 * @bad Do not put `primitives.ref` or raw `primitives.primaryKey` descriptors in contract payloads.
 * @bad Supply every non-nullable payload ID explicitly; payload decoding never generates IDs.
 * @bad Do not build referenced resource tables and other tables as separate database configs; the lazy target resolver requires one complete database graph.
 */
const UserModel = models.makeModel({ name: 'user', abbreviation: 'usr' });

const User = models.makeVersion(UserModel, {
  attributes: {
    clerkUserId: primitives.foreignKey({ abbreviation: 'clerkusr' }),
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
    externalRequestId: primitives.foreignKey({ abbreviation: 'req' }),
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

export const createUser = contracts.makeVersion(
  contracts.makeCommand('createUser'),
  {
    payload: {
      id: primitives.foreignKey({ abbreviation: UserModel.abbreviation }),
      clerkUserId: primitives.foreignKey({ abbreviation: 'clerkusr' }),
      name: primitives.text(),
    },
    version: '1.0.0',
  },
);

export const renameUser = contracts.makeVersion(
  contracts.makeCommand('renameUser'),
  {
    payload: {
      id: primitives.foreignKey({ abbreviation: UserModel.abbreviation }),
      name: primitives.text(),
    },
    version: '1.0.0',
  },
);
