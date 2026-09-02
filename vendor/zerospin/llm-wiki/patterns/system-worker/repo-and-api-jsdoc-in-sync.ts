/**
 * Keep chain and materialized Repo RPC JSDoc aligned with *Api gateway methods and architecture docs.
 *
 * @bad Change a delegation chain without updating method JSDoc or architecture links.
 */
export class AggregateCommandChain {
  /**
   * Secret-key finalization path: SystemApi → AggregateCommandChain →
   * MaterializedAggregateRepo → aggregate subscribers.
   */
  async finalizeAggregateCommand(props: { command: unknown }) {
    return managedRuntime.runPromise(
      finalizeAggregateCommand(props).pipe(encodeRpc),
    );
  }
}

declare const managedRuntime: {
  runPromise: (effect: unknown) => Promise<unknown>;
};
declare const encodeRpc: (effect: unknown) => unknown;
declare const finalizeAggregateCommand: (props: unknown) => {
  pipe(next: unknown): unknown;
};
