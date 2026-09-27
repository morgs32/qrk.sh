import { makeZerospinError, mapParseError } from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/schema';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import type { ITx } from '../drizzle/types.ts';
import { upsertHelper } from '../drizzle/upsertHelper.ts';
import type { IAnyModels, IExecutionDelta } from '../models/types.ts';

/** Install authoritative resource values without executing authored programs. */
export const applyExecutionDeltaTx = Effect.fn('applyExecutionDeltaTx')(
  function* (props: {
    tx: ITx;
    models: IAnyModels;
    executionDelta: IExecutionDelta;
  }) {
    const { tx, models, executionDelta } = props;
    for (const resource of [
      ...executionDelta.inserted,
      ...executionDelta.updated,
    ]) {
      const model = models[resource.modelName];
      if (model === undefined || model.version !== resource.version) {
        return yield* Effect.fail(
          makeZerospinError('execution-delta-model-mismatch'),
        );
      }
      const values = yield* Schema.decodeUnknownEffect(
        makeEffectSchema(model.propertiesShape),
      )(resource, { onExcessProperty: 'error' }).pipe(
        // Drizzle JSON columns store text; validation decodes it into objects.
        Effect.flatMap(row =>
          Schema.encodeEffect(makeEffectSchema(model.propertiesShape))(row),
        ),
        mapParseError({
          code: 'execution-delta-invalid',
          prefix: 'Invalid authoritative resource',
        }),
      );
      upsertHelper({
        tx,
        table: model.drizzleSchema,
        values: {
          ...values,
          id: resource.id,
          modelName: resource.modelName,
          version: resource.version,
          createdAt: resource.createdAt,
          updatedAt: resource.updatedAt,
        },
      });
    }
    for (const resource of executionDelta.deleted) {
      const model = models[resource.modelName];
      if (model === undefined || model.version !== resource.version) {
        return yield* Effect.fail(
          makeZerospinError('execution-delta-model-mismatch'),
        );
      }
      tx.delete(model.drizzleSchema)
        .where(eq(model.drizzleSchema.id, resource.id))
        .run();
    }
  },
);
