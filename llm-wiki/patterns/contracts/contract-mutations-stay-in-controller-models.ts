/**
 * Contract programs may only emit mutations for models owned by the registering controller.
 *
 * @bad Let a service contract mutate an account-only model and wait for apply-time failure.
 * @bad Check only the contract lookup path; also validate the produced mutation models.
 */
export function makeServiceController<
  MODELS extends Record<string, Model>,
  CONTRACTS extends Record<string, Contract>,
>(props: {
  models: MODELS;
  contracts: CONTRACTS & AssertContractsMutationsInModels<CONTRACTS, MODELS>;
}) {
  return props;
}

export const makeMutations = Effect.fn('makeMutations')(function* (props: {
  contract: Contract;
  models: Record<string, Model>;
  command: { commandName: string; payload: unknown };
}) {
  const { contract, models, command } = props;
  const payload = yield* contract.validatePayload({ payload: command.payload });
  const mutations = yield* contract.program({ payload });

  yield* assertMutationsUseModels({
    mutations,
    models,
    commandName: command.commandName,
  });

  return {
    payload,
    mutations,
  };
});

type Model = { modelName: string };
type Contract = {
  validatePayload(props: { payload: unknown }): unknown;
  program(props: { payload: unknown }): unknown;
};
type AssertContractsMutationsInModels<CONTRACTS, MODELS> = CONTRACTS & {
  readonly __models?: MODELS;
};

declare const Effect: {
  fn(name: string): <PROGRAM>(program: PROGRAM) => PROGRAM;
};
declare function assertMutationsUseModels(props: {
  mutations: unknown;
  models: Record<string, Model>;
  commandName: string;
}): unknown;
