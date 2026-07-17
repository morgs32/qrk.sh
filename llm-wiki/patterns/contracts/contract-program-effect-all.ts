import { Effect } from 'effect';

/**
 * Contract `program` returns plain `Effect.all` struct — not an Effect.gen wrapper.
 *
 * @bad Hide mutations inside `Effect.gen` with bare `yield* createMutation(...)`.
 */
export const createListContract = makeContract({
  commandName: 'createList',
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
});

declare function makeContract(props: unknown): unknown;
declare const CreateListPayloadSchema: unknown;
declare const List: unknown;
declare function createMutation(
  props: unknown,
): Effect.Effect<unknown, never, never>;
