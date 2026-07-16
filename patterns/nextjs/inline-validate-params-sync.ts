import { Schema } from 'effect/Schema';

declare function validateParamsSync<T>(props: {
  schema: unknown;
  value: unknown;
}): T;
declare function makeAbbreviationIdSchema(abbreviation: string): unknown;

const systemRecordAbbreviation = 'sys';

/**
 * Decode route params inline in the page with `validateParamsSync` — no one-off module-level validator wrappers.
 *
 * @bad `const validateDevApiKeysRouteParams = (value) => validateParamsSync({ … })` used by a single page.
 */
export default async function SystemDevApiKeysPage(props: {
  params: Promise<{ systemId: string }>;
}) {
  const params = await props.params;

  const { systemId } = validateParamsSync({
    schema: Schema.Struct({
      systemId: makeAbbreviationIdSchema(systemRecordAbbreviation),
    }),
    value: params,
  });

  return `<div>${systemId}</div>`;
}
