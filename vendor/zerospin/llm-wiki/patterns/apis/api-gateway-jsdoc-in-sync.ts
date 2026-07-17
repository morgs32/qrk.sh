/**
 * *Api gateway methods carry architecture JSDoc naming delegation chain and workflow doc.
 *
 * @bad Do not change push/finalize delegation without updating FrontendApi method JSDoc.
 */
export class FrontendApi {
  /**
   * Session push: SystemWorker.pushCommands → FrontendRepo.pushCommands → AccountRepo.finalizePushedCommands.
   * See FrontendApi architecture doc — Annotated methods.
   */
  async pushCommands(props: { commands: readonly unknown[] }) {
    return systemWorker.pushCommands(props);
  }
}

declare const systemWorker: {
  pushCommands: (props: unknown) => Promise<unknown>;
};
