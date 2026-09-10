import { contracts } from '@zerospin/core/contracts/index';
import { Effect } from 'effect';

/**
 * Contract `program` returns plain `Effect.all` struct — not an Effect.gen wrapper.
 *
 * @bad Hide mutations inside `Effect.gen` with bare `yield* createMutation(...)`.
 */
export const createListContract = contracts.makeVersion(
  contracts.makeCommand('createList'),
  {
    payloadSchema: CreateListPayloadSchema,
    program: ({ payload }) => {
      const { id, name, userId } = payload;
      return Effect.all({
        created: createMutation({
          model: List,
          resourceId: id,
          attributes: { name, userId },
        }),
      });
    },
  },
);

declare const CreateListPayloadSchema: unknown;
declare const List: unknown;
declare function createMutation(
  props: unknown,
): Effect.Effect<unknown, never, never>;
