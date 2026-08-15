/**
 * *Api gateway methods carry architecture JSDoc naming delegation chain and workflow doc.
 *
 * @bad Do not change push/finalize delegation without updating AggregateFrontendApi method JSDoc.
 */
export class AggregateFrontendApi {
  /**
   * Session push: AggregateFrontendApi → SystemRepo.pushCommands → AggregateFrontendRepo.pushCommands → AggregateRepo.finalizePushedCommands.
   * See AggregateFrontendApi architecture doc — Annotated methods.
   */
  async pushCommands(props: { commands: readonly unknown[] }) {
    return systemRepo.pushCommands(props);
  }
}

declare const systemRepo: {
  pushCommands: (props: unknown) => Promise<unknown>;
};
