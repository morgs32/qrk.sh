import { assert, Equals } from 'tsafe';

/**
 * Assert explicit public contract in typecheck tests — not ReturnType reflexivity.
 *
 * @bad assert<Equals<typeof promise, ReturnType<typeof fn>>> right after calling fn.
 */
const createListPromise = systemClient.contracts.createList({
  id: 'lst_123',
  name: 'Weekly groceries',
  userId: 'usr_123',
});

assert<
  Equals<
    typeof createListPromise,
    Promise<
      | { _tag: 'Right'; right: IExecutedCommand }
      | { _tag: 'Left'; left: unknown }
    >
  >
>();

declare const systemClient: {
  contracts: {
    createList: (props: unknown) => Promise<unknown>;
  };
};
declare type IExecutedCommand = { id: string };
