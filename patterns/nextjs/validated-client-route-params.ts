'use client';

import { Schema } from 'effect';
import { useParams } from 'next/navigation';

/**
 * Decode client route params through one schema-backed hook and define `ParamsSchema` beside each consumer.
 *
 * @bad Do not trust a `useParams<{ projectId: string }>()` generic; it only asserts the framework value's type.
 * @bad Do not read client route params before the schema-backed hook validates them.
 * @bad Do not replace colocated route schemas with one broad shared schema containing unrelated optional params.
 */
export function useValidatedParams<SCHEMA extends Schema.Schema.Any>(
  schema: SCHEMA,
): Schema.Schema.Type<SCHEMA> {
  const params = useParams();
  return Schema.decodeUnknownSync(schema)(params, {
    onExcessProperty: 'ignore',
  });
}

const ParamsSchema = Schema.Struct({
  projectId: Schema.String,
  itemId: Schema.optional(Schema.String),
});

export function ProjectPage() {
  const { projectId, itemId } = useValidatedParams(ParamsSchema);
  return `${projectId}:${itemId ?? 'index'}`;
}
