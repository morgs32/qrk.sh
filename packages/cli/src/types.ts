import type {
  IDeployConfig,
  ISystemEnvironmentId,
  ISystemSpec,
} from '@zerospin/core/system/types';
import type { IAnyErrorJson } from '@zerospin/error';
import type { Brand, Schema } from 'effect';

/** Success payload decoded from `CliApi.deploySystemWorker` RPC. */
export type IDeployWorkerResponse = {
  readonly id: string;
  readonly cloudflareDeploymentId: string;
  readonly environmentId: ISystemEnvironmentId;
  readonly seedCommandsFinalized: number;
};

/** RPC client shape returned from `getCliApi` over the batch gateway. */
export type ICliClientApi = {
  [Brand.BrandTypeId]: 'TargetApi';
  deploySystemWorker(props: {
    readonly clean: boolean;
    readonly script: string;
    readonly config: IDeployConfig;
    readonly systemSpec: ISystemSpec;
  }): Promise<Schema.EitherEncoded<IDeployWorkerResponse, IAnyErrorJson>>;
};

export type ICliApis = {
  [Brand.BrandTypeId]: 'Apis';
} & {
  getCliApi(props: { zerospinSecretKey: string }): ICliClientApi;
};

export type IDeploySystemResult = {
  zerospinApiUrl: string;
  compiledLength: number;
  environmentId: ISystemEnvironmentId;
  cloudflareDeploymentId: string;
  seedCommandsFinalized: number;
  seedsLoadedCount: number;
  response: unknown;
};

export type IWriteLocalSystemWorkerResult = {
  compiledLength: number;
  outputPath: string;
};
