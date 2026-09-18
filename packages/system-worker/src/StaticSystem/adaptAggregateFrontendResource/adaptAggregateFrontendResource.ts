import { encodeResource } from '@zerospin/core/models/encodeResource';
import { requireVersion as requireModelVersion } from '@zerospin/core/models/requireVersion';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/schema';
import config from 'config';
import { Effect, Schema } from 'effect';

const { system } = config;

/** Decode and encode an aggregate resource using the admitted model version. */
export const adaptAggregateFrontendResource = Effect.fn(
  'StaticSystem.adaptAggregateFrontendResource',
)(function* (props: {
  aggregateName: string;
  aggregateVersion: string;
  frontendName: string;
  modelName: string;
  modelVersion: string;
  resource: unknown;
}): Effect.fn.Return<
  Readonly<{ modelName: string; resource: unknown }>,
  IAnyError
> {
  const { frontendName, modelName, modelVersion, resource } = props;
  const aggregate = yield* getByKeyOrThrow({
    record: system.aggregates[props.aggregateName] ?? {},
    key: props.aggregateVersion,
    recordKind: 'aggregates',
  });
  const modelEntry = Object.entries(aggregate.models).find(
    ([, candidate]) => candidate.modelName === modelName,
  );
  if (modelEntry === undefined || modelEntry[1].version !== modelVersion) {
    return yield* new ZerospinError({
      code: 'frontend-model-definition-missing',
      message: `Selected frontend requires unknown model ${modelName}@${modelVersion}`,
      extra: {
        frontendName,
        modelName,
        modelVersion,
        aggregateName: props.aggregateName,
        aggregateVersion: props.aggregateVersion,
      },
    });
  }
  const model = modelEntry[1];

  // 2 — validate persisted properties and the current resource schema before adaptation
  const currentResource = yield* Schema.decodeUnknownEffect(
    makeEffectSchema(model.propertiesShape),
  )(resource, { onExcessProperty: 'error' }).pipe(
    Effect.flatMap(resource =>
      Schema.decodeUnknownEffect(Schema.toType(model.resourceSchema))(
        resource,
        {
          onExcessProperty: 'error',
        },
      ),
    ),
    mapParseError({
      code: 'frontend-resource-current-invalid',
      prefix: `Failed to decode current frontend resource ${modelName}@${model.version}`,
      extra: {
        frontendName,
        modelName,
        modelVersion,
        aggregateName: props.aggregateName,
        aggregateVersion: props.aggregateVersion,
      },
    }),
  );

  // 3 — require the selected modelVersion and encode its resource
  return {
    modelName: model.modelName,
    resource: yield* encodeResource(
      yield* requireModelVersion(model, modelVersion),
      currentResource,
    ),
  };
});
