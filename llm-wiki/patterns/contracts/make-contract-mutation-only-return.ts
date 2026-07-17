/**
 * `makeContract` enforces mutation-only program return at definition time.
 *
 * @bad Duplicate mutation-only type checks in `makeActorController` frontend binding resolution.
 */
export const updateListContract = makeContract({
  commandName: 'updateList',
  payloadSchema: UpdateListPayloadSchema,
  program: ({ payload }) =>
    Effect.all({
      updated: updateMutation({
        model: List,
        resourceId: payload.id,
        attributes: { name: payload.name },
      }),
    }),
});

declare function makeContract<PROGRAM>(props: {
  commandName: string;
  payloadSchema: unknown;
  program: PROGRAM;
}): unknown;
declare const UpdateListPayloadSchema: unknown;
declare const List: unknown;
declare function updateMutation(props: unknown): unknown;
declare const Effect: { all: (input: unknown) => unknown };
