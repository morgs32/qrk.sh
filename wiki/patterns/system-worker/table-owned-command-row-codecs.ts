import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeEffectSchema, makeTable, primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

const dbConfig = makeDbConfig({
  tables: {
    commands: makeTable({
      name: 'commands',
      shape: {
        id: primitives.primaryKey({ abbreviation: 'cmd' }),
        actorDelta: primitives.json({
          schema: Schema.Struct({ changed: Schema.Array(Schema.String) }),
        }),
        lastDeliveryFailure: primitives.text({ nullable: true }),
      },
    }),
  },
});

/**
 * Decode and encode complete SQL rows through their owning table in dbConfig.tables.
 * Keep domain-command validation separate; encode partial updates through field codecs.
 * Copy original encoded fields directly when transferring a validated row between stores.
 * Represent absent JSON columns with nullable: true, which encodes absence as SQL NULL.
 * Keep nullable fields inside JSON objects in their value schema.
 *
 * @bad Rebuild a standalone makeEffectSchema for every full-row reader or writer.
 * @bad Re-encode JSON just to transfer already validated encoded columns.
 * @bad Pass a partial patch to Table.encodeRow.
 */
export const readCommand = (row: unknown) =>
  dbConfig.tables.commands.decodeRow(row);

export const writeCommand = (row: {
  id: `cmd_${string}`;
  actorDelta: { readonly changed: readonly string[] };
  lastDeliveryFailure: string | null;
}) => dbConfig.tables.commands.encodeRow(row);

export const encodeDeliveryPatch = (failure: string | null) =>
  Schema.encodeEffect(
    makeEffectSchema(dbConfig.tables.commands.shape).fields.lastDeliveryFailure,
  )(failure);

export const example = Effect.gen(function* () {
  const decoded = yield* readCommand({
    id: 'cmd_one',
    actorDelta: '{"changed":[]}',
    lastDeliveryFailure: null,
  });
  return yield* writeCommand(decoded);
});
