import type { AuthenticationLockSchema } from '@zerospin/core/authentication/makeAuthenticationLock';
import { RpcTarget } from 'capnweb';
import type { Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';

import type { IApiKeyIdentityResolver } from '../ApiKeyIdentityResolver/ApiKeyIdentityResolver.js';
import type { AuthenticatedApi } from '../AuthenticatedApi/AuthenticatedApi.js';
import type { AuthenticatedApiFailure } from '../AuthenticatedApi/AuthenticatedApiFailure/AuthenticatedApiFailure.js';
import type { DevDeployApi } from '../DevDeployApi/DevDeployApi.js';
import type { DevDeployApiFailure } from '../DevDeployApi/DevDeployApiFailure/DevDeployApiFailure.js';
import type { ISystemRuntime } from '../makeSystemRuntime.js';
import type { ProductionDeployApi } from '../ProductionDeployApi/ProductionDeployApi.js';
import type { ProductionDeployApiFailure } from '../ProductionDeployApi/ProductionDeployApiFailure/ProductionDeployApiFailure.js';
import type { SystemApi } from '../SystemApi/SystemApi.js';
import type { SystemApiFailure } from '../SystemApi/SystemApiFailure/SystemApiFailure.js';
import type { SystemRepo } from '../SystemRepo/SystemRepo.js';

import { getAuthenticatedApi } from './getAuthenticatedApi/getAuthenticatedApi.js';
import { getDevDeployApi } from './getDevDeployApi/getDevDeployApi.js';
import { getProductionDeployApi } from './getProductionDeployApi/getProductionDeployApi.js';
import { getSystemApi } from './getSystemApi/getSystemApi.js';

/** Stable Worker-hosted root for public Zerospin capabilities. */
export class GatewayApi extends RpcTarget {
  declare [BrandTypeId]: 'Apis';

  readonly #apiKeyIdentityResolver: IApiKeyIdentityResolver;
  readonly #environment: 'dev' | 'production';
  readonly #runtime: ISystemRuntime;
  readonly #systemRepo: Pick<
    SystemRepo,
    'getActiveGenerationId' | 'getDeploy' | 'getReadiness' | 'startDeploy'
  >;

  constructor(props: {
    apiKeyIdentityResolver: IApiKeyIdentityResolver;
    environment: 'dev' | 'production';
    runtime: ISystemRuntime;
    systemRepo: Pick<
      SystemRepo,
      'getActiveGenerationId' | 'getDeploy' | 'getReadiness' | 'startDeploy'
    >;
  }) {
    super();
    this.#apiKeyIdentityResolver = props.apiKeyIdentityResolver;
    this.#environment = props.environment;
    this.#runtime = props.runtime;
    this.#systemRepo = props.systemRepo;
  }

  async getDevDeployApi(): Promise<DevDeployApi | DevDeployApiFailure> {
    return this.#runtime.runPromise(
      getDevDeployApi({
        environment: this.#environment,
        systemRepo: this.#systemRepo,
      }),
    );
  }

  async getProductionDeployApi(): Promise<
    ProductionDeployApi | ProductionDeployApiFailure
  > {
    return this.#runtime.runPromise(
      getProductionDeployApi({
        environment: this.#environment,
        systemRepo: this.#systemRepo,
      }),
    );
  }

  async getAuthenticatedApi(props: {
    publishableKey: string;
    authenticationLock: Schema.Schema.Type<typeof AuthenticationLockSchema>;
    signature: unknown;
  }): Promise<AuthenticatedApi | AuthenticatedApiFailure> {
    return this.#runtime.runPromise(
      getAuthenticatedApi({
        apiKeyIdentityResolver: this.#apiKeyIdentityResolver,
        request: props,
        runtime: this.#runtime,
        systemRepo: this.#systemRepo,
      }),
    );
  }

  async getSystemApi(props: {
    zerospinSecretKey: string;
  }): Promise<SystemApi | SystemApiFailure> {
    return this.#runtime.runPromise(
      getSystemApi({
        apiKeyIdentityResolver: this.#apiKeyIdentityResolver,
        request: props,
        runtime: this.#runtime,
        systemRepo: this.#systemRepo,
      }),
    );
  }
}
