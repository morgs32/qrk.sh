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
  IServiceCursorId,
} from '@zerospin/core/models/types';
import type { IServiceFrontendState } from '@zerospin/core/serviceSession/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { eq, getTableName, sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { system } from 'system';

import { getServiceBlockRepo } from '../../ServiceBlockRepo/getServiceBlockRepo/getServiceBlockRepo.js';
import { getServiceFrontendBlockRepo } from '../../ServiceFrontendBlockRepo/getServiceFrontendBlockRepo/getServiceFrontendBlockRepo.js';
import {
  serviceFrontendBlockDrizzleSchemas,
  ServiceFrontendBlockRepo,
} from '../../ServiceFrontendBlockRepo/ServiceFrontendBlockRepo.js';
import { getServiceRepo } from '../../ServiceRepo/getServiceRepo/getServiceRepo.js';
import { SystemRepo } from '../../SystemRepo/SystemRepo.js';
import { projectServiceFrontendResource } from '../projectServiceFrontendResource/projectServiceFrontendResource.js';
import { serviceFrontendRepoDrizzleSchemas } from '../ServiceFrontendRepo.js';

/*
 * Installs a predecessor snapshot at its causal watermark, applies only the
 * exact target-generation suffix in no-emission mode, then opens ordinary
 * emission at the predecessor terminal index.
 */
