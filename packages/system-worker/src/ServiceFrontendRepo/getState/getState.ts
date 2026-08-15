import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { makeEffectSchema } from '@zerospin/core/models/primitiveMaps';
import type {
  IAnyDrizzleSchemas,
  IEncodedResourceShape,
} from '@zerospin/core/models/types';
import type { IServiceFrontendState } from '@zerospin/core/serviceSession/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { eq, getTableName, sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { system } from 'system';

import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { getServiceBlockRepo } from '../../ServiceBlockRepo/getServiceBlockRepo/getServiceBlockRepo.js';
import { getServiceFrontendBlockRepo } from '../../ServiceFrontendBlockRepo/getServiceFrontendBlockRepo/getServiceFrontendBlockRepo.js';
import {
  serviceFrontendBlockDrizzleSchemas,
  ServiceFrontendBlockRepo,
} from '../../ServiceFrontendBlockRepo/ServiceFrontendBlockRepo.js';
import { getServiceRepo } from '../../ServiceRepo/getServiceRepo/getServiceRepo.js';
import { SystemRepo } from '../../SystemRepo/SystemRepo.js';
import { drainServiceFrontendBlockOutbox } from '../drainServiceFrontendBlockOutbox/drainServiceFrontendBlockOutbox.js';
import { projectServiceFrontendResource } from '../projectServiceFrontendResource/projectServiceFrontendResource.js';
import { serviceFrontendRepoDrizzleSchemas } from '../ServiceFrontendRepo.js';

/*
 * 1. Validate the bound capability against the deterministic repository key.
 * 2. Install one source snapshot and watermark transactionally on first use.
 * 3. Record root lineage before any frontend block can be archived.
 * 4. Register and synchronously catch up through ServiceBlockRepo's captured T.
 * 5. Require projection outbox/archive acknowledgement through current state.
 * 6. Publish the projection/archive registration pair atomically, then return.
 */
