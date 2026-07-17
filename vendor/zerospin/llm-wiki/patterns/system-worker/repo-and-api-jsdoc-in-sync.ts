/**
 * Keep *Repo DO RPC JSDoc in sync with *Api gateway method architecture docs.
 *
 * @bad Change delegation chain without updating method JSDoc or architecture doc links.
 */
export class AccountRepo {
  /**
   * API-authenticated finalization path: finalize account commands into an
   * account block.
   *
   * FrontendApi / SystemApi → SystemWorker → AccountRepo.finalizeAccountBlock →
   * FanoutFlow (account block fanout).
   */
  async finalizeAccountBlock(props: {
    accountName: string;
    commands: readonly unknown[];
  }) {
    return managedRuntime.runPromise(
      finalizeAccountBlock(props).pipe(encodeRpc),
    );
  }
}

declare const managedRuntime: {
  runPromise: (effect: unknown) => Promise<unknown>;
};
declare const encodeRpc: (effect: unknown) => unknown;
declare const finalizeAccountBlock: (props: unknown) => unknown;
declare const Effect: { void: unknown };
