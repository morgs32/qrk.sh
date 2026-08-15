/**
 * Keep *Repo DO RPC JSDoc in sync with *Api gateway method architecture docs.
 *
 * @bad Change delegation chain without updating method JSDoc or architecture doc links.
 */
export class AggregateRepo {
  /**
   * Secret-key finalization path: finalize aggregate commands into an
   * aggregate block.
   *
   * SystemApi → SystemRepo.finalizeAggregateCommands → AggregateRepo.finalizeAggregateBlock →
   * AggregateBlockRepo → AggregateFrontendRepo.
   */
  async finalizeAggregateBlock(props: {
    aggregateName: string;
    commands: readonly unknown[];
  }) {
    return managedRuntime.runPromise(
      finalizeAggregateBlock(props).pipe(encodeRpc),
    );
  }
}

declare const managedRuntime: {
  runPromise: (effect: unknown) => Promise<unknown>;
};
declare const encodeRpc: (effect: unknown) => unknown;
declare const finalizeAggregateBlock: (props: unknown) => unknown;
declare const Effect: { void: unknown };
