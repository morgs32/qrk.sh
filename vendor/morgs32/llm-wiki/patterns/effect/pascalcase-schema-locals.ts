import { Schema } from 'effect/Schema';

declare const primitives: {
  json(props: { schema: unknown }): unknown;
};

/**
 * Effect `Schema` bindings use PascalCase — domain types keep the `I` prefix.
 *
 * @bad `const tinyJsonRowSchema = Schema.parseJson(...)` — reads like a plain value, not a schema export.
 */
const TinyJsonRowSchema = Schema.Struct({ x: Schema.String });

primitives.json({ schema: TinyJsonRowSchema });

export { TinyJsonRowSchema };
