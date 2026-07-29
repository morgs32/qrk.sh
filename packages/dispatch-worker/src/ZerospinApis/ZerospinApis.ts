import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { makeServiceFrontendControllerSpec } from '@zerospin/core/serviceFrontendController/makeServiceFrontendControllerSpec';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeAccountId } from '@zerospin/core/utils/makeAccountId';
import {
  mapParseError,
  ZerospinError,
  type IAnyErrorJson,
} from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import { Effect, Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';

import { ApiKeyIdentityResolver } from '../ApiKeyIdentityResolver/ApiKeyIdentityResolver';
import { FrontendApi } from '../FrontendApi/FrontendApi';
import { FrontendApiFailure } from '../FrontendApi/FrontendApiFailure';
import { getSystemWorkerNameFromClaims } from '../getSystemWorkerNameFromClaims';
import type { IDispatchRuntime } from '../makeDispatchRuntime';
import {
  ServiceFrontendApi,
  type IServiceFrontendAdmission,
} from '../ServiceFrontendApi/ServiceFrontendApi';
import { ServiceFrontendApiFailure } from '../ServiceFrontendApi/ServiceFrontendApiFailure';
import { SystemApi } from '../SystemApi/SystemApi';
import { SystemApiFailure } from '../SystemApi/SystemApiFailure';
import { SystemWorkerResolver } from '../SystemWorkerResolver/SystemWorkerResolver';

const auth = Effect.fn('FrontendApi.auth')(function* (
  args: [
    {
      publishableKey: string;
      accountName: string;
      actorName: string;
      frontendName: string;
      signature: unknown;
    },
  ],
  deployId: string,
  generationId: string,
) {
  const [validated] = yield* Schema.validate(
    Schema.mutable(
      Schema.Tuple(
        Schema.Struct({
          publishableKey: Schema.String,
          accountName: Schema.String,
          actorName: Schema.String,
          frontendName: Schema.String,
          signature: Schema.Unknown,
        }),
      ),
    ),
  )(args, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'failed-to-decode-get-frontend-api-props',
      prefix: 'Failed to decode getFrontendApi arguments',
    }),
  );

  const { publishableKey, accountName, actorName, frontendName, signature } =
    validated;
  const identityResolver = yield* ApiKeyIdentityResolver;
  const claims = yield* identityResolver.resolve({
    apiKey: publishableKey,
  });
  const systemWorkerName = yield* getSystemWorkerNameFromClaims(claims);
  const resolver = yield* SystemWorkerResolver;
  using systemWorker = resolver.get({ systemWorkerName });
  const accountId = makeAccountId({ id: '1' });

  const actor = yield* makeAsync(
    async () =>
      await systemWorker.authenticate({
        accountId,
        accountName,
        actorName,
        deployId,
        frontendName,
        generationId,
        signature,
      }),
    ZerospinError.catch({
      code: 'failed-to-authenticate-frontend-rpc',
      message: 'SystemWorker.authenticate threw while creating FrontendApi',
      preferCauseMessage: true,
      extra: {
        accountName,
        actorName,
        systemWorkerName,
        frontendName,
        systemId: claims.systemId,
      },
    }),
  ).pipe(Effect.flatMap(decodeRpc));

  yield* makeAsync(
    () =>
      systemWorker.authorize({
        accountId: actor.accountId,
        accountName,
        actor,
        actorName,
        deployId,
        frontendName,
        generationId,
      }),
    ZerospinError.catch({
      code: 'failed-to-authorize-frontend-rpc',
      message: 'SystemWorker.authorize threw while creating FrontendApi',
      preferCauseMessage: true,
      extra: {
        accountName,
        actorName,
        systemWorkerName,
        frontendName,
        systemId: claims.systemId,
      },
    }),
  ).pipe(Effect.flatMap(decodeRpc));

  return {
    actor,
    accountName,
    actorName,
    deployId,
    frontendName,
    generationId,
    systemId: claims.systemId,
    systemWorkerName,
    systemEnvironmentId: claims.systemEnvironmentId,
  };
});

