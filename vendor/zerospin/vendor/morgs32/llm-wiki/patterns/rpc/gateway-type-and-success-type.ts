declare class ZerospinApis {
  getFrontendApi(props: { systemId: string }): {
    pushStagedCommands(props: {
      commands: readonly unknown[];
    }): Promise<unknown>;
  };
}

declare interface IPushedCommand {
  readonly id: string;
}

declare interface IExecutedCommand {
  readonly id: string;
}

declare interface IFailedCommand {
  readonly id: string;
  readonly reason: string;
}

declare function makeRpc<GATEWAY, SUCCESS>(
  fn: (apis: GATEWAY) => Promise<SUCCESS>,
): Promise<SUCCESS>;

/**
 * `makeRpc` first generic is the existing gateway type; second is inline success or a shared contracts alias.
 *
 * @bad One-off `IMyRpcGateway` / `IMyPushBatchRpcResult` exported from `types.ts` for a single call site.
 * @bad Hiding the RPC return type behind a throwaway exported alias instead of `makeRpc<..., ExplicitSuccess>`.
 */
export const pushStagedCommands = async () => {
  const { pushed, executed, failed } = await makeRpc<
    ZerospinApis,
    {
      readonly pushed: readonly IPushedCommand[];
      readonly executed: readonly IExecutedCommand[];
      readonly failed: readonly IFailedCommand[];
    }
  >(async apis => {
    const frontendApi = apis.getFrontendApi({ systemId: 'sys_1' });
    return frontendApi.pushStagedCommands({ commands: [] });
  });

  return { pushed, executed, failed };
};
