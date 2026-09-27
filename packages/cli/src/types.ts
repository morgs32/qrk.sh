import type { ISystemEnvironmentId } from '@zerospin/core/system/types';
import type { IZerospinErrorJson } from '@zerospin/error';
import type { ILinkedRpcEnvelope, IRpcRequest } from '@zerospin/logger';
import type { RpcTarget } from 'capnweb';

/** Success payload decoded from `CliApi.deployWorkerBundle` RPC. */
export type IDeployWorkerResponse = {
  readonly id: string;
  readonly cloudflareDeploymentId: string;
  readonly environmentId: ISystemEnvironmentId;
};

/** RPC client shape returned from `getCliApi` over the batch gateway. */
export type ICliClientApi = RpcTarget & {
  deployWorkerBundle(
    request: IRpcRequest<
      [
        {
          readonly workerModule: string;
          readonly compatibilityDate: string;
          readonly compatibilityFlags: readonly string[];
          readonly environmentId: ISystemEnvironmentId;
        },
      ]
    >,
  ): Promise<ILinkedRpcEnvelope<IDeployWorkerResponse, IZerospinErrorJson>>;
};

export type ICliApis = RpcTarget & {
  getCliApi(props: { zerospinSecretKey: string }): ICliClientApi;
};
