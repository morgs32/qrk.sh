import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeContractVersion } from '@zerospin/core/contracts/make/makeContractVersion';

/**
 * `makeContractVersion` enforces mutation-only program return at definition time.
 *
 * @bad Duplicate mutation-only type checks while normalizing a `makeSystem` definition binding.
 */
export const updateListContract = makeContractVersion(
  defineContract('updateList'),
  {
    payloadSchema: UpdateListPayloadSchema,
    program: ({ payload }) =>
      Effect.all({
        updated: updateMutation({
          model: list,
          resourceId: payload.id,
          attributes: { name: payload.name },
        }),
      }),
  },
);

declare const UpdateListPayloadSchema: unknown;
declare const list: unknown;
declare function updateMutation(props: unknown): unknown;
declare const Effect: { all: (input: unknown) => unknown };
