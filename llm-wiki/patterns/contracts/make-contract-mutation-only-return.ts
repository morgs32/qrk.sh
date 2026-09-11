import { defineCommand } from '@zerospin/core/contracts/Command';
import { makeContractVersion } from '@zerospin/core/contracts/makeVersion';

/**
 * `makeContractVersion` enforces mutation-only program return at definition time.
 *
 * @bad Duplicate mutation-only type checks while normalizing a `makeSystem` frontend binding.
 */
export const updateListContract = makeContractVersion(
  defineCommand('updateList'),
  {
    payloadSchema: UpdateListPayloadSchema,
    program: ({ payload }) =>
      Effect.all({
        updated: updateMutation({
          model: List,
          resourceId: payload.id,
          attributes: { name: payload.name },
        }),
      }),
  },
);

declare const UpdateListPayloadSchema: unknown;
declare const List: unknown;
declare function updateMutation(props: unknown): unknown;
declare const Effect: { all: (input: unknown) => unknown };
