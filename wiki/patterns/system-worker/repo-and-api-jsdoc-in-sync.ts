/**
 * Keep chain and Repo RPC JSDoc aligned with *Api gateway methods and architecture docs.
 *
 * @bad Change a delegation chain without updating method JSDoc or architecture links.
 */
export class AggregateChain {
  /**
   * Secret-key finalization path: SystemApi → AggregateChain →
   * AggregateVersionRepo; its results outbox publishes to VAC.
   */
  async executeAggregateCommand(props: { command: unknown }) {
    return managedRuntime.runPromise(
      executeAggregateCommand(props).pipe(settleResult),
    );
  }
}

declare const managedRuntime: {
  runPromise: (effect: unknown) => Promise<unknown>;
};
declare const settleResult: (effect: unknown) => unknown;
declare const executeAggregateCommand: (props: unknown) => {
  pipe(next: unknown): unknown;
};
