import { Schema } from 'effect/Schema';

declare function makeEffectSchema(shape: Record<string, unknown>): unknown;

declare const primitives: {
  json(props: { schema: unknown; nullable?: boolean }): unknown;
};

/**
 * Let `makeEffectSchema` own json encode/decode at the domain boundary — not manual `Schema.parseJson` wraps.
 *
 * @bad `Schema.encodeSync(Schema.parseJson(jsonColumn.schema))(domainValue)` at every boundary crossing.
 */
const jsonColumn = primitives.json({
  nullable: true,
  schema: Schema.Unknown,
});

const rowSchema = makeEffectSchema({ jsonColumn });

const domainValue = { nested: true };

const wire = Schema.encodeSync(rowSchema)({ jsonColumn: domainValue });
const domain = Schema.decodeUnknownSync(rowSchema)(wire);

export { wire, domain };