export const prepareSuccessor = Effect.fn(
  'ServiceFrontendRepo.prepareSuccessor',
)(function* (props: {
  sourceState: IServiceFrontendState;
  lastServiceCursor: IServiceCursorId | null;
  serviceIndex: number | null;
  predecessor: Readonly<{
    generationId: string;
    repoName: string;
    terminalFrontendIndex: number;
  }>;
  configuredSystemId: string;
  db: IDb;
  key: {
    generationId: string;
    serviceName: string;
    userId: string;
    frontendName: string;
  };
  name: string;
  serviceFrontendRepoSchema: IAnyDrizzleSchemas;
}): Effect.fn.Return<void, IAnyError, Async> {
  const {
    db,
    key,
    lastServiceCursor,
    name,
    predecessor,
    serviceFrontendRepoSchema,
    serviceIndex,
    sourceState,
  } = props;

  const systemId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.system),
  )(props.configuredSystemId).pipe(
    mapParseError({
      code: 'service-frontend-successor-system-id-invalid',
      prefix: 'Failed to decode configured successor systemId',
    }),
  );
  const generationId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.generation),
  )(key.generationId).pipe(
    mapParseError({
      code: 'service-frontend-successor-generation-id-invalid',
      prefix: 'Failed to decode successor generationId',
    }),
  );
  const userId = yield* Schema.decodeUnknown(Schema.NonEmptyString)(
    key.userId,
  ).pipe(
    mapParseError({
      code: 'service-frontend-successor-user-id-invalid',
      prefix: 'Failed to decode successor userId',
    }),
  );
  const predecessorGenerationId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.generation),
  )(predecessor.generationId).pipe(
    mapParseError({
      code: 'service-frontend-successor-predecessor-generation-invalid',
      prefix: 'Failed to decode predecessor generationId',
    }),
  );
  if (
    predecessorGenerationId === generationId ||
    !Number.isInteger(predecessor.terminalFrontendIndex) ||
    predecessor.terminalFrontendIndex < 0 ||
    sourceState.systemId !== systemId ||
    sourceState.serviceName !== key.serviceName ||
    sourceState.userId !== userId ||
    sourceState.frontendName !== key.frontendName ||
    sourceState.frontendIndex !== predecessor.terminalFrontendIndex ||
    (lastServiceCursor === null) !== (serviceIndex === null) ||
    (serviceIndex !== null &&
      (!Number.isInteger(serviceIndex) || serviceIndex < 1))
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-successor-source-mismatch',
      message:
        'Service frontend successor source state, causal watermark, and predecessor descriptor must identify one exact logical frontend',
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

  const existingState = db
    .select()
    .from(serviceFrontendRepoDrizzleSchemas.projectionState)
    .where(eq(serviceFrontendRepoDrizzleSchemas.projectionState.id, 'state'))
    .get();
  if (existingState === undefined) {
    // The predecessor snapshot establishes logical lineage only. Target rows
    // come from the target generation's authoritative ServiceRepo after replay,
    // so projection model additions, removals, and schema changes are resolved
    // by target-generation truth instead of predecessor projection bytes.
    const serviceRepo = yield* getServiceRepo({
      key: {
        generationId: key.generationId,
        serviceName: key.serviceName,
      },
    });
    const targetSnapshot = yield* makeAsync(() =>
      serviceRepo.getServiceFrontendSnapshot({
        serviceName: key.serviceName,
        frontendName: key.frontendName,
      }),
    ).pipe(Effect.flatMap(decodeRpc));
    if (
      targetSnapshot.lastServiceCursor !== lastServiceCursor ||
      targetSnapshot.serviceIndex !== serviceIndex
    ) {
      return yield* new ZerospinError({
        code: 'service-frontend-successor-target-watermark-mismatch',
        message:
          'Target ServiceRepo snapshot must match the frozen service watermark before successor projection installation',
      });
    }

    const projectedResources: IEncodedResourceShape[] = [];
    for (const resource of targetSnapshot.resources) {
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
          code: 'service-frontend-successor-projection-invalid',
          prefix: `Dynamic successor projection for ${key.serviceName}.${key.frontendName}.${resource.modelName} returned an invalid result`,
        }),
      );
      if (
        projected.modelName !== projected.resource.modelName ||
        Object.values(frontendBinding.controller.models).some(
          model => model.modelName === projected.modelName,
        ) === false
      ) {
        return yield* new ZerospinError({
          code: 'service-frontend-successor-projection-model-mismatch',
          message: `Successor projection targets undeclared frontend model "${projected.modelName}"`,
        });
      }
      projectedResources.push(projected.resource);
    }

    yield* makeTx({
      db,
      program: Effect.fn(
        'ServiceFrontendRepo.prepareSuccessor.installSnapshot',
      )(function* ({ tx }) {
        tx.run(sql.raw('PRAGMA defer_foreign_keys = ON'));
        for (const resource of targetSnapshot.resources) {
          const model = Object.values(service.models).find(
            candidate => candidate.modelName === resource.modelName,
          );
          const sourceDrizzleSchema =
            serviceFrontendRepoSchema[`serviceSource_${resource.modelName}`];
          if (model === undefined || sourceDrizzleSchema === undefined) {
            return yield* new ZerospinError({
              code: 'service-frontend-successor-source-model-not-found',
              message: `Successor snapshot targets unknown service source model "${resource.modelName}"`,
            });
          }
          const decodedResource = yield* Schema.validate(EncodedResourceSchema)(
            resource,
          ).pipe(
            mapParseError({
              code: 'service-frontend-successor-resource-invalid',
              prefix: `Failed to decode successor resource ${resource.modelName}.${resource.id}`,
            }),
          );
          yield* Schema.decodeUnknown(makeEffectSchema(model.propertiesShape))(
            decodedResource,
            { onExcessProperty: 'error' },
          ).pipe(
            mapParseError({
              code: 'service-frontend-successor-model-resource-invalid',
              prefix: `Successor resource does not match model ${resource.modelName}`,
            }),
          );
          tx.insert(sourceDrizzleSchema).values(decodedResource).run();
        }
        for (const resource of projectedResources) {
          const model = Object.values(frontendBinding.controller.models).find(
            candidate => candidate.modelName === resource.modelName,
          );
          if (model === undefined) {
            return yield* new ZerospinError({
              code: 'service-frontend-successor-model-not-found',
              message: `Successor projection targets unknown frontend model "${resource.modelName}"`,
            });
          }
          yield* Schema.decodeUnknown(makeEffectSchema(model.propertiesShape))(
            resource,
            { onExcessProperty: 'error' },
          ).pipe(
            mapParseError({
              code: 'service-frontend-successor-model-resource-invalid',
              prefix: `Successor projected resource does not match model ${resource.modelName}`,
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
            segmentKind: 'inherited',
            emissionMode: 'no-emission',
            lastServiceCursor,
            serviceIndex,
            frontendIndex: predecessor.terminalFrontendIndex,
            predecessorGenerationId,
            predecessorRepoName: predecessor.repoName,
            predecessorTerminalFrontendIndex: predecessor.terminalFrontendIndex,
          })
          .run();
      }),
    });
  } else if (
    existingState.systemId !== systemId ||
    existingState.generationId !== generationId ||
    existingState.serviceName !== key.serviceName ||
    existingState.userId !== userId ||
    existingState.frontendName !== key.frontendName ||
    existingState.segmentKind !== 'inherited' ||
    existingState.predecessorGenerationId !== predecessorGenerationId ||
    existingState.predecessorRepoName !== predecessor.repoName ||
    existingState.predecessorTerminalFrontendIndex !==
      predecessor.terminalFrontendIndex ||
    (existingState.status === 'initializing' &&
      (existingState.emissionMode !== 'no-emission' ||
        existingState.frontendIndex !== predecessor.terminalFrontendIndex)) ||
    (existingState.status === 'ready' &&
      (existingState.emissionMode !== 'live' ||
        existingState.frontendIndex !== predecessor.terminalFrontendIndex))
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-successor-state-conflict',
      message:
        'Existing ServiceFrontendRepo state does not match this successor preparation retry',
    });
  }

  const serviceFrontendBlockRepo = yield* getServiceFrontendBlockRepo({ key });
  const recordUnknown = yield* makeAsync(() =>
    serviceFrontendBlockRepo.recordPredecessor({
      systemId,
      predecessor,
    }),
  );
  const recordEncoded = yield* Schema.decodeUnknown(
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
  )(recordUnknown).pipe(
    mapParseError({
      code: 'service-frontend-successor-predecessor-rpc-invalid',
      prefix: 'Failed to decode successor predecessor RPC',
    }),
  );
  yield* decodeRpc(recordEncoded);

  const currentState = db
    .select()
    .from(serviceFrontendRepoDrizzleSchemas.projectionState)
    .where(eq(serviceFrontendRepoDrizzleSchemas.projectionState.id, 'state'))
    .get();
  if (currentState === undefined) {
    return yield* new ZerospinError({
      code: 'service-frontend-successor-state-required',
      message: 'Successor projection state disappeared after snapshot install',
    });
  }
  if (currentState.status === 'initializing') {
    const serviceBlockRepo = yield* getServiceBlockRepo({
      key: {
        generationId: key.generationId,
        serviceName: key.serviceName,
      },
    });
    const subscriptionEncoded = yield* makeAsync(() =>
      serviceBlockRepo.subscribeServiceFrontend({
        serviceFrontendRepoName: name,
        serviceName: key.serviceName,
        userId,
        frontendName: key.frontendName,
        currentServiceCursor: currentState.lastServiceCursor,
        currentServiceIndex: currentState.serviceIndex,
      }),
    );
    yield* decodeRpc(subscriptionEncoded);

    const caughtUpState = db
      .select()
      .from(serviceFrontendRepoDrizzleSchemas.projectionState)
      .where(eq(serviceFrontendRepoDrizzleSchemas.projectionState.id, 'state'))
      .get();
    if (
      caughtUpState === undefined ||
      caughtUpState.emissionMode !== 'no-emission' ||
      caughtUpState.frontendIndex !== predecessor.terminalFrontendIndex
    ) {
      return yield* new ZerospinError({
        code: 'service-frontend-successor-no-emission-violated',
        message:
          'Successor catch-up changed the logical frontend index while no-emission mode was active',
      });
    }

    db.update(serviceFrontendRepoDrizzleSchemas.projectionState)
      .set({
        status: 'ready',
        emissionMode: 'live',
      })
      .where(eq(serviceFrontendRepoDrizzleSchemas.projectionState.id, 'state'))
      .run();
  }

  const serviceFrontendBlockRepoName =
    yield* ServiceFrontendBlockRepo.boundDORepoConfig.nameUtils.makeName(key);
  yield* makeAsync(() =>
    SystemRepo.getRepo({ systemId }).registerRepos({
      generationId: key.generationId,
      frontendRepo: {
        repoType: 'ServiceFrontendRepo',
        repoName: name,
        tableNames: Object.values(serviceFrontendRepoSchema).map(getTableName),
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
});
