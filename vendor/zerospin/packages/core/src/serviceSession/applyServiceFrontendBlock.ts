import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { makeTx } from '../drizzle/makeTx.ts';
import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import { upsertHelper } from '../drizzle/upsertHelper.ts';
import { makeAbbreviationIdSchema } from '../models/makeIdSchema.ts';
import { makeEffectSchema } from '../models/primitiveMaps.ts';
import type { IServiceFrontendController } from '../serviceFrontendController/types.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import { ServiceFrontendBlockSchema } from './ServiceFrontendBlockSchema.ts';
import type { IServiceFrontendBlock } from './types.ts';

/*
 * 1. Reject a wrong target or non-contiguous frontend index before mutation.
 * 2. Prove every resource/ref belongs to a declared projection model.
 * 3. Commit the complete resource delta in one SQLite transaction.
 */
export const applyServiceFrontendBlock = Effect.fn('applyServiceFrontendBlock')(
  function* <FRONTEND extends IServiceFrontendController>(props: {
    frontend: FRONTEND;
    actorId: IServiceFrontendBlock['actorId'];
    currentFrontendIndex: number;
    db: IDb<IResourceDbConfig<FRONTEND['models'], Record<never, never>>>;
    models: FRONTEND['models'];
    frontendBlock: IServiceFrontendBlock;
  }): Effect.fn.Return<void, IAnyError> {
    const {
      actorId,
      currentFrontendIndex,
      db,
      frontend,
      frontendBlock,
      models,
    } = props;

    yield* Schema.encode(ServiceFrontendBlockSchema)(frontendBlock, {
      onExcessProperty: 'error',
    }).pipe(
      mapParseError({
        code: 'service-frontend-block-encode-failed',
        prefix: 'Failed to encode service frontend block',
      }),
    );

    if (
      frontendBlock.actorId !== actorId ||
      frontendBlock.serviceName !== frontend.serviceName ||
      frontendBlock.actorName !== frontend.actorName ||
      frontendBlock.frontendName !== frontend.frontendName
    ) {
      return yield* new ZerospinError({
        code: 'service-frontend-block-target-mismatch',
        message: 'Service frontend block does not match the bound target',
        extra: {
          expectedActorId: actorId,
          expectedServiceName: frontend.serviceName,
          expectedActorName: frontend.actorName,
          expectedFrontendName: frontend.frontendName,
          actualActorId: frontendBlock.actorId,
          actualServiceName: frontendBlock.serviceName,
          actualActorName: frontendBlock.actorName,
          actualFrontendName: frontendBlock.frontendName,
        },
      });
    }

    if (frontendBlock.frontendIndex !== currentFrontendIndex + 1) {
      return yield* new ZerospinError({
        code: 'service-frontend-block-index-gap',
        message: 'Service frontend block is not the exact next frontend index',
        extra: {
          currentFrontendIndex,
          receivedFrontendIndex: frontendBlock.frontendIndex,
        },
      });
    }

    const resourceRows = [
      ...frontendBlock.delta.inserted,
      ...frontendBlock.delta.updated,
    ];

    for (const resource of resourceRows) {
      const model = yield* getByKeyOrThrow({
        record: models,
        key: resource.modelName,
        recordKind: 'service frontend models',
      });
      yield* Schema.decodeUnknown(makeEffectSchema(model.propertiesShape))(
        resource,
        { onExcessProperty: 'error' },
      ).pipe(
        mapParseError({
          code: 'service-frontend-block-resource-invalid',
          prefix: `Failed to decode service frontend block resource ${resource.modelName}.${resource.id}`,
        }),
      );
    }
    for (const deletedRef of frontendBlock.delta.deleted) {
      const model = yield* getByKeyOrThrow({
        record: models,
        key: deletedRef.modelName,
        recordKind: 'service frontend models',
      });
      yield* Schema.validate(
        Schema.Struct({
          id: makeAbbreviationIdSchema(model.abbreviation),
          modelName: Schema.Literal(model.modelName),
        }),
      )(deletedRef, {
        onExcessProperty: 'error',
      }).pipe(
        mapParseError({
          code: 'service-frontend-block-ref-invalid',
          prefix: `Failed to decode deleted service frontend ref ${deletedRef.modelName}.${deletedRef.id}`,
        }),
      );
    }

    yield* makeTx({
      db,
      program: Effect.fn('applyServiceFrontendBlock.applyDelta')(function* ({
        tx,
      }) {
        for (const resource of resourceRows) {
          const model = yield* getByKeyOrThrow({
            record: models,
            key: resource.modelName,
            recordKind: 'service frontend models',
          });
          upsertHelper({
            table: model.drizzleSchema,
            tx,
            values: resource,
          });
        }

        for (const deletedRef of frontendBlock.delta.deleted) {
          const model = yield* getByKeyOrThrow({
            record: models,
            key: deletedRef.modelName,
            recordKind: 'service frontend models',
          });
          tx.delete(model.drizzleSchema)
            .where(eq(model.drizzleSchema.id, deletedRef.id))
            .run();
        }
      }),
    });
  },
);
