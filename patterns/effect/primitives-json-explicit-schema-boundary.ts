import { Schema } from 'effect/Schema';

declare const primitives: {
  json(props: { schema: unknown; nullable?: boolean }): unknown;
};

/**
 * Pass the domain schema to `primitives.json` — not an already-wrapped wire schema.
 *
 * @bad `primitives.json({ schema: Schema.parseJson(TinyJsonRowSchema) })`.
 */
const TinyJsonRowSchema = Schema.Struct({ x: Schema.String });

const jsonColumn = primitives.json({ schema: TinyJsonRowSchema });

const nullableJsonColumn = primitives.json({
  nullable: true,
  schema: Schema.Unknown,
});

const RowSchema = Schema.Struct({ createdAt: Schema.Date });
primitives.json({ schema: RowSchema });

export { jsonColumn, nullableJsonColumn };
