import type { ITx } from '@zerospin/core/drizzle/types';
import { upsertHelper } from '@zerospin/core/drizzle/upsertHelper';
import type {
  IEncodedResourceShape,
  IModels,
  IRef,
} from '@zerospin/core/models/types';
import type { IRefRecord } from '@zerospin/core/system/types';
import { ZerospinError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';

export const applyDeltas = Effect.fn('AggregateFrontendRepo.applyDeltas')(
  function* (props: {
    tx: ITx;
    models: IModels;
    graphTable: {
      resourceId: unknown;
      modelName: unknown;
    };
    deltas: Readonly<
      Record<
        string,
        Readonly<{
          inserted: Readonly<Record<string, IEncodedResourceShape>>;
          updated: Readonly<Record<string, IEncodedResourceShape>>;
          deleted: Readonly<Record<string, IRef>>;
        }>
      >
    >;
  }) {
    const { deltas, graphTable, models, tx } = props;
    const graph: IRefRecord = {};
    for (const row of tx
      .select()
      .from(graphTable as never)
      .all() as Array<{
      resourceId: string;
      modelName: string;
    }>) {
      graph[row.resourceId] = { id: row.resourceId, modelName: row.modelName };
    }
    for (const delta of Object.values(deltas)) {
      for (const resource of Object.values(delta.inserted)) {
        const model = models[resource.modelName];
        if (model === undefined) {
          return yield* new ZerospinError({
            code: 'aggregate-frontend-delta-model-not-found',
            message: `Projected inserted resource targets unknown frontend model "${resource.modelName}"`,
          });
        }
        upsertHelper({
          table: model.drizzleSchema,
          tx,
          values: resource as never,
        });
        tx.insert(graphTable as never)
          .values({
            resourceId: resource.id,
            modelName: resource.modelName,
          } as never)
          .onConflictDoUpdate({
            target: (graphTable as unknown as { resourceId: never }).resourceId,
            set: { modelName: resource.modelName } as never,
          })
          .run();
        graph[resource.id] = { id: resource.id, modelName: resource.modelName };
      }
      for (const resource of Object.values(delta.updated)) {
        const model = models[resource.modelName];
        if (model === undefined) {
          return yield* new ZerospinError({
            code: 'aggregate-frontend-delta-model-not-found',
            message: `Projected updated resource targets unknown frontend model "${resource.modelName}"`,
          });
        }
        upsertHelper({
          table: model.drizzleSchema,
          tx,
          values: resource as never,
        });
        tx.insert(graphTable as never)
          .values({
            resourceId: resource.id,
            modelName: resource.modelName,
          } as never)
          .onConflictDoUpdate({
            target: (graphTable as unknown as { resourceId: never }).resourceId,
            set: { modelName: resource.modelName } as never,
          })
          .run();
        graph[resource.id] = { id: resource.id, modelName: resource.modelName };
      }
      for (const ref of Object.values(delta.deleted)) {
        const model = models[ref.modelName];
        if (model === undefined) {
          return yield* new ZerospinError({
            code: 'aggregate-frontend-delta-model-not-found',
            message: `Projected deleted resource targets unknown frontend model "${ref.modelName}"`,
          });
        }
        tx.delete(model.drizzleSchema)
          .where(eq(model.drizzleSchema.id, ref.id))
          .run();
        tx.delete(graphTable as never)
          .where(
            eq(
              (graphTable as unknown as { resourceId: never }).resourceId,
              ref.id,
            ),
          )
          .run();
        delete graph[ref.id];
      }
    }
    return graph;
  },
);