export const getState = Effect.fn('ServiceFrontendRepo.getState')(
  function* (props: {
    systemId: string;
    configuredSystemId: string;
    serviceName: string;
    userId: string;
    frontendName: string;
    db: IDb;
    deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
    key: {
      generationId: string;
      serviceName: string;
      userId: string;
      frontendName: string;
    };
    name: string;
    serviceFrontendRepoSchema: IAnyDrizzleSchemas;
    storage: DurableObjectStorage;
    lineage: Readonly<{
      predecessor: Readonly<{
        generationId: string;
        repoName: string;
        terminalFrontendIndex: number;
      }> | null;
    }>;
  }): Effect.fn.Return<IServiceFrontendState, IAnyError, Async> {
    const {
      configuredSystemId,
      db,
      deliveryQueue,
      key,
      name,
      serviceFrontendRepoSchema,
      storage,
      lineage,
    } = props;

    // 1 — every identity is checked before state or downstream repos are touched.
    const systemId = yield* Schema.decodeUnknown(
      makeAbbreviationIdSchema(coreAbbreviations.system),
    )(props.systemId).pipe(
      mapParseError({
        code: 'service-frontend-state-system-id-invalid',
        prefix: 'Failed to decode service frontend state systemId',
      }),
    );
    const expectedSystemId = yield* Schema.decodeUnknown(
      makeAbbreviationIdSchema(coreAbbreviations.system),
    )(configuredSystemId).pipe(
      mapParseError({
        code: 'service-frontend-configured-system-id-invalid',
        prefix: 'Failed to decode configured service frontend systemId',
      }),
    );
    const generationId = yield* Schema.decodeUnknown(
      makeAbbreviationIdSchema(coreAbbreviations.generation),
    )(key.generationId).pipe(
      mapParseError({
        code: 'service-frontend-state-generation-id-invalid',
        prefix: 'Failed to decode service frontend state generationId',
      }),
    );
    const userId = yield* Schema.decodeUnknown(Schema.NonEmptyString)(
      key.userId,
    ).pipe(
      mapParseError({
        code: 'service-frontend-state-user-id-invalid',
        prefix: 'Failed to decode service frontend state userId',
      }),
    );
    const predecessorGenerationId =
      lineage.predecessor === null
        ? null
        : yield* Schema.decodeUnknown(
            makeAbbreviationIdSchema(coreAbbreviations.generation),
          )(lineage.predecessor.generationId).pipe(
            mapParseError({
              code: 'service-frontend-lineage-predecessor-generation-invalid',
              prefix:
                'Failed to decode service frontend predecessor generationId',
            }),
          );
    if (
      systemId !== expectedSystemId ||
      props.serviceName !== key.serviceName ||
      props.userId !== userId ||
      props.frontendName !== key.frontendName ||
      name.length === 0
    ) {
      return yield* new ZerospinError({
        code: 'service-frontend-state-target-mismatch',
        message:
          'Service frontend state request does not match its bound repository target',
      });
    }
    if (
      lineage.predecessor !== null &&
      (predecessorGenerationId === generationId ||
        lineage.predecessor.repoName.length === 0 ||
        !Number.isInteger(lineage.predecessor.terminalFrontendIndex) ||
        lineage.predecessor.terminalFrontendIndex < 0)
    ) {
      return yield* new ZerospinError({
        code: 'service-frontend-lineage-predecessor-invalid',
        message:
          'Service frontend predecessor must identify an older archive and non-negative terminal index',
      });
    }

    const service = yield* getByKeyOrThrow({
      record: system.services,
      key: key.serviceName,
      recordKind: 'services',
    });
    const frontendBinding = yield* getByKeyOrThrow({
      record: service.frontends,
      key: key.frontendName,
      recordKind: `frontends owned by service ${key.serviceName}`,
    });
    const boundSourceModelNames = new Set(
      Object.values(frontendBinding.models).map(model => model.modelName),
    );

    // 2 — a failed later stage reuses these exact deterministic snapshot bytes.
    let projectionState = db
      .select()
      .from(serviceFrontendRepoDrizzleSchemas.projectionState)
      .where(eq(serviceFrontendRepoDrizzleSchemas.projectionState.id, 'state'))
      .get();
    if (projectionState === undefined) {
      const serviceRepo = yield* getServiceRepo({
        key: {
          generationId: key.generationId,
          serviceName: key.serviceName,
        },
      });
      const snapshot = yield* makeAsync(() =>
        serviceRepo.getServiceFrontendSnapshot({
          serviceName: key.serviceName,
          frontendName: key.frontendName,
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      if (
        (snapshot.lastServiceCursor === null) !==
        (snapshot.serviceIndex === null)
      ) {
        return yield* new ZerospinError({
          code: 'service-frontend-snapshot-watermark-incomplete',
          message:
            'Service frontend snapshot cursor and index must both be null or both be present',
        });
      }
      if (
        snapshot.serviceIndex !== null &&
        (!Number.isInteger(snapshot.serviceIndex) || snapshot.serviceIndex < 1)
      ) {
        return yield* new ZerospinError({
          code: 'service-frontend-snapshot-index-invalid',
          message: `Service frontend snapshot index must be null or a positive integer, received ${snapshot.serviceIndex}`,
        });
      }

      const projectedResources: IEncodedResourceShape[] = [];
      for (const resource of snapshot.resources) {
        if (!boundSourceModelNames.has(resource.modelName)) {
          continue;
        }
        const projectedResult = yield* projectServiceFrontendResource({
          serviceName: key.serviceName,
          frontendName: key.frontendName,
          modelName: resource.modelName,
          resource,
        });
        const projected = yield* Schema.decodeUnknown(
          Schema.Struct({
            modelName: Schema.String,
            resource: EncodedResourceSchema,
          }),
        )(projectedResult, { onExcessProperty: 'error' }).pipe(
          mapParseError({
            code: 'service-frontend-snapshot-projection-invalid',
            prefix: `Dynamic service frontend projection for ${key.serviceName}.${key.frontendName}.${resource.modelName} returned an invalid result`,
          }),
        );
        if (
          projected.resource.modelName !== projected.modelName ||
          Object.values(frontendBinding.controller.models).some(
            model => model.modelName === projected.modelName,
          ) === false
        ) {
          return yield* new ZerospinError({
            code: 'service-frontend-snapshot-projection-model-mismatch',
            message: `Projected service resource targets undeclared frontend model "${projected.modelName}"`,
          });
        }
        projectedResources.push(projected.resource);
      }

      yield* makeTx({
        db,
        program: Effect.fn('ServiceFrontendRepo.installSnapshot.transaction')(
          function* ({ tx }) {
            tx.run(sql.raw('PRAGMA defer_foreign_keys = ON'));
            for (const resource of snapshot.resources) {
              const model = Object.values(service.models).find(
                candidate => candidate.modelName === resource.modelName,
              );
              const sourceDrizzleSchema =
                serviceFrontendRepoSchema[
                  `serviceSource_${resource.modelName}`
                ];
              if (model === undefined || sourceDrizzleSchema === undefined) {
                return yield* new ZerospinError({
                  code: 'service-frontend-snapshot-model-not-declared',
                  message: `Snapshot model "${resource.modelName}" is not declared by ${key.serviceName}.${key.frontendName}`,
                });
              }
              yield* Schema.decodeUnknown(
                makeEffectSchema(model.propertiesShape),
              )(resource, { onExcessProperty: 'error' }).pipe(
                mapParseError({
                  code: 'service-frontend-snapshot-resource-invalid',
                  prefix: `Failed to decode service frontend snapshot resource ${resource.modelName}.${resource.id}`,
                }),
              );
              tx.insert(sourceDrizzleSchema).values(resource).run();
            }
            for (const resource of projectedResources) {
              const model = Object.values(
                frontendBinding.controller.models,
              ).find(candidate => candidate.modelName === resource.modelName);
              if (model === undefined) {
                return yield* new ZerospinError({
                  code: 'service-frontend-projected-model-not-declared',
                  message: `Projected model "${resource.modelName}" is not declared by ${key.serviceName}.${key.frontendName}`,
                });
              }
              yield* Schema.decodeUnknown(
                makeEffectSchema(model.propertiesShape),
              )(resource, { onExcessProperty: 'error' }).pipe(
                mapParseError({
                  code: 'service-frontend-projected-resource-invalid',
                  prefix: `Failed to decode projected service frontend resource ${resource.modelName}.${resource.id}`,
                }),
              );
              tx.insert(model.drizzleSchema).values(resource).run();
            }

            tx.insert(serviceFrontendRepoDrizzleSchemas.projectionState)
              .values({
                id: 'state',
                systemId,
                generationId,
                serviceName: key.serviceName,
                userId,
                frontendName: key.frontendName,
                status: 'initializing',
                segmentKind:
                  lineage.predecessor === null ? 'root' : 'inherited',
                emissionMode:
                  lineage.predecessor === null ? 'live' : 'no-emission',
                lastServiceCursor: snapshot.lastServiceCursor,
                serviceIndex: snapshot.serviceIndex,
                frontendIndex: lineage.predecessor?.terminalFrontendIndex ?? 0,
                predecessorGenerationId,
                predecessorRepoName: lineage.predecessor?.repoName ?? null,
                predecessorTerminalFrontendIndex:
                  lineage.predecessor?.terminalFrontendIndex ?? null,
              })
              .run();
          },
        ),
      });
      projectionState = db
        .select()
        .from(serviceFrontendRepoDrizzleSchemas.projectionState)
        .where(
          eq(serviceFrontendRepoDrizzleSchemas.projectionState.id, 'state'),
        )
        .get();
    }

    if (
      projectionState === undefined ||
      projectionState.systemId !== systemId ||
      projectionState.generationId !== generationId ||
      projectionState.serviceName !== key.serviceName ||
      projectionState.userId !== userId ||
      projectionState.frontendName !== key.frontendName
    ) {
      return yield* new ZerospinError({
        code: 'service-frontend-projection-state-mismatch',
        message:
          'Stored ServiceFrontendRepo projection metadata does not match its exact target',
      });
    }

    const expectedSegmentKind =
      lineage.predecessor === null ? 'root' : 'inherited';
    if (
      projectionState.segmentKind !== expectedSegmentKind ||
      projectionState.predecessorGenerationId !== predecessorGenerationId ||
      projectionState.predecessorRepoName !==
        (lineage.predecessor?.repoName ?? null) ||
      projectionState.predecessorTerminalFrontendIndex !==
        (lineage.predecessor?.terminalFrontendIndex ?? null)
    ) {
      return yield* new ZerospinError({
        code: 'service-frontend-projection-lineage-conflict',
        message:
          'Stored ServiceFrontendRepo lineage does not match this state retry',
      });
    }

    const serviceFrontendBlockRepoName =
      yield* ServiceFrontendBlockRepo.boundDORepoConfig.nameUtils.makeName({
        generationId: key.generationId,
        serviceName: key.serviceName,
        userId: key.userId,
        frontendName: key.frontendName,
      });
    const serviceFrontendBlockRepo = yield* getServiceFrontendBlockRepo({
      key,
    });

    if (
      (projectionState.predecessorGenerationId === null &&
        (projectionState.predecessorRepoName !== null ||
          projectionState.predecessorTerminalFrontendIndex !== null)) ||
      (projectionState.predecessorGenerationId !== null &&
        (projectionState.predecessorRepoName === null ||
          projectionState.predecessorTerminalFrontendIndex === null))
    ) {
      return yield* new ZerospinError({
        code: 'service-frontend-predecessor-descriptor-invalid',
        message:
          'ServiceFrontendRepo predecessor descriptor is incomplete persisted state',
      });
    }

    // 3 — roots and inherited successors both install their exact immutable
    // descriptor before any frontend block can become externally visible.
    const recordPredecessorUnknown = yield* makeAsync(() =>
      serviceFrontendBlockRepo.recordPredecessor({
        systemId,
        predecessor: lineage.predecessor,
      }),
    );
    const recordPredecessorEncoded = yield* Schema.decodeUnknown(
      Schema.Union(
        Schema.Struct({
          _tag: Schema.Literal('Right'),
          right: Schema.Undefined,
        }),
        Schema.Struct({
          _tag: Schema.Literal('Left'),
          left: Schema.encodedSchema(ZerospinError.schema),
        }),
      ),
    )(recordPredecessorUnknown).pipe(
      mapParseError({
        code: 'service-frontend-record-predecessor-rpc-invalid',
        prefix: 'Failed to decode ServiceFrontendBlockRepo predecessor RPC',
      }),
    );
    yield* decodeRpc(recordPredecessorEncoded);

    if (
      projectionState.segmentKind === 'inherited' &&
      projectionState.status === 'initializing'
    ) {
      if (lineage.predecessor === null) {
        return yield* new ZerospinError({
          code: 'service-frontend-inherited-predecessor-required',
          message: 'Inherited ServiceFrontendRepo state requires a predecessor',
        });
      }
      if (
        projectionState.emissionMode === 'no-emission' &&
        projectionState.frontendIndex ===
          lineage.predecessor.terminalFrontendIndex
      ) {
        db.update(serviceFrontendRepoDrizzleSchemas.projectionState)
          .set({
            emissionMode: 'live',
          })
          .where(
            eq(serviceFrontendRepoDrizzleSchemas.projectionState.id, 'state'),
          )
          .run();
        projectionState = db
          .select()
          .from(serviceFrontendRepoDrizzleSchemas.projectionState)
          .where(
            eq(serviceFrontendRepoDrizzleSchemas.projectionState.id, 'state'),
          )
          .get();
      } else if (
        projectionState.emissionMode !== 'live' ||
        projectionState.frontendIndex <
          lineage.predecessor.terminalFrontendIndex
      ) {
        return yield* new ZerospinError({
          code: 'service-frontend-inherited-index-conflict',
          message:
            'Inherited ServiceFrontendRepo state does not match its boundary index',
        });
      }
      if (projectionState === undefined) {
        return yield* new ZerospinError({
          code: 'service-frontend-boundary-state-required',
          message:
            'ServiceFrontendRepo projection state disappeared after boundary archival',
        });
      }
    }
    if (
      projectionState.segmentKind === 'inherited' &&
      projectionState.status === 'ready' &&
      (lineage.predecessor === null ||
        projectionState.emissionMode !== 'live' ||
        projectionState.frontendIndex <
          lineage.predecessor.terminalFrontendIndex)
    ) {
      return yield* new ZerospinError({
        code: 'service-frontend-ready-inherited-index-conflict',
        message:
          'Ready inherited ServiceFrontendRepo state is behind its lineage boundary',
      });
    }

    // 4 — ServiceBlockRepo captures T and does not return until this subscriber
    // has durably acknowledged the complete (N, T] suffix.
    const serviceBlockRepo = yield* getServiceBlockRepo({
      key: {
        generationId: key.generationId,
        serviceName: key.serviceName,
      },
    });
    const subscriptionUnknown = yield* makeAsync(() =>
      serviceBlockRepo.subscribeServiceFrontend({
        serviceFrontendRepoName: name,
        serviceName: key.serviceName,
        userId,
        frontendName: key.frontendName,
        currentServiceCursor: projectionState.lastServiceCursor,
        currentServiceIndex: projectionState.serviceIndex,
      }),
    );
    const subscriptionEncoded = yield* Schema.decodeUnknown(
      Schema.Union(
        Schema.Struct({
          _tag: Schema.Literal('Right'),
          right: Schema.Struct({
            throughServiceCursor: Schema.NullOr(
              makeAbbreviationIdSchema(coreAbbreviations.serviceCursor),
            ),
            throughServiceIndex: Schema.NullOr(Schema.Number),
          }),
        }),
        Schema.Struct({
          _tag: Schema.Literal('Left'),
          left: Schema.encodedSchema(ZerospinError.schema),
        }),
      ),
    )(subscriptionUnknown).pipe(
      mapParseError({
        code: 'service-frontend-subscription-rpc-invalid',
        prefix: 'Failed to decode ServiceBlockRepo subscription RPC',
      }),
    );
    yield* decodeRpc(subscriptionEncoded);

    // 5 — handler acknowledgements already archive synchronously; this explicit
    // drain also resumes an outbox left by a lost response or earlier failure.
    yield* drainServiceFrontendBlockOutbox({
      db,
      deliveryQueue,
      key,
      storage,
    });

    // A live subscriber may commit another source block while either downstream
    // RPC below is suspended. Capture the logical index and all projected rows in
    // one transaction now, then return these exact bytes after readiness and
    // registration instead of mixing a pre-await index with post-await rows.
    const frontendState = yield* makeTx({
      db,
      program: Effect.fn('ServiceFrontendRepo.readFrontendState.transaction')(
        function* ({ tx }) {
          const returnState = tx
            .select()
            .from(serviceFrontendRepoDrizzleSchemas.projectionState)
            .where(
              eq(serviceFrontendRepoDrizzleSchemas.projectionState.id, 'state'),
            )
            .get();
          if (returnState === undefined) {
            return yield* new ZerospinError({
              code: 'service-frontend-projection-state-required',
              message:
                'ServiceFrontendRepo lost its projection state before capturing the coherent snapshot',
            });
          }

          const resources: IEncodedResourceShape[] = [];
          for (const model of Object.values(
            frontendBinding.controller.models,
          )) {
            for (const row of tx.select().from(model.drizzleSchema).all()) {
              resources.push(
                yield* Schema.validate(EncodedResourceSchema)(row).pipe(
                  mapParseError({
                    code: 'service-frontend-state-resource-invalid',
                    prefix: `Failed to decode service frontend state resource ${model.modelName}`,
                  }),
                ),
              );
            }
          }

          return {
            userId,
            systemId,
            systemVersion: system.version,
            serviceName: key.serviceName,
            frontendName: key.frontendName,
            frontendIndex: returnState.frontendIndex,
            resources,
          };
        },
      ),
    });

    // Drain again after the snapshot so every outbox row represented by the
    // captured frontendIndex is durably archived before readiness is asserted.
    yield* drainServiceFrontendBlockOutbox({
      db,
      deliveryQueue,
      key,
      storage,
    });
    const archiveReadinessUnknown = yield* makeAsync(() =>
      serviceFrontendBlockRepo.assertArchiveThrough({
        frontendIndex: frontendState.frontendIndex,
      }),
    );
    const archiveReadinessEncoded = yield* Schema.decodeUnknown(
      Schema.Union(
        Schema.Struct({
          _tag: Schema.Literal('Right'),
          right: Schema.Undefined,
        }),
        Schema.Struct({
          _tag: Schema.Literal('Left'),
          left: Schema.encodedSchema(ZerospinError.schema),
        }),
      ),
    )(archiveReadinessUnknown).pipe(
      mapParseError({
        code: 'service-frontend-archive-readiness-rpc-invalid',
        prefix: 'Failed to decode ServiceFrontendBlockRepo readiness RPC',
      }),
    );
    yield* decodeRpc(archiveReadinessEncoded);
    db.update(serviceFrontendRepoDrizzleSchemas.projectionState)
      .set({ status: 'ready' })
      .where(eq(serviceFrontendRepoDrizzleSchemas.projectionState.id, 'state'))
      .run();

    // 6 — no consumer can discover only one half of the projection pair.
    yield* makeAsync(() =>
      SystemRepo.getRepo({ systemId: expectedSystemId }).registerRepos({
        generationId: key.generationId,
        frontendRepo: {
          repoType: 'ServiceFrontendRepo',
          repoName: name,
          tableNames: Object.values(serviceFrontendRepoSchema).map(
            getTableName,
          ),
        },
        frontendBlockRepo: {
          repoType: 'ServiceFrontendBlockRepo',
          repoName: serviceFrontendBlockRepoName,
          tableNames: Object.values(serviceFrontendBlockDrizzleSchemas).map(
            getTableName,
          ),
        },
      }),
    ).pipe(Effect.flatMap(decodeRpc));
    return frontendState;
  },
);
