import type { IDb } from '@zerospin/core/drizzle/types';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import { getGraph } from '@zerospin/core/models/getGraph';
import type { IEncodedResourceShape } from '@zerospin/core/models/types';
import type { IAnyService } from '@zerospin/core/service/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError } from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import { resolveServiceActorView } from './resolveServiceActorView.js';

/** Read and encode the selected resources from the current resource tables. */
export const readServiceResources = Effect.fn('readServiceResources')(
  function* (
    db: IDb,
    service: IAnyService,
    key: { actorName: string; actorVersion: string; actorPath: string },
  ) {
    const models = service.models;
    const selected =
      key.actorName === '__service'
        ? // Constructor validation guarantees the exact private service tuple.
          yield* Effect.gen(function* () {
            const entries: [string, IEncodedResourceShape][] = [];
            for (const modelName of Object.keys(models)) {
              const model = models[modelName];
              if (model === undefined) {
                throw new Error(`Missing service model: ${modelName}`);
              }
              for (const resource of db
                .select()
                .from(model.drizzleSchema)
                .all()) {
                const row = Schema.decodeUnknownSync(
                  Schema.toType(EncodedResourceSchema),
                )(resource);
                entries.push([`${modelName}\0${row.id}`, row]);
              }
            }
            return Object.fromEntries(entries);
          })
        : yield* Effect.gen(function* () {
            const { actor, identity } = yield* resolveServiceActorView(
              service,
              key,
            );
            return getGraph({
              db,
              models,
              selections: actor.selections,
              identity,
            });
          });
    const nextGraph: IEncodedResourceShape[] = [];
    for (const resource of Object.values(selected)) {
      const model = yield* getByKeyOrThrow({
        record: models,
        key: resource.modelName,
        recordKind: 'service models',
      });
      const decoded = yield* Schema.decodeUnknownEffect(
        makeEffectSchema(model.propertiesShape),
      )(resource).pipe(
        Effect.flatMap(row =>
          Schema.decodeUnknownEffect(Schema.toType(model.resourceSchema))(row),
        ),
        mapParseError({
          code: 'replica-projected-resource-invalid',
          prefix: 'Invalid selected service resource',
        }),
      );
      const encoded = yield* Schema.encodeEffect(model.resourceSchema)(
        decoded,
      ).pipe(
        mapParseError({
          code: 'replica-projected-resource-invalid',
          prefix: 'Invalid selected service resource',
        }),
      );
      nextGraph.push(
        yield* Schema.decodeUnknownEffect(EncodedResourceSchema)(encoded).pipe(
          mapParseError({
            code: 'replica-projected-resource-invalid',
            prefix: 'Invalid selected service resource',
          }),
        ),
      );
    }

    return nextGraph;
  },
);
