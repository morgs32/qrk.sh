import { Effect } from 'effect';

/**
 * Decode an exact historical contract payload and adapt it directly up to the current contract payload.
 *
 * @bad Adapt current payloads down to whatever shape an old command happened to send.
 * @bad Chain V1 through V2 to reach V3; every historical definition owns one direct edge to current.
 * @bad Run current guards or programs before validating the adapter's complete current output.
 */
export const updateQuantity = makeContract(
  {
    commandName: 'updateQuantity',
    version: '2.0.0',
    payload: {
      amount: primitives.integer(),
      unit: primitives.enum({ values: ['item', 'case'] }),
    },
    mutations: null,
  },
  [
    {
      commandName: 'updateQuantity',
      version: '1.0.0',
      payload: { quantity: primitives.integer() },
      adaptPayload: ({ payload }: { payload: { quantity: number } }) =>
        Effect.succeed({ amount: payload.quantity, unit: 'item' }),
    },
  ],
);

declare function makeContract(
  props: unknown,
  history: readonly unknown[],
): unknown;
declare const primitives: {
  integer(): unknown;
  enum(props: { values: readonly string[] }): unknown;
};
