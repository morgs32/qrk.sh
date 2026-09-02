/**
 * Keep singular *Api gateway JSDoc aligned with its command-chain delegation and architecture workflow.
 *
 * @bad Change push or finalization delegation without updating the method JSDoc and architecture page.
 * @bad Describe one command RPC as a plural or batched operation.
 */
export class AggregateFrontendApi {
  /**
   * Aggregate frontend push: AggregateFrontendApi →
   * AggregateFrontendPushedCommandChain →
   * MaterializedAggregateFrontendRepo.
   * See Command Chains and Push Sequence.
   */
  async pushCommand(props: { command: unknown }) {
    return pushedCommandChain.pushCommand(props);
  }
}

declare const pushedCommandChain: {
  pushCommand: (props: { command: unknown }) => Promise<unknown>;
};
