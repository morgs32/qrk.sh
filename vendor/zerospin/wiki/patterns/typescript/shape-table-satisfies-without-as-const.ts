import {
  makeTable,
  primitives,
  type IAnyTables,
  type IShape,
} from '@zerospin/schema';

/**
 * Use `satisfies` alone for `IShape` / `IAnyTables`; reserve plain `as const` for readonly command-occurrence parity.
 *
 * @bad Do not use `as const satisfies IShape` on repo table shapes.
 * @bad Do not use `as const satisfies IAnyTables` on `makeTable` maps.
 * @bad Do not use `satisfies IShape` when a typecheck compares an occurrence shape to readonly command types.
 */
const resourceRefShape = {
  resourceId: primitives.text({ unique: true }),
  modelName: primitives.text(),
} satisfies IShape;

const resourceRepoTables = {
  refs: makeTable({
    name: 'refs',
    shape: resourceRefShape,
  }),
} satisfies IAnyTables;

const aggregateCommandOccurrenceShape = {
  aggregateIndex: primitives.integer({ primaryKey: true }),
  commandId: primitives.text({ unique: true }),
  canonicalBytes: primitives.text(),
  chainedAt: primitives.date(),
  result: primitives.text({ nullable: true }),
} as const;

void resourceRepoTables;
void aggregateCommandOccurrenceShape;
