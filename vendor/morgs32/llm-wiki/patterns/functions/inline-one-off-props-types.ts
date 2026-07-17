import { Effect } from 'effect';

/**
 * Inline props on the Effect.fn parameter when used once in the file.
 *
 * @bad File-local `type IProps = { ... }` used only for one function signature.
 * @bad Export a props type alias nothing imports — advertises fake public API.
 */
export const findMany = Effect.fn('findMany')(function* <
  SYSTEM,
  MODEL_KEY extends string,
>(props: { system: SYSTEM; modelName: MODEL_KEY; query: unknown }) {
  const { system, modelName, query } = props;
  return { system, modelName, query };
});

export const createApiKey = Effect.fn('createApiKey')(function* (props: {
  readonly name: string;
  readonly organizationId: string;
  readonly expiration: 'never' | '30' | '90' | '365';
}) {
  return props;
});
