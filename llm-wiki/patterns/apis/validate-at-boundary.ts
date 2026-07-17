import { Effect } from 'effect';
import { Schema } from 'effect/Schema';

/**
 * Validate unknown inputs only at trust boundaries — not typed literals you just built.
 *
 * @bad Run `Schema.validate` on a row assembled from typed props right before Drizzle insert.
 */
export const handleRpcInput = Effect.fn('handleRpcInput')(function* (props: {
  rawFromRpc: unknown;
}) {
  const validated = yield* Schema.validate(SomeInputSchema)(props.rawFromRpc, {
    onExcessProperty: 'ignore',
  }).pipe(mapRpcParseError());

  return validated;
});

declare const SomeInputSchema: unknown;
declare function mapRpcParseError(): (effect: unknown) => unknown;

export const insertTypedRow = Effect.fn('insertTypedRow')(function* (props: {
  db: {
    insert: (table: unknown) => {
      values: (row: unknown) => { run: () => void };
    };
  };
  table: unknown;
  id: string;
  systemId: string;
}) {
  const row = { id: props.id, systemId: props.systemId };
  props.db.insert(props.table).values(row).run();
});
