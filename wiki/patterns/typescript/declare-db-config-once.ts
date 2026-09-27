/**
 * Keep each DB config file to one declaration: its exported config, with tables
 * and shapes inline. Imports do not count as declarations.
 * Reference sibling tables by config key and primary-key column with
 * primitives.ref({ table: 'orders', column: 'id', relation, inverse }).
 * makeDbConfig resolves names, infers codecs, and preserves SQL relations.
 * Read tables from config.tables and row schemas from config.tables.<name>.codec.
 * The sole exception is packages/system-worker/src/SystemLogRepo/systemLogRepoDbConfig.ts:
 * keep its private telemetrySpansTable because logs and links reference that
 * exact table object through primitives.ref. Do not generalize this exception.
 * Keep row-type assertions in a sibling typecheck file, using config table shapes.
 *
 * @bad Separate exported *Tables maps or derived *Schema constants for one config.
 * @bad Private table, shape, schema, or source aliases beside the config declaration.
 * @bad Moving config-only declarations into helper files, factories, or IIFEs to hide them.
 * @bad Reconstructing a table codec with makeEffectSchema(table.shape).
 * @bad Extracting a one-table field map into another constant or file.
 */
import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeTable, primitives } from '@zerospin/schema';

export const orderRepoDbConfig = makeDbConfig({
  tables: {
    orders: makeTable({
      name: 'orders',
      shape: {
        id: primitives.primaryKey({ abbreviation: 'ord' }),
        createdAt: primitives.date(),
      },
    }),
    orderItems: makeTable({
      name: 'orderItems',
      shape: {
        id: primitives.primaryKey({ abbreviation: 'oi' }),
        orderId: primitives.ref({
          table: 'orders',
          column: 'id',
          relation: 'order',
          inverse: 'items',
        }),
      },
    }),
  },
});