/**
 * Environment-agnostic gateway over a deployed Zerospin system: resolves an
 * api key to an identity, then hands out SystemApi / FrontendApi bound to
 * that identity's SystemWorker. All environment specifics come in through
 * the SystemWorkerResolver and ApiKeyIdentityResolver layers baked into the
 * provided runtime.
 */
export class ZerospinApis extends RpcTarget {
  declare [BrandTypeId]: 'Apis';

  readonly #deployId: string;
  readonly #generationId: string;
  readonly #runtime: IDispatchRuntime;

  constructor(props: {
    deployId: string;
    generationId: string;
    runtime: IDispatchRuntime;
  }) {
    super();
    this.#deployId = props.deployId;
    this.#generationId = props.generationId;
    this.#runtime = props.runtime;
  }

  /**
   * System gateway (secret key): deployed system spec and tooling state.
   */
  async getSystemApi(props: {
    zerospinSecretKey: string;
  }): Promise<SystemApi | SystemApiFailure> {
    const deployId = this.#deployId;
    const generationId = this.#generationId;
    const runtime = this.#runtime;
    return runtime.runPromise(
      Effect.gen(function* () {
        const validated = yield* Schema.validate(
          Schema.Struct({
            zerospinSecretKey: Schema.String,
          }),
        )(props, { onExcessProperty: 'ignore' }).pipe(
          mapParseError({
            code: 'failed-to-decode-get-system-api-props',
            prefix: 'Failed to decode getSystemApi props',
          }),
        );
        const identityResolver = yield* ApiKeyIdentityResolver;
        const claims = yield* identityResolver.resolve({
          apiKey: validated.zerospinSecretKey,
        });
        if (claims.keyType !== 'secret') {
          return yield* new ZerospinError({
            code: 'publishable-key-not-allowed',
            message: 'getSystemApi requires a secret key',
          });
        }
        const systemWorkerName = yield* getSystemWorkerNameFromClaims(claims);
        return new SystemApi({
          deployId,
          generationId,
          systemId: claims.systemId,
          systemWorkerName,
          runtime,
        });
      }).pipe(
        Effect.catchAll(error => Effect.succeed(new SystemApiFailure(error))),
      ),
    );
  }

  /**
   * Frontend session gateway: authenticate + `authorize`; return FrontendApi.
   */
  async getFrontendApi(
    ...args: [
      {
        publishableKey: string;
        accountName: string;
        actorName: string;
        frontendName: string;
        signature: unknown;
      },
    ]
  ): Promise<FrontendApi | FrontendApiFailure> {
    const runtime = this.#runtime;
    return runtime.runPromise(
      auth(args, this.#deployId, this.#generationId).pipe(
        Effect.map(
          authResults =>
            new FrontendApi({
              authResults,
              runtime,
            }),
        ),
        Effect.catchAll(error => Effect.succeed(new FrontendApiFailure(error))),
      ),
    );
  }

