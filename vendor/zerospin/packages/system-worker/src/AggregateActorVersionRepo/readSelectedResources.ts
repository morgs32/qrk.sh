import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import { getGraph } from '@zerospin/core/models/getGraph';
import type { IEncodedResourceShape } from '@zerospin/core/models/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError } from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

/** Read and encode the selected resources from the current resource tables. */
export const readSelectedResources = Effect.fn('readSelectedResources')(
  function* ({
    db,
    models,
    selections,
    identity,
  }: Parameters<typeof getGraph>[0]) {
    const selected = getGraph({
      db,
      models,
      selections,
      identity,
    });
    const nextGraph: IEncodedResourceShape[] = [];
    for (const resource of Object.values(selected)) {
      const model = yield* getByKeyOrThrow({
        record: models,
        key: resource.modelName,
        recordKind: 'aggregate models',
      });
      const decoded = yield* Schema.decodeUnknownEffect(
        makeEffectSchema(model.propertiesShape),
      )(resource).pipe(
        Effect.flatMap(row =>
          Schema.decodeUnknownEffect(Schema.toType(model.resourceSchema))(row),
        ),
        mapParseError({
          code: 'replica-projected-resource-invalid',
          prefix: 'Invalid selected aggregate resource',
        }),
      );
      const encoded = yield* Schema.encodeEffect(model.resourceSchema)(
        decoded,
      ).pipe(
        mapParseError({
          code: 'replica-projected-resource-invalid',
          prefix: 'Invalid selected aggregate resource',
        }),
      );
      nextGraph.push(
        yield* Schema.decodeUnknownEffect(EncodedResourceSchema)(encoded).pipe(
          mapParseError({
            code: 'replica-projected-resource-invalid',
            prefix: 'Invalid selected aggregate resource',
          }),
        ),
      );
    }

    return nextGraph;
  },
);
