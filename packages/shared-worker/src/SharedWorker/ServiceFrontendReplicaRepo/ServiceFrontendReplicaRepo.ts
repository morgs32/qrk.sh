import type { Async } from '@zerospin/core/async/Async';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { makeServiceFrontendLockKey } from '@zerospin/core/frontendController/makeServiceFrontendLockKey';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import { makeTable } from '@zerospin/core/models/makeTable';
import { primitives } from '@zerospin/core/models/primitives';
import type {
  IAnyDrizzleSchemas,
  IEncodedResourceShape,
} from '@zerospin/core/models/types';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import type { PublishableKey } from '@zerospin/core/services/PublishableKey';
import type { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import {
  ServiceFrontendBlockSchema,
  ServiceFrontendReplicaStateSchema,
  ServiceFrontendStateSchema,
} from '@zerospin/core/serviceSession/ServiceFrontendBlockSchema';
import type {
  IServiceFrontendBlock,
  IServiceFrontendReplicaBlock,
  IServiceFrontendReplicaState,
  IServiceFrontendState,
} from '@zerospin/core/serviceSession/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import type { authenticate } from '@zerospin/frontend/authenticate';
import { createServiceFrontendWebSocketTicket } from '@zerospin/frontend/createServiceFrontendWebSocketTicket';
import { fetchServiceFrontendState } from '@zerospin/frontend/fetchServiceFrontendState';
import type { TelemetryCollector } from '@zerospin/logger';
import { RpcStub } from 'capnweb';
import { eq, sql } from 'drizzle-orm';
import {
  Duration,
  Effect,
  Either,
  Fiber,
  Schema,
  type ManagedRuntime,
} from 'effect';

import type { ServiceFrontendReplicaSinkApi } from '../../acquireUserPartitionRepo.ts';
import type { makeIdbSQLite3 } from '../../drizzle/makeIdbSQLite3.ts';
import { makeTxAsync } from '../../drizzle/makeTxAsync.ts';
import type { IAsyncWaSqliteDrizzleDb } from '../../drizzle/types.ts';
import {
  serviceFrontendSpecSchema,
  type serviceFrontendReplicas as serviceFrontendReplicaLocators,
  type userReplicaDbConfig,
} from '../userReplicaSchemas.ts';

const serviceFrontendReplicaMetadataTable = makeTable({
  name: 'serviceFrontendReplicaMetadata',
  shape: {
    id: primitives.primaryKey({ abbreviation: 'sfrp' }),
    systemVersion: primitives.text(),
    frontendIndex: primitives.integer(),
    replicaIndex: primitives.integer(),
  },
});

export const serviceReplicaDbConfig = makeDbConfig({
  tables: {
    serviceFrontendReplicaMetadata: serviceFrontendReplicaMetadataTable,
  },
});

export const { serviceFrontendReplicaMetadata } = serviceReplicaDbConfig.schema;

const serviceFrontendSocketMessageSchema = Schema.parseJson(
  Schema.Union(
    Schema.Struct({
      type: Schema.Literal('serviceFrontendBlock'),
      sync: ServiceFrontendBlockSchema,
    }),
    Schema.Struct({
      type: Schema.Literal('replay-complete'),
      frontendIndex: Schema.Number,
    }),
    Schema.Struct({ type: Schema.Literal('state-required') }),
  ),
);

export class ServiceFrontendReplicaRepo {
  private queueTail: Promise<void> = Promise.resolve();
  private socket: WebSocket | null = null;
  private reconnectFiber: Fiber.RuntimeFiber<void, IAnyError> | null = null;
  private status: 'activating' | 'ready' | 'failed';
  private socketState: 'disconnected' | 'connecting' | 'replaying' | 'online' =
    'disconnected';
  private reconnectAttempt = 0;
  private lastFailure: string | null = null;
  private onlineReplacementInstalled: boolean;
  private installedAuthority: {
    registrationId: string;
    ownerToken: object;
    authenticatedApi: Effect.Effect.Success<
      ReturnType<typeof authenticate>
    >['authenticatedApi'];
    frontendApi: Parameters<typeof fetchServiceFrontendState>[0]['frontendApi'];
  } | null = null;
  private authoritySelectionAttempt: object | null = null;
  private authoritySelectionPromise: Promise<void> | null = null;
  private forceFreshAuthoritySelection = false;
  private registrations: Array<{
    id: string;
    sink:
      | ServiceFrontendReplicaSinkApi
      | RpcStub<ServiceFrontendReplicaSinkApi>;
    getAuthenticatedApi(props: {
      freshness: 'current' | 'refresh-if-current' | 'force';
      failedAuthenticatedApi:
        | Effect.Effect.Success<
            ReturnType<typeof authenticate>
          >['authenticatedApi']
        | null;
    }): Promise<Effect.Effect.Success<ReturnType<typeof authenticate>>>;
    getCurrentAuthenticatedApi():
      | Effect.Effect.Success<
          ReturnType<typeof authenticate>
        >['authenticatedApi']
      | null;
    mode: 'online' | 'existing-only';
    ownerToken: object;
    gateOpen: boolean;
    stateRequested: boolean;
    capturedSnapshot: IServiceFrontendReplicaState | null;
    bufferedBlocks: IServiceFrontendReplicaBlock[];
    released: boolean;
  }> = [];

  constructor(
    readonly catalogRow: typeof serviceFrontendReplicaLocators.$inferSelect &
      Partial<typeof serviceFrontendReplicaMetadata.$inferSelect>,
    readonly userReplicaStore: {
      userId: string;
      userReplicaSqlite: Awaited<ReturnType<typeof makeIdbSQLite3>>;
      db: IAsyncWaSqliteDrizzleDb<typeof userReplicaDbConfig>;
      systemId: string;
      vfsName: string;
      acquisitionTail: Promise<void>;
    },
    public replicaSqlite: Awaited<ReturnType<typeof makeIdbSQLite3>>,
    public db: IAsyncWaSqliteDrizzleDb,
    readonly resourceSchemas: IAnyDrizzleSchemas,
    readonly frontendSpec: Schema.Schema.Type<typeof serviceFrontendSpecSchema>,
    readonly runtime: ManagedRuntime.ManagedRuntime<
      CuidFactory | MonotonicFactory,
      IAnyError
    >,
    readonly authenticationRuntime: ManagedRuntime.ManagedRuntime<
      Async | PublishableKey | TelemetryCollector | ZerospinApiUrl,
      IAnyError
    >,
    readonly systemId: ISystemId,
    readonly systemName: string,
    readonly sharedWorkerApiUrl: string,
    readonly allocateRegistrationId: () => number,
    onlineReplacementInstalled: boolean,
  ) {
    this.onlineReplacementInstalled = onlineReplacementInstalled;
    this.status =
      catalogRow.systemVersion === undefined ||
      catalogRow.frontendIndex === undefined ||
      catalogRow.replicaIndex === undefined
        ? 'activating'
        : 'ready';
  }

  serialize<SUCCESS>(program: () => Promise<SUCCESS>): Promise<SUCCESS> {
    const result = this.queueTail.then(program);
    this.queueTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async getSnapshot(): Promise<IServiceFrontendReplicaState> {
    const metadata = await this.db
      .select()
      .from(serviceFrontendReplicaMetadata)
      .where(eq(serviceFrontendReplicaMetadata.id, this.catalogRow.id))
      .get();
    if (metadata === undefined) {
      throw new ZerospinError({
        code: 'service-frontend-replica-state-missing',
        message: 'Service frontend replica has no committed metadata',
      });
    }
    const resources: IEncodedResourceShape[] = [];
    for (const resourceSchema of Object.values(this.resourceSchemas)) {
      for (const row of await this.db.select().from(resourceSchema).all()) {
        resources.push(Schema.validateSync(EncodedResourceSchema)(row));
      }
    }
    resources.sort((left, right) =>
      `${left.modelName}/${left.id}`.localeCompare(
        `${right.modelName}/${right.id}`,
      ),
    );
    return Schema.validateSync(ServiceFrontendReplicaStateSchema)({
      systemId: this.systemId,
      systemVersion: metadata.systemVersion,
      serviceName: this.catalogRow.serviceName,
      userId: this.catalogRow.userId,
      frontendName: this.catalogRow.frontendName,
      serviceFrontendLockKey: this.catalogRow.serviceFrontendLockKey,
      frontendIndex: metadata.frontendIndex,
      replicaIndex: metadata.replicaIndex,
      resources,
    });
  }

  async replaceFromServer(
    frontendState: IServiceFrontendState,
    assertAuthorityCurrent: () => void,
  ): Promise<IServiceFrontendReplicaState> {
    Schema.validateSync(ServiceFrontendStateSchema)(frontendState, {
      onExcessProperty: 'error',
    });
    if (
      frontendState.systemId !== this.systemId ||
      frontendState.serviceName !== this.catalogRow.serviceName ||
      frontendState.userId !== this.catalogRow.userId ||
      frontendState.frontendName !== this.catalogRow.frontendName
    ) {
      throw new ZerospinError({
        code: 'service-frontend-replica-state-target-mismatch',
        message: 'Authoritative service state targets another replica',
      });
    }
    if (
      !Number.isSafeInteger(frontendState.frontendIndex) ||
      frontendState.frontendIndex < 0
    ) {
      throw new ZerospinError({
        code: 'service-frontend-replica-state-index-invalid',
        message: 'Authoritative service state has an invalid frontend index',
      });
    }
    assertAuthorityCurrent();

    await this.runtime.runPromise(
      makeTxAsync({
        db: this.db,
        program: ({ tx }) =>
          Effect.tryPromise({
            try: async () => {
              assertAuthorityCurrent();
              const metadata = await tx
                .select()
                .from(serviceFrontendReplicaMetadata)
                .where(
                  eq(serviceFrontendReplicaMetadata.id, this.catalogRow.id),
                )
                .get();
              if (metadata === undefined && this.status !== 'activating') {
                throw new ZerospinError({
                  code: 'service-frontend-replica-metadata-missing',
                  message: 'Service replacement requires committed metadata',
                });
              }
              const replicaIndex =
                metadata === undefined ? 0 : metadata.replicaIndex + 1;
              if (!Number.isSafeInteger(replicaIndex)) {
                throw new ZerospinError({
                  code: 'service-frontend-replica-index-exhausted',
                  message:
                    'Service frontend replica index exceeded the safe integer range',
                });
              }
              await tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
              if (metadata !== undefined) {
                for (const resourceSchema of Object.values(
                  this.resourceSchemas,
                ).reverse()) {
                  await tx.delete(resourceSchema).run();
                }
              }
              for (const resource of frontendState.resources) {
                const decoded = Schema.validateSync(EncodedResourceSchema)(
                  resource,
                );
                const resourceSchema = this.resourceSchemas[decoded.modelName];
                if (resourceSchema === undefined) {
                  throw new ZerospinError({
                    code: 'service-frontend-replica-resource-model-missing',
                    message:
                      'Authoritative service state contains an unknown resource model',
                  });
                }
                await tx.insert(resourceSchema).values(decoded).run();
              }
              if (metadata === undefined) {
                await tx
                  .insert(serviceFrontendReplicaMetadata)
                  .values({
                    id: this.catalogRow.id,
                    replicaIndex,
                    frontendIndex: frontendState.frontendIndex,
                    systemVersion: frontendState.systemVersion,
                  })
                  .run();
              } else {
                await tx
                  .update(serviceFrontendReplicaMetadata)
                  .set({
                    replicaIndex,
                    frontendIndex: frontendState.frontendIndex,
                    systemVersion: frontendState.systemVersion,
                  })
                  .where(
                    eq(serviceFrontendReplicaMetadata.id, this.catalogRow.id),
                  )
                  .run();
              }
              assertAuthorityCurrent();
            },
            catch: cause =>
              ZerospinError.isZerospinError(cause)
                ? cause
                : new ZerospinError({
                    code: 'replace-service-frontend-replica-failed',
                    message: 'Failed to replace service frontend replica state',
                    cause: ZerospinError.prettyUnknownFailure(cause),
                  }),
          }),
      }),
    );

    const snapshot = await this.getSnapshot();
    this.catalogRow.replicaIndex = snapshot.replicaIndex;
    this.catalogRow.frontendIndex = snapshot.frontendIndex;
    this.catalogRow.systemVersion = snapshot.systemVersion;
    this.status = 'ready';
    this.onlineReplacementInstalled = true;
    return snapshot;
  }

  async acquire(props: {
    sink: ServiceFrontendReplicaSinkApi;
    getAuthenticatedApi(props: {
      freshness: 'current' | 'refresh-if-current' | 'force';
      failedAuthenticatedApi:
        | Effect.Effect.Success<
            ReturnType<typeof authenticate>
          >['authenticatedApi']
        | null;
    }): Promise<Effect.Effect.Success<ReturnType<typeof authenticate>>>;
    getCurrentAuthenticatedApi():
      | Effect.Effect.Success<
          ReturnType<typeof authenticate>
        >['authenticatedApi']
      | null;
    mode: 'online' | 'existing-only';
    ownerToken: object;
  }): Promise<{
    registrationId: string;
    registrationWasExisting: boolean;
  }> {
    if (this.status === 'failed') {
      throw this.lastFailure === null
        ? new ZerospinError({
            code: 'service-frontend-replica-failed',
            message: 'The exact service frontend replica has terminally failed',
          })
        : ZerospinError.parse(this.lastFailure);
    }
    const existing = this.registrations.find(
      registration =>
        registration.ownerToken === props.ownerToken && !registration.released,
    );
    if (existing !== undefined) {
      if (props.mode === 'online') {
        existing.mode = 'online';
        existing.getAuthenticatedApi = props.getAuthenticatedApi;
        existing.getCurrentAuthenticatedApi = props.getCurrentAuthenticatedApi;
      }
      if (props.sink instanceof RpcStub && props.sink !== existing.sink) {
        props.sink[Symbol.dispose]();
      }
      return {
        registrationId: existing.id,
        registrationWasExisting: true,
      };
    }

    const registrationId = `service-registration-${this.allocateRegistrationId()}`;
    const capturedSnapshot =
      this.status === 'ready' ? await this.getSnapshot() : null;
    const retainedSink =
      props.sink instanceof RpcStub ? props.sink.dup() : props.sink;
    this.registrations.push({
      id: registrationId,
      sink: retainedSink,
      getAuthenticatedApi: props.getAuthenticatedApi,
      getCurrentAuthenticatedApi: props.getCurrentAuthenticatedApi,
      mode: props.mode,
      ownerToken: props.ownerToken,
      gateOpen: false,
      stateRequested: false,
      capturedSnapshot,
      bufferedBlocks: [],
      released: false,
    });

    return {
      registrationId,
      registrationWasExisting: false,
    };
  }

  async getAcquiredState(
    registrationId: string,
  ): Promise<IServiceFrontendReplicaState> {
    return this.serialize(async () => {
      const registration = this.registrations.find(
        candidate => candidate.id === registrationId && !candidate.released,
      );
      if (registration === undefined) {
        throw new ZerospinError({
          code: 'service-frontend-replica-acquisition-released',
          message: 'Service frontend replica acquisition is released',
        });
      }
      if (registration.stateRequested) return this.getSnapshot();
      registration.stateRequested = true;
      const capturedSnapshot =
        registration.capturedSnapshot ?? (await this.getSnapshot());
      registration.capturedSnapshot = capturedSnapshot;
      setTimeout(() => {
        void this.serialize(async () => {
          if (registration.released) return;
          registration.gateOpen = true;
          const bufferedBlocks = registration.bufferedBlocks;
          registration.bufferedBlocks = [];
          for (const block of bufferedBlocks) {
            try {
              await this.runtime.runPromise(
                decodeRpc(await registration.sink.handleBlock(block)),
              );
            } catch {
              try {
                await this.runtime.runPromise(
                  decodeRpc(
                    await registration.sink.replaceState(
                      await this.getSnapshot(),
                    ),
                  ),
                );
              } catch {
                void this.release(registration.id);
                break;
              }
            }
          }
        });
      }, 0);
      return capturedSnapshot;
    });
  }

  async fanoutBlock(block: IServiceFrontendReplicaBlock): Promise<void> {
    if (
      block.systemId !== this.systemId ||
      block.serviceName !== this.catalogRow.serviceName ||
      block.userId !== this.catalogRow.userId ||
      block.frontendName !== this.catalogRow.frontendName ||
      block.serviceFrontendLockKey !== this.catalogRow.serviceFrontendLockKey
    ) {
      throw new ZerospinError({
        code: 'service-frontend-replica-envelope-target-mismatch',
        message:
          'Service replica envelope does not match this target and lock materialization',
      });
    }
    for (const registration of this.registrations) {
      if (registration.released) continue;
      if (!registration.gateOpen) {
        registration.bufferedBlocks.push(block);
        continue;
      }
      try {
        await this.runtime.runPromise(
          decodeRpc(await registration.sink.handleBlock(block)),
        );
      } catch {
        try {
          await this.runtime.runPromise(
            decodeRpc(
              await registration.sink.replaceState(await this.getSnapshot()),
            ),
          );
        } catch {
          void this.release(registration.id);
        }
      }
    }
  }

  async fanoutReplacement(state: IServiceFrontendReplicaState): Promise<void> {
    if (
      state.systemId !== this.systemId ||
      state.serviceName !== this.catalogRow.serviceName ||
      state.userId !== this.catalogRow.userId ||
      state.frontendName !== this.catalogRow.frontendName ||
      state.serviceFrontendLockKey !== this.catalogRow.serviceFrontendLockKey
    ) {
      throw new ZerospinError({
        code: 'service-frontend-replica-envelope-target-mismatch',
        message:
          'Service replica state does not match this target and lock materialization',
      });
    }
    for (const registration of this.registrations) {
      if (registration.released || !registration.gateOpen) continue;
      try {
        await this.runtime.runPromise(
          decodeRpc(await registration.sink.replaceState(state)),
        );
      } catch {
        void this.release(registration.id);
      }
    }
  }

  async repairFromRegistration(props?: {
    failedAuthority?: {
      registrationId: string;
      ownerToken: object;
      authenticatedApi: Effect.Effect.Success<
        ReturnType<typeof authenticate>
      >['authenticatedApi'];
      frontendApi: Parameters<
        typeof fetchServiceFrontendState
      >[0]['frontendApi'];
    } | null;
    authorityFailure?: unknown;
    excludedOwnerToken?: object | null;
    forceFresh?: boolean;
    replaceState?: boolean;
  }): Promise<void> {
    if (this.status === 'failed') {
      throw this.lastFailure === null
        ? new ZerospinError({
            code: 'service-frontend-replica-failed',
            message: 'The exact service frontend replica has terminally failed',
          })
        : ZerospinError.parse(this.lastFailure);
    }
    if (this.authoritySelectionPromise !== null) {
      return this.authoritySelectionPromise;
    }
    if (
      props?.failedAuthority !== undefined &&
      props.failedAuthority !== null &&
      this.installedAuthority !== props.failedAuthority
    ) {
      return;
    }

    const replaceState = props?.replaceState !== false;
    if (replaceState) {
      this.onlineReplacementInstalled = false;
    }
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    if (this.reconnectFiber !== null) {
      this.runtime.runFork(Fiber.interrupt(this.reconnectFiber));
      this.reconnectFiber = null;
    }
    this.socketState = 'disconnected';

    let detachedAuthority = this.installedAuthority;
    const detachedRegistration =
      detachedAuthority === null
        ? undefined
        : this.registrations.find(
            registration =>
              registration.id === detachedAuthority?.registrationId &&
              registration.ownerToken === detachedAuthority.ownerToken &&
              !registration.released &&
              registration.mode === 'online',
          );
    const installedAuthorityUsable =
      detachedAuthority !== null &&
      detachedRegistration !== undefined &&
      detachedRegistration.getCurrentAuthenticatedApi() ===
        detachedAuthority.authenticatedApi;
    const invalidateInstalledAuthority =
      props?.failedAuthority === detachedAuthority ||
      props?.forceFresh === true ||
      !installedAuthorityUsable;
    if (invalidateInstalledAuthority) {
      this.installedAuthority = null;
      this.authoritySelectionAttempt = {};
    } else {
      detachedAuthority = null;
      this.authoritySelectionAttempt ??= {};
    }
    let selectionAttempt = this.authoritySelectionAttempt;
    if (selectionAttempt === null) {
      throw new ZerospinError({
        code: 'service-frontend-authority-selection-stale',
        message: 'Service frontend authority selection was invalidated',
      });
    }

    let failedAuthenticatedApi:
      | Effect.Effect.Success<
          ReturnType<typeof authenticate>
        >['authenticatedApi']
      | null = detachedAuthority?.authenticatedApi ?? null;
    let refreshRegistrationId = detachedAuthority?.registrationId ?? null;
    let previousOwnerToken = detachedAuthority?.ownerToken ?? null;
    let forceFresh =
      props?.forceFresh === true || this.forceFreshAuthoritySelection;
    const excludedOwnerTokens = new Set<object>();
    if (
      props?.excludedOwnerToken !== undefined &&
      props.excludedOwnerToken !== null
    ) {
      excludedOwnerTokens.add(props.excludedOwnerToken);
    }
    let lastFailure: unknown = props?.authorityFailure;

    const authoritySelectionPromise = (async () => {
      if (
        ZerospinError.isZerospinError(props?.authorityFailure) &&
        (props.authorityFailure.code === 'service-frontend-lock-unsupported' ||
          props.authorityFailure.extra?.registrationAdmissionRejected === true)
      ) {
        throw props.authorityFailure;
      }

      let stateAttempt = 0;
      let frontierRetry = 0;
      while (stateAttempt < 2) {
        if (this.installedAuthority === null) {
          const preferredRegistration =
            refreshRegistrationId === null
              ? undefined
              : this.registrations.find(
                  registration =>
                    registration.id === refreshRegistrationId &&
                    !registration.released &&
                    registration.mode === 'online',
                );
          const registrations = [
            ...(preferredRegistration === undefined
              ? []
              : [preferredRegistration]),
            ...this.registrations.filter(
              registration => registration !== preferredRegistration,
            ),
          ];
          for (const registration of registrations) {
            if (
              registration.released ||
              registration.mode !== 'online' ||
              excludedOwnerTokens.has(registration.ownerToken)
            ) {
              continue;
            }

            let candidateFrontendApi:
              | Parameters<typeof fetchServiceFrontendState>[0]['frontendApi']
              | null = null;
            try {
              const authenticated = await registration.getAuthenticatedApi({
                freshness:
                  forceFresh ||
                  (previousOwnerToken !== null &&
                    previousOwnerToken !== registration.ownerToken)
                    ? 'force'
                    : refreshRegistrationId === registration.id &&
                        failedAuthenticatedApi !== null
                      ? 'refresh-if-current'
                      : 'current',
                failedAuthenticatedApi:
                  refreshRegistrationId === registration.id
                    ? failedAuthenticatedApi
                    : null,
              });
              if (
                this.authoritySelectionAttempt !== selectionAttempt ||
                registration.released ||
                !this.registrations.includes(registration) ||
                registration.mode !== 'online' ||
                authenticated.authenticatedApi !==
                  registration.getCurrentAuthenticatedApi()
              ) {
                throw new ZerospinError({
                  code: 'service-frontend-registration-authorization-stale',
                  message:
                    'Service frontend parent authorization changed before child acquisition',
                });
              }
              if (
                authenticated.systemId !== this.systemId ||
                authenticated.userId !== this.catalogRow.userId ||
                authenticated.systemName !== this.systemName
              ) {
                throw new ZerospinError({
                  code: 'shared-worker-authenticated-user-identity-mismatch',
                  message:
                    'Service frontend authority belongs to another bound partition',
                });
              }

              candidateFrontendApi =
                await authenticated.authenticatedApi.getServiceFrontendApi({
                  serviceName: this.catalogRow.serviceName,
                  frontendName: this.catalogRow.frontendName,
                  serviceFrontendLock: this.frontendSpec.serviceFrontendLock,
                });
              const decodedAdmission = await this.runtime.runPromise(
                decodeRpc(await candidateFrontendApi.getAdmission()).pipe(
                  Effect.either,
                ),
              );
              if (Either.isLeft(decodedAdmission)) {
                throw decodedAdmission.left;
              }
              const admitted = Schema.decodeUnknownSync(
                Schema.Struct({
                  userId: Schema.String,
                  serviceName: Schema.String,
                  frontendName: Schema.String,
                  serviceFrontendLock: ServiceFrontendLockSchema,
                  frontendSpec: serviceFrontendSpecSchema,
                  systemId: Schema.String,
                  systemVersion: Schema.String,
                }),
              )(decodedAdmission.right, { onExcessProperty: 'error' });
              const admittedLock = Schema.encodeUnknownSync(
                Schema.parseJson(ServiceFrontendLockSchema),
              )(admitted.serviceFrontendLock, { onExcessProperty: 'error' });
              const admittedLockKey = await this.runtime.runPromise(
                makeServiceFrontendLockKey(admitted.serviceFrontendLock),
              );
              const admittedSpec = Schema.encodeUnknownSync(
                Schema.parseJson(serviceFrontendSpecSchema),
              )(admitted.frontendSpec, { onExcessProperty: 'error' });
              const admissionMismatches = [
                admitted.systemId !== this.systemId ? 'systemId' : null,
                admitted.userId !== this.catalogRow.userId ? 'userId' : null,
                admitted.serviceName !== this.catalogRow.serviceName
                  ? 'serviceName'
                  : null,
                admitted.frontendName !== this.catalogRow.frontendName
                  ? 'frontendName'
                  : null,
                admitted.frontendSpec.kind !== 'service'
                  ? 'frontendSpec.kind'
                  : null,
                admitted.frontendSpec.systemName !== this.systemName
                  ? 'frontendSpec.systemName'
                  : null,
                admitted.frontendSpec.serviceName !==
                this.catalogRow.serviceName
                  ? 'frontendSpec.serviceName'
                  : null,
                admitted.frontendSpec.frontendName !==
                this.catalogRow.frontendName
                  ? 'frontendSpec.frontendName'
                  : null,
                admittedLock !== this.catalogRow.serviceFrontendLock
                  ? 'serviceFrontendLock'
                  : null,
                admittedLockKey !== this.catalogRow.serviceFrontendLockKey
                  ? 'serviceFrontendLockKey'
                  : null,
                admittedSpec !== this.catalogRow.frontendSpec
                  ? 'frontendSpec'
                  : null,
              ].filter(mismatch => mismatch !== null);
              if (admissionMismatches.length > 0) {
                throw new ZerospinError({
                  code: 'service-frontend-admission-target-mismatch',
                  message: `Worker-owned service frontend admission does not match the exact replica request: ${admissionMismatches.join(', ')}`,
                  extra: { registrationAdmissionRejected: true },
                });
              }
              if (
                this.authoritySelectionAttempt !== selectionAttempt ||
                registration.released ||
                !this.registrations.includes(registration) ||
                registration.mode !== 'online' ||
                authenticated.authenticatedApi !==
                  registration.getCurrentAuthenticatedApi()
              ) {
                throw new ZerospinError({
                  code: 'service-frontend-registration-authorization-stale',
                  message:
                    'Service frontend parent authorization changed during child admission',
                });
              }

              const candidateAuthority = {
                registrationId: registration.id,
                ownerToken: registration.ownerToken,
                authenticatedApi: authenticated.authenticatedApi,
                frontendApi: candidateFrontendApi,
              };
              await this.serialize(async () => {
                if (
                  this.authoritySelectionAttempt !== selectionAttempt ||
                  this.installedAuthority !== null ||
                  registration.released ||
                  !this.registrations.includes(registration) ||
                  registration.mode !== 'online' ||
                  registration.ownerToken !== candidateAuthority.ownerToken ||
                  candidateAuthority.authenticatedApi !==
                    registration.getCurrentAuthenticatedApi()
                ) {
                  throw new ZerospinError({
                    code: 'service-frontend-registration-authorization-stale',
                    message:
                      'Service frontend authorization became stale before installation',
                  });
                }
                this.installedAuthority = candidateAuthority;
                this.forceFreshAuthoritySelection = false;
              });
              candidateFrontendApi = null;
              detachedAuthority?.frontendApi[Symbol.dispose]();
              detachedAuthority = null;
              failedAuthenticatedApi = null;
              refreshRegistrationId = null;
              previousOwnerToken = registration.ownerToken;
              forceFresh = false;
              break;
            } catch (cause) {
              candidateFrontendApi?.[Symbol.dispose]();
              if (
                ZerospinError.isZerospinError(cause) &&
                (cause.code === 'service-frontend-lock-unsupported' ||
                  cause.extra?.registrationAdmissionRejected === true)
              ) {
                throw cause;
              }
              lastFailure = cause;
              excludedOwnerTokens.add(registration.ownerToken);
              if (detachedAuthority?.ownerToken === registration.ownerToken) {
                detachedAuthority.frontendApi[Symbol.dispose]();
                detachedAuthority = null;
              }
              failedAuthenticatedApi = null;
              refreshRegistrationId = null;
              forceFresh = true;
              this.forceFreshAuthoritySelection = true;
            }
          }
        }

        const capturedAuthority = this.installedAuthority;
        if (capturedAuthority === null) {
          const failure = ZerospinError.isZerospinError(lastFailure)
            ? lastFailure
            : new ZerospinError({
                code: 'service-frontend-authority-unavailable',
                message:
                  'No online service frontend registration has usable authority',
                cause: ZerospinError.prettyUnknownFailure(lastFailure),
              });
          this.lastFailure = ZerospinError.stringify(failure);
          if (this.status === 'activating') throw failure;
          return;
        }
        const capturedRegistration = this.registrations.find(
          registration =>
            registration.id === capturedAuthority.registrationId &&
            registration.ownerToken === capturedAuthority.ownerToken &&
            !registration.released &&
            registration.mode === 'online',
        );
        if (
          capturedRegistration === undefined ||
          this.authoritySelectionAttempt !== selectionAttempt ||
          capturedRegistration.getCurrentAuthenticatedApi() !==
            capturedAuthority.authenticatedApi
        ) {
          throw new ZerospinError({
            code: 'service-frontend-registration-stale',
            message: 'The installed service frontend authority is stale',
          });
        }
        if (!replaceState) {
          this.lastFailure = null;
          return;
        }

        const capturedFrontendIndex = this.catalogRow.frontendIndex;
        const capturedReplicaIndex = this.catalogRow.replicaIndex;
        let frontendState: IServiceFrontendState;
        try {
          const fetched = await this.authenticationRuntime.runPromise(
            fetchServiceFrontendState({
              frontendApi: capturedAuthority.frontendApi,
            }).pipe(Effect.either),
          );
          if (Either.isLeft(fetched)) throw fetched.left;
          frontendState = fetched.right;
        } catch (cause) {
          if (
            ZerospinError.isZerospinError(cause) &&
            (cause.code === 'service-frontend-lock-unsupported' ||
              cause.extra?.registrationAdmissionRejected === true)
          ) {
            throw cause;
          }
          lastFailure = cause;
          if (stateAttempt === 1) {
            if (this.installedAuthority === capturedAuthority) {
              this.installedAuthority = null;
              this.authoritySelectionAttempt = null;
              capturedAuthority.frontendApi[Symbol.dispose]();
              this.forceFreshAuthoritySelection = true;
            }
            if (this.status === 'activating') throw cause;
            this.lastFailure = ZerospinError.stringify(
              ZerospinError.isZerospinError(cause)
                ? cause
                : new ZerospinError({
                    code: 'service-frontend-replica-repair-failed',
                    message:
                      'No online service registration could repair the replica',
                    cause: ZerospinError.prettyUnknownFailure(cause),
                  }),
            );
            return;
          }
          if (this.installedAuthority === capturedAuthority) {
            this.installedAuthority = null;
            this.authoritySelectionAttempt = {};
            selectionAttempt = this.authoritySelectionAttempt;
          }
          detachedAuthority = capturedAuthority;
          failedAuthenticatedApi = capturedAuthority.authenticatedApi;
          refreshRegistrationId = capturedAuthority.registrationId;
          previousOwnerToken = capturedAuthority.ownerToken;
          forceFresh = false;
          excludedOwnerTokens.clear();
          if (
            props?.excludedOwnerToken !== undefined &&
            props.excludedOwnerToken !== null
          ) {
            excludedOwnerTokens.add(props.excludedOwnerToken);
          }
          stateAttempt += 1;
          continue;
        }

        let replacement: IServiceFrontendReplicaState | undefined;
        let frontierChanged = false;
        await this.serialize(async () => {
          if (
            this.installedAuthority !== capturedAuthority ||
            this.authoritySelectionAttempt !== selectionAttempt ||
            capturedRegistration.released ||
            !this.registrations.includes(capturedRegistration) ||
            capturedRegistration.ownerToken !== capturedAuthority.ownerToken ||
            capturedRegistration.getCurrentAuthenticatedApi() !==
              capturedAuthority.authenticatedApi
          ) {
            throw new ZerospinError({
              code: 'service-frontend-registration-stale',
              message:
                'The installed service frontend authority changed before replacement commit',
            });
          }
          if (
            this.status === 'ready' &&
            (this.catalogRow.frontendIndex !== capturedFrontendIndex ||
              this.catalogRow.replicaIndex !== capturedReplicaIndex)
          ) {
            frontierChanged = true;
            return;
          }
          const committedReplacement = await this.replaceFromServer(
            frontendState,
            () => {
              if (
                this.installedAuthority !== capturedAuthority ||
                this.authoritySelectionAttempt !== selectionAttempt ||
                capturedRegistration.released ||
                !this.registrations.includes(capturedRegistration) ||
                capturedRegistration.ownerToken !==
                  capturedAuthority.ownerToken ||
                capturedRegistration.getCurrentAuthenticatedApi() !==
                  capturedAuthority.authenticatedApi
              ) {
                throw new ZerospinError({
                  code: 'service-frontend-registration-stale',
                  message:
                    'The installed service frontend authority changed during replacement commit',
                });
              }
            },
          );
          replacement = committedReplacement;
          for (const registration of this.registrations) {
            if (!registration.gateOpen && !registration.stateRequested) {
              registration.capturedSnapshot = committedReplacement;
            }
          }
        });
        if (frontierChanged) {
          frontierRetry += 1;
          if (frontierRetry > 1) {
            throw new ZerospinError({
              code: 'service-frontend-replica-repair-stale',
              message:
                'Service frontend replica changed during authoritative repair',
            });
          }
          continue;
        }
        if (replacement === undefined) {
          throw new ZerospinError({
            code: 'service-frontend-replica-repair-stale',
            message: 'Service frontend replacement was not committed',
          });
        }
        await this.fanoutReplacement(replacement);
        this.lastFailure = null;
        return;
      }

      throw new ZerospinError({
        code: 'service-frontend-replica-repair-failed',
        message: 'Service frontend authoritative repair was exhausted',
      });
    })();
    this.authoritySelectionPromise = authoritySelectionPromise;

    try {
      await authoritySelectionPromise;
    } catch (cause) {
      const failure: IAnyError = ZerospinError.isZerospinError(cause)
        ? cause
        : new ZerospinError({
            code: 'service-frontend-replica-repair-failed',
            message: 'No online service registration could repair the replica',
            cause: ZerospinError.prettyUnknownFailure(cause),
          });
      if (
        failure.code === 'service-frontend-lock-unsupported' ||
        failure.extra?.registrationAdmissionRejected === true
      ) {
        this.status = 'failed';
        this.lastFailure = ZerospinError.stringify(failure);
        this.onlineReplacementInstalled = false;
        this.authoritySelectionAttempt = null;
        const installedAuthority = this.installedAuthority;
        this.installedAuthority = null;
        installedAuthority?.frontendApi[Symbol.dispose]();
        detachedAuthority?.frontendApi[Symbol.dispose]();
        detachedAuthority = null;
        const publicFailure = Schema.encodeUnknownSync(ZerospinError.schema)(
          failure,
        );
        for (const registration of this.registrations) {
          if (registration.released) continue;
          try {
            await this.runtime.runPromise(
              decodeRpc(await registration.sink.handleFailure(publicFailure)),
            );
          } catch {
            // The exact Repo is fenced regardless of notification delivery.
          }
        }
      } else {
        this.socketState = 'disconnected';
        this.lastFailure = ZerospinError.stringify(failure);
      }
      throw failure;
    } finally {
      detachedAuthority?.frontendApi[Symbol.dispose]();
      if (this.authoritySelectionPromise === authoritySelectionPromise) {
        this.authoritySelectionPromise = null;
      }
      if (
        this.installedAuthority === null &&
        this.authoritySelectionAttempt === selectionAttempt
      ) {
        this.authoritySelectionAttempt = null;
      }
    }
  }

  async scheduleReconnect(): Promise<void> {
    if (
      this.reconnectFiber !== null ||
      this.status !== 'ready' ||
      !this.registrations.some(
        registration =>
          !registration.released && registration.mode === 'online',
      )
    ) {
      return;
    }
    const reconnectAttempt = this.reconnectAttempt + 1;
    const delay = Math.min(30_000, 250 * 2 ** this.reconnectAttempt);
    this.socketState = 'disconnected';
    this.reconnectAttempt = reconnectAttempt;
    this.reconnectFiber = this.runtime.runFork(
      Effect.sleep(Duration.millis(delay)).pipe(
        Effect.andThen(
          Effect.sync(() => {
            this.reconnectFiber = null;
          }),
        ),
        Effect.andThen(Effect.promise(() => this.connectSocket())),
        Effect.catchAll(() => Effect.void),
      ),
    );
  }

  async connectSocket(): Promise<void> {
    let shouldConnect = false;
    await this.serialize(async () => {
      if (
        this.socket !== null ||
        this.socketState !== 'disconnected' ||
        this.status !== 'ready' ||
        !this.registrations.some(
          registration =>
            !registration.released && registration.mode === 'online',
        )
      ) {
        return;
      }
      this.socketState = 'connecting';
      shouldConnect = true;
    });
    if (!shouldConnect) return;

    try {
      if (this.requiresOnlineReplacement()) {
        await this.repairFromRegistration();
      }

      for (let ticketAttempt = 0; ticketAttempt < 2; ticketAttempt += 1) {
        await this.serialize(async () => {
          if (this.status !== 'ready' || this.socket !== null) {
            throw new ZerospinError({
              code: 'service-frontend-registration-stale',
              message:
                'Service frontend socket connection lost its local runtime fence',
            });
          }
          this.socketState = 'connecting';
        });
        const capturedAuthority = this.installedAuthority;
        const capturedSelectionAttempt = this.authoritySelectionAttempt;
        const capturedRegistration =
          capturedAuthority === null
            ? undefined
            : this.registrations.find(
                registration =>
                  registration.id === capturedAuthority.registrationId &&
                  registration.ownerToken === capturedAuthority.ownerToken &&
                  !registration.released &&
                  registration.mode === 'online',
              );
        if (
          capturedAuthority === null ||
          capturedSelectionAttempt === null ||
          capturedRegistration === undefined ||
          capturedRegistration.getCurrentAuthenticatedApi() !==
            capturedAuthority.authenticatedApi
        ) {
          throw new ZerospinError({
            code: 'service-frontend-authority-unavailable',
            message:
              'No installed service frontend authority can create a WebSocket ticket',
          });
        }

        let ticket: Readonly<{ ticket: string }>;
        try {
          const created = await this.authenticationRuntime.runPromise(
            createServiceFrontendWebSocketTicket({
              frontendApi: capturedAuthority.frontendApi,
            }).pipe(Effect.either),
          );
          if (Either.isLeft(created)) throw created.left;
          ticket = created.right;
        } catch (cause) {
          if (
            this.installedAuthority !== capturedAuthority ||
            this.authoritySelectionAttempt !== capturedSelectionAttempt ||
            capturedRegistration.released ||
            capturedRegistration.getCurrentAuthenticatedApi() !==
              capturedAuthority.authenticatedApi
          ) {
            throw new ZerospinError({
              code: 'service-frontend-registration-stale',
              message:
                'Service frontend authority changed during ticket creation',
            });
          }
          if (
            ZerospinError.isZerospinError(cause) &&
            (cause.code === 'service-frontend-lock-unsupported' ||
              cause.extra?.registrationAdmissionRejected === true)
          ) {
            await this.repairFromRegistration({
              failedAuthority: capturedAuthority,
              authorityFailure: cause,
              replaceState: false,
            });
          }
          if (ticketAttempt === 1) throw cause;
          await this.repairFromRegistration({
            failedAuthority: capturedAuthority,
            authorityFailure: cause,
            replaceState: false,
          });
          continue;
        }

        const socketUrl = new URL(this.sharedWorkerApiUrl);
        if (socketUrl.protocol === 'https:') {
          socketUrl.protocol = 'wss:';
        } else if (socketUrl.protocol === 'http:') {
          socketUrl.protocol = 'ws:';
        } else {
          throw new ZerospinError({
            code: 'service-frontend-websocket-url-invalid',
            message: 'SharedWorker API URL must use http or https',
          });
        }
        socketUrl.pathname = '/ws-service-frontend-blocks';
        socketUrl.search = '';
        socketUrl.searchParams.set('ticket', ticket.ticket);

        const installedSocket = await this.serialize(async () => {
          if (
            this.installedAuthority !== capturedAuthority ||
            this.authoritySelectionAttempt !== capturedSelectionAttempt ||
            capturedRegistration.released ||
            !this.registrations.includes(capturedRegistration) ||
            capturedRegistration.ownerToken !== capturedAuthority.ownerToken ||
            capturedRegistration.getCurrentAuthenticatedApi() !==
              capturedAuthority.authenticatedApi ||
            this.socket !== null ||
            this.status !== 'ready'
          ) {
            throw new ZerospinError({
              code: 'service-frontend-registration-stale',
              message: 'Service frontend authority changed before ticket use',
            });
          }
          let socket: WebSocket;
          try {
            socket = new WebSocket(socketUrl.toString());
          } catch (cause) {
            throw new ZerospinError({
              code: 'service-frontend-websocket-construction-failed',
              message: 'Failed to construct service frontend WebSocket',
              cause: ZerospinError.prettyUnknownFailure(cause),
            });
          }
          this.socket = socket;
          return socket;
        });

        installedSocket.addEventListener('open', () => {
          void this.serialize(async () => {
            if (
              this.socket !== installedSocket ||
              this.installedAuthority !== capturedAuthority ||
              this.authoritySelectionAttempt !== capturedSelectionAttempt ||
              capturedRegistration.released ||
              !this.registrations.includes(capturedRegistration) ||
              capturedRegistration.ownerToken !==
                capturedAuthority.ownerToken ||
              capturedRegistration.getCurrentAuthenticatedApi() !==
                capturedAuthority.authenticatedApi
            ) {
              installedSocket.close();
              return;
            }
            const snapshot = await this.getSnapshot();
            if (
              this.socket !== installedSocket ||
              this.installedAuthority !== capturedAuthority ||
              this.authoritySelectionAttempt !== capturedSelectionAttempt ||
              capturedRegistration.released ||
              !this.registrations.includes(capturedRegistration) ||
              capturedRegistration.ownerToken !==
                capturedAuthority.ownerToken ||
              capturedRegistration.getCurrentAuthenticatedApi() !==
                capturedAuthority.authenticatedApi
            ) {
              installedSocket.close();
              return;
            }
            this.socketState = 'replaying';
            installedSocket.send(
              JSON.stringify({ frontendIndex: snapshot.frontendIndex }),
            );
          }).catch(() => installedSocket.close());
        });

        installedSocket.addEventListener('message', event => {
          void (async () => {
            try {
              if (
                this.socket !== installedSocket ||
                this.installedAuthority !== capturedAuthority ||
                this.authoritySelectionAttempt !== capturedSelectionAttempt ||
                capturedRegistration.released ||
                !this.registrations.includes(capturedRegistration) ||
                capturedRegistration.ownerToken !==
                  capturedAuthority.ownerToken ||
                capturedRegistration.getCurrentAuthenticatedApi() !==
                  capturedAuthority.authenticatedApi
              ) {
                installedSocket.close();
                return;
              }
              const message = Schema.decodeUnknownSync(
                serviceFrontendSocketMessageSchema,
              )(String(event.data), { onExcessProperty: 'error' });
              if (message.type === 'serviceFrontendBlock') {
                await this.applyServerBlock(message.sync, () => {
                  if (
                    this.socket !== installedSocket ||
                    this.installedAuthority !== capturedAuthority ||
                    this.authoritySelectionAttempt !==
                      capturedSelectionAttempt ||
                    capturedRegistration.released ||
                    !this.registrations.includes(capturedRegistration) ||
                    capturedRegistration.ownerToken !==
                      capturedAuthority.ownerToken ||
                    capturedRegistration.getCurrentAuthenticatedApi() !==
                      capturedAuthority.authenticatedApi
                  ) {
                    throw new ZerospinError({
                      code: 'service-frontend-socket-callback-stale',
                      message:
                        'Service frontend socket callback no longer owns the exact installed authority and socket',
                    });
                  }
                });
                return;
              }
              if (message.type === 'state-required') {
                this.onlineReplacementInstalled = false;
                await this.repairFromRegistration();
                installedSocket.close();
                await this.connectSocket();
                return;
              }
              await this.serialize(async () => {
                if (
                  this.socket !== installedSocket ||
                  this.installedAuthority !== capturedAuthority ||
                  this.authoritySelectionAttempt !== capturedSelectionAttempt ||
                  capturedRegistration.released ||
                  !this.registrations.includes(capturedRegistration) ||
                  capturedRegistration.ownerToken !==
                    capturedAuthority.ownerToken ||
                  capturedRegistration.getCurrentAuthenticatedApi() !==
                    capturedAuthority.authenticatedApi
                ) {
                  installedSocket.close();
                  return;
                }
                const snapshot = await this.getSnapshot();
                if (
                  this.socket !== installedSocket ||
                  this.installedAuthority !== capturedAuthority ||
                  this.authoritySelectionAttempt !== capturedSelectionAttempt ||
                  capturedRegistration.released ||
                  !this.registrations.includes(capturedRegistration) ||
                  capturedRegistration.ownerToken !==
                    capturedAuthority.ownerToken ||
                  capturedRegistration.getCurrentAuthenticatedApi() !==
                    capturedAuthority.authenticatedApi
                ) {
                  installedSocket.close();
                  return;
                }
                if (
                  !Number.isSafeInteger(message.frontendIndex) ||
                  message.frontendIndex !== snapshot.frontendIndex
                ) {
                  throw new ZerospinError({
                    code: 'service-frontend-websocket-replay-watermark-mismatch',
                    message:
                      'Replay completion does not match the committed service watermark',
                  });
                }
                this.socketState = 'online';
                this.reconnectAttempt = 0;
                this.lastFailure = null;
              });
            } catch (cause) {
              let repairSucceeded = false;
              try {
                await this.repairFromRegistration({
                  failedAuthority:
                    ZerospinError.isZerospinError(cause) &&
                    (cause.code === 'service-frontend-lock-unsupported' ||
                      cause.extra?.registrationAdmissionRejected === true)
                      ? capturedAuthority
                      : null,
                  authorityFailure: cause,
                });
                repairSucceeded = true;
              } catch {
                // A later online registration or reconnect retries local repair.
              }
              installedSocket.close();
              if (repairSucceeded) {
                await this.connectSocket();
              } else {
                await this.scheduleReconnect();
              }
            }
          })();
        });
        installedSocket.addEventListener('error', () =>
          installedSocket.close(),
        );
        installedSocket.addEventListener('close', event => {
          void (async () => {
            let generationTransition = false;
            let shouldReconnect = false;
            await this.serialize(async () => {
              if (this.socket !== installedSocket) return;
              this.socket = null;
              if (this.status === 'failed') return;
              this.socketState = 'disconnected';
              if (
                this.installedAuthority !== capturedAuthority ||
                this.authoritySelectionAttempt !== capturedSelectionAttempt ||
                capturedRegistration.released ||
                !this.registrations.includes(capturedRegistration) ||
                capturedRegistration.ownerToken !==
                  capturedAuthority.ownerToken ||
                capturedRegistration.getCurrentAuthenticatedApi() !==
                  capturedAuthority.authenticatedApi
              ) {
                shouldReconnect = true;
                return;
              }
              generationTransition =
                event.code === 1012 && event.reason === 'generation-drained';
              if (generationTransition) {
                this.onlineReplacementInstalled = false;
              } else {
                shouldReconnect = true;
              }
            });
            if (generationTransition) {
              try {
                await this.repairFromRegistration();
                await this.connectSocket();
              } catch {
                await this.scheduleReconnect();
              }
            } else if (shouldReconnect) {
              await this.scheduleReconnect();
            }
          })();
        });
        return;
      }
    } catch (cause) {
      const failure = ZerospinError.isZerospinError(cause)
        ? cause
        : new ZerospinError({
            code: 'service-frontend-websocket-ticket-failed',
            message: 'No installed service authority could open a socket',
            cause: ZerospinError.prettyUnknownFailure(cause),
          });
      await this.serialize(async () => {
        if (this.socket === null && this.status !== 'failed') {
          this.socketState = 'disconnected';
          this.lastFailure = ZerospinError.stringify(failure);
        }
      });
      await this.scheduleReconnect();
    }
  }

  async applyServerBlock(
    frontendBlock: IServiceFrontendBlock,
    assertSourceCurrent: () => void,
  ): Promise<void> {
    Schema.validateSync(ServiceFrontendBlockSchema)(frontendBlock, {
      onExcessProperty: 'error',
    });
    await this.serialize(async () => {
      assertSourceCurrent();
      const current = await this.getSnapshot();
      if (
        frontendBlock.serviceName !== current.serviceName ||
        frontendBlock.userId !== current.userId ||
        frontendBlock.frontendName !== current.frontendName
      ) {
        throw new ZerospinError({
          code: 'service-frontend-websocket-block-target-mismatch',
          message: 'Service frontend block targets another replica',
        });
      }
      if (
        !Number.isSafeInteger(frontendBlock.frontendIndex) ||
        frontendBlock.frontendIndex < 0
      ) {
        throw new ZerospinError({
          code: 'service-frontend-websocket-block-index-invalid',
          message: 'Service frontend block has an invalid frontend index',
        });
      }
      if (frontendBlock.frontendIndex <= current.frontendIndex) return;
      if (frontendBlock.frontendIndex !== current.frontendIndex + 1) {
        throw new ZerospinError({
          code: 'service-frontend-websocket-block-index-gap',
          message: 'Service frontend block is not the exact next index',
        });
      }

      const replicaBlock: IServiceFrontendReplicaBlock = {
        systemId: current.systemId,
        serviceName: current.serviceName,
        userId: current.userId,
        frontendName: current.frontendName,
        serviceFrontendLockKey: current.serviceFrontendLockKey,
        replicaIndex: current.replicaIndex + 1,
        frontendIndex: frontendBlock.frontendIndex,
        frontendBlock,
      };
      if (!Number.isSafeInteger(replicaBlock.replicaIndex)) {
        throw new ZerospinError({
          code: 'service-frontend-replica-index-exhausted',
          message:
            'Service frontend replica index exceeded the safe integer range',
        });
      }
      await this.runtime.runPromise(
        makeTxAsync({
          db: this.db,
          program: ({ tx }) =>
            Effect.tryPromise({
              try: async () => {
                assertSourceCurrent();
                await tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
                for (const resource of [
                  ...frontendBlock.delta.inserted,
                  ...frontendBlock.delta.updated,
                ]) {
                  const decodedResource = Schema.validateSync(
                    EncodedResourceSchema,
                  )(resource);
                  const resourceSchema =
                    this.resourceSchemas[decodedResource.modelName];
                  if (resourceSchema === undefined) {
                    throw new ZerospinError({
                      code: 'service-frontend-server-resource-model-missing',
                      message: `Service resource model "${decodedResource.modelName}" is not in the acquired spec`,
                    });
                  }
                  const existing = await tx
                    .select()
                    .from(resourceSchema)
                    .where(sql`id = ${decodedResource.id}`)
                    .get();
                  if (existing === undefined) {
                    await tx
                      .insert(resourceSchema)
                      .values(decodedResource)
                      .run();
                  } else {
                    await tx
                      .update(resourceSchema)
                      .set(decodedResource)
                      .where(sql`id = ${decodedResource.id}`)
                      .run();
                  }
                }
                for (const removed of frontendBlock.delta.deleted) {
                  const resourceSchema =
                    this.resourceSchemas[removed.modelName];
                  if (resourceSchema === undefined) {
                    throw new ZerospinError({
                      code: 'service-frontend-server-resource-model-missing',
                      message: `Service resource model "${removed.modelName}" is not in the acquired spec`,
                    });
                  }
                  await tx
                    .delete(resourceSchema)
                    .where(sql`id = ${removed.id}`)
                    .run();
                }
                await tx
                  .update(serviceFrontendReplicaMetadata)
                  .set({
                    replicaIndex: replicaBlock.replicaIndex,
                    frontendIndex: replicaBlock.frontendIndex,
                  })
                  .where(
                    eq(serviceFrontendReplicaMetadata.id, this.catalogRow.id),
                  )
                  .run();
                assertSourceCurrent();
              },
              catch: cause =>
                ZerospinError.isZerospinError(cause)
                  ? cause
                  : new ZerospinError({
                      code: 'apply-service-frontend-server-block-failed',
                      message: 'Failed to apply service frontend server block',
                      cause: ZerospinError.prettyUnknownFailure(cause),
                    }),
            }),
        }),
      );
      this.catalogRow.replicaIndex = replicaBlock.replicaIndex;
      this.catalogRow.frontendIndex = replicaBlock.frontendIndex;
      await this.fanoutBlock(replicaBlock);
    });
  }

  async release(registrationId: string): Promise<void> {
    const registration = this.registrations.find(
      candidate => candidate.id === registrationId && !candidate.released,
    );
    if (registration === undefined) return;

    registration.released = true;
    registration.bufferedBlocks = [];
    const selectedAuthority =
      this.installedAuthority?.registrationId === registration.id &&
      this.installedAuthority.ownerToken === registration.ownerToken
        ? this.installedAuthority
        : null;
    if (selectedAuthority !== null) {
      this.installedAuthority = null;
      this.authoritySelectionAttempt = null;
      this.onlineReplacementInstalled = false;
      this.forceFreshAuthoritySelection = true;
      const socket = this.socket;
      this.socket = null;
      socket?.close();
      selectedAuthority.frontendApi[Symbol.dispose]();
      if (this.reconnectFiber !== null) {
        this.runtime.runFork(Fiber.interrupt(this.reconnectFiber));
        this.reconnectFiber = null;
      }
      this.socketState = 'disconnected';
    }
    const onlineRegistrationRemains = this.registrations.some(
      candidate => !candidate.released && candidate.mode === 'online',
    );
    if (!onlineRegistrationRemains) {
      const installedAuthority = this.installedAuthority;
      this.installedAuthority = null;
      this.authoritySelectionAttempt = null;
      this.onlineReplacementInstalled = false;
      installedAuthority?.frontendApi[Symbol.dispose]();
      const socket = this.socket;
      this.socket = null;
      socket?.close();
      if (this.reconnectFiber !== null) {
        this.runtime.runFork(Fiber.interrupt(this.reconnectFiber));
        this.reconnectFiber = null;
      }
      this.socketState = 'disconnected';
    }

    await this.serialize(async () => {
      const registrationIndex = this.registrations.findIndex(
        candidate => candidate === registration,
      );
      if (registrationIndex === -1) return;
      if (registration.sink instanceof RpcStub) {
        registration.sink[Symbol.dispose]();
      }
      this.registrations.splice(registrationIndex, 1);
    });

    if (
      selectedAuthority !== null &&
      onlineRegistrationRemains &&
      this.status === 'ready'
    ) {
      setTimeout(() => {
        void (async () => {
          const pendingSelection = this.authoritySelectionPromise;
          if (pendingSelection !== null) {
            await pendingSelection.catch(() => undefined);
          }
          try {
            await this.repairFromRegistration({
              excludedOwnerToken: registration.ownerToken,
              forceFresh: true,
            });
            await this.connectSocket();
          } catch {
            await this.scheduleReconnect();
          }
        })();
      }, 0);
    }
  }

  async releaseOwner(ownerToken: object): Promise<void> {
    await Promise.all(
      this.registrations
        .filter(
          candidate =>
            candidate.ownerToken === ownerToken && !candidate.released,
        )
        .map(registration => this.release(registration.id)),
    );
  }

  activeRegistrationCount(): number {
    return this.registrations.filter(registration => !registration.released)
      .length;
  }

  getRuntimeState(): Readonly<{
    status: 'activating' | 'ready' | 'failed';
    socketState: 'disconnected' | 'connecting' | 'replaying' | 'online';
    reconnectAttempt: number;
    lastFailure: string | null;
  }> {
    return {
      status: this.status,
      socketState: this.socketState,
      reconnectAttempt: this.reconnectAttempt,
      lastFailure: this.lastFailure,
    };
  }

  requiresOnlineReplacement(): boolean {
    if (this.status !== 'ready' || !this.onlineReplacementInstalled) {
      return true;
    }
    const installedAuthority = this.installedAuthority;
    if (installedAuthority === null) return true;
    const registration = this.registrations.find(
      candidate =>
        candidate.id === installedAuthority.registrationId &&
        candidate.ownerToken === installedAuthority.ownerToken &&
        !candidate.released &&
        candidate.mode === 'online',
    );
    return (
      registration === undefined ||
      registration.getCurrentAuthenticatedApi() !==
        installedAuthority.authenticatedApi
    );
  }
}
