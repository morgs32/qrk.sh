/**
 * Keep singular *Api gateway JSDoc aligned with its command-chain delegation and architecture workflow.
 *
 * @bad Change push or finalization delegation without updating the method JSDoc and architecture page.
 * @bad Describe one command RPC as a plural or batched operation.
 */
export class AggregateFrontendApi {
  /**
   * Aggregate frontend push: AggregateFrontendApi →
   * AggregateChain admission; VAR executes asynchronously.
   * See Command Chains and Push Sequence.
   */
  async pushCommand(props: { command: unknown }) {
    return admittedChain.admitCommands({ commands: [props.command] });
  }
}

declare const admittedChain: {
  admitCommands: (props: { commands: readonly unknown[] }) => Promise<unknown>;
};
