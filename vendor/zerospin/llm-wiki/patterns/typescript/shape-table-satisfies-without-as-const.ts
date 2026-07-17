import { makeTable } from '@zerospin/core/models/makeTable';
import { primitives } from '@zerospin/core/models/primitives';
import type { IAnyTables, IShape } from '@zerospin/core/models/types';

/**
 * Use `satisfies` alone for `IShape` / `IAnyTables`; reserve plain `as const` for readonly command-row parity.
 *
 * @bad Do not use `as const satisfies IShape` on repo table shapes.
 * @bad Do not use `as const satisfies IAnyTables` on `makeTable` maps.
 * @bad Do not use `satisfies IShape` when a typecheck compares a command shape to readonly command types.
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

const executedCommandShape = {
  id: primitives.primaryKey({ abbreviation: 'cmd' }),
  commandName: primitives.text(),
  payload: primitives.text(),
  version: primitives.text(),
  status: primitives.enum({
    values: ['executed'],
  }),
} as const;

void resourceRepoTables;
void executedCommandShape;