  /**
   * Service-owned frontend admission: authenticate once and return one
   * permanently actor-bound, read-only capability with its exact target spec.
   */
  async getServiceFrontendApi(props: {
    publishableKey: string;
    serviceName: string;
    actorName: string;
    frontendName: string;
    signature: unknown;
  }): Promise<
    | (Readonly<{ _tag: 'Success' }> & IServiceFrontendAdmission)
    | Readonly<{
        _tag: 'Failure';
        failure: IAnyErrorJson;
        frontendApi: ServiceFrontendApiFailure;
      }>
  > {
    const deployId = this.#deployId;
    const generationId = this.#generationId;
    const runtime = this.#runtime;

    return runtime.runPromise(
      Effect.gen(function* () {
        const validated = yield* Schema.validate(
          Schema.Struct({
            publishableKey: Schema.String,
            serviceName: Schema.String,
            actorName: Schema.String,
            frontendName: Schema.String,
            signature: Schema.Unknown,
          }),
        )(props, { onExcessProperty: 'error' }).pipe(
          mapParseError({
            code: 'failed-to-decode-get-service-frontend-api-props',
            prefix: 'Failed to decode getServiceFrontendApi arguments',
          }),
        );

        const identityResolver = yield* ApiKeyIdentityResolver;
        const claims = yield* identityResolver.resolve({
          apiKey: validated.publishableKey,
        });
        const systemWorkerName = yield* getSystemWorkerNameFromClaims(claims);
        const resolver = yield* SystemWorkerResolver;
        const systemWorker = resolver.get({ systemWorkerName });

        return yield* Effect.gen(function* () {
          const authenticatedActorId = yield* makeAsync(
            () =>
              systemWorker.authenticateServiceFrontend({
                deployId,
                generationId,
                serviceName: validated.serviceName,
                actorName: validated.actorName,
                frontendName: validated.frontendName,
                signature: validated.signature,
              }),
            ZerospinError.catch({
              code: 'failed-to-authenticate-service-frontend-rpc',
              message:
                'SystemWorker.authenticateServiceFrontend threw during admission',
              preferCauseMessage: true,
              extra: {
                serviceName: validated.serviceName,
                actorName: validated.actorName,
                frontendName: validated.frontendName,
                systemId: claims.systemId,
                systemWorkerName,
              },
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const actorId = yield* Schema.decodeUnknown(
            makeAbbreviationIdSchema(coreAbbreviations.actor),
          )(authenticatedActorId).pipe(
            mapParseError({
              code: 'service-frontend-actor-id-invalid',
              prefix:
                'SystemWorker returned an invalid actorId during service frontend admission',
              extra: {
                serviceName: validated.serviceName,
                actorName: validated.actorName,
                frontendName: validated.frontendName,
                systemId: claims.systemId,
                systemWorkerName,
              },
            }),
          );

          const frontendSpec: ReturnType<
            typeof makeServiceFrontendControllerSpec
          > = yield* makeAsync(() =>
            systemWorker.getServiceFrontendSpec({
              deployId,
              generationId,
              serviceName: validated.serviceName,
              actorName: validated.actorName,
              frontendName: validated.frontendName,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          if (
            frontendSpec.serviceName !== validated.serviceName ||
            frontendSpec.actorName !== validated.actorName ||
            frontendSpec.frontendName !== validated.frontendName
          ) {
            return yield* new ZerospinError({
              code: 'service-frontend-admission-target-mismatch',
              message:
                'SystemWorker returned a service frontend spec for a different target',
              extra: {
                expectedServiceName: validated.serviceName,
                serviceName: frontendSpec.serviceName,
                expectedActorName: validated.actorName,
                actorName: frontendSpec.actorName,
                expectedFrontendName: validated.frontendName,
                frontendName: frontendSpec.frontendName,
                systemId: claims.systemId,
                systemWorkerName,
              },
            });
          }
          const systemSpec = yield* makeAsync(() =>
            systemWorker.getSystemSpec({ deployId, generationId }),
          ).pipe(Effect.flatMap(decodeRpc));

          const authResults = {
            actorId,
            actorName: validated.actorName,
            deployId,
            frontendName: validated.frontendName,
            frontendVersion: frontendSpec.version,
            generationId,
            serviceName: validated.serviceName,
            systemId: claims.systemId,
            systemVersion: systemSpec.version,
            systemWorkerName,
          };
          const frontendApi = new ServiceFrontendApi({ authResults, runtime });

          return {
            _tag: 'Success',
            identity: {
              actorId,
              systemId: claims.systemId,
              generationId,
              systemVersion: systemSpec.version,
              systemWorkerName,
              serviceName: validated.serviceName,
              actorName: validated.actorName,
              frontendName: validated.frontendName,
              frontendVersion: frontendSpec.version,
            },
            frontendSpec,
            frontendApi,
          } satisfies Readonly<{ _tag: 'Success' }> & IServiceFrontendAdmission;
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              systemWorker[Symbol.dispose]();
            }),
          ),
        );
      }).pipe(
        Effect.catchAll(error =>
          Effect.succeed({
            _tag: 'Failure',
            failure: Schema.encodeSync(ZerospinError.schema)(error),
            frontendApi: new ServiceFrontendApiFailure(error),
          } satisfies Readonly<{
            _tag: 'Failure';
            failure: IAnyErrorJson;
            frontendApi: ServiceFrontendApiFailure;
          }>),
        ),
      ),
    );
  }
}
