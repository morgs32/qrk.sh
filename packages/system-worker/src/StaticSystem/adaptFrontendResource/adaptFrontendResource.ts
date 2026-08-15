import { makeEffectSchema } from '@zerospin/core/models/primitiveMaps';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';
import { system } from 'system';

export const adaptFrontendResource = Effect.fn(
  'StaticSystem.adaptFrontendResource',
)(function* (props: {
  owner:
    | { kind: 'aggregate'; aggregateName: string }
    | { kind: 'service'; serviceName: string };
  frontendName: string;
  modelName: string;
  modelVersion: string;
  resource: unknown;
}): Effect.fn.Return<
  Readonly<{ modelName: string; resource: unknown }>,
  IAnyError
> {
  if (props.owner.kind === 'aggregate') {
    const aggregate = yield* getByKeyOrThrow({
      record: system.aggregates,
      key: props.owner.aggregateName,
      recordKind: 'aggregates',
    });
    const controller = (yield* getByKeyOrThrow({
      record: aggregate.frontends,
      key: props.frontendName,
      recordKind: `frontends owned by aggregate ${props.owner.aggregateName}`,
    })).controller;
    const modelEntry = Object.entries(controller.models).find(
      ([, candidate]) => candidate.modelName === props.modelName,
    );
    if (
      modelEntry === undefined ||
      (modelEntry[1].version !== props.modelVersion &&
        !modelEntry[1].historicalDefinitions.some(
          definition => definition.version === props.modelVersion,
        ))
    ) {
      return yield* new ZerospinError({
        code: 'frontend-model-definition-missing',
        message: `Selected frontend requires unknown model ${props.modelName}@${props.modelVersion}`,
        extra: {
          frontendName: props.frontendName,
          modelName: props.modelName,
          modelVersion: props.modelVersion,
          owner: props.owner,
        },
      });
    }
    const model = modelEntry[1];
    const currentResource = yield* Schema.decodeUnknown(
      makeEffectSchema(model.propertiesShape),
    )(props.resource, { onExcessProperty: 'error' }).pipe(
      Effect.flatMap(resource =>
        Schema.validate(model.resourceSchema)(resource, {
          onExcessProperty: 'error',
        }),
      ),
      mapParseError({
        code: 'frontend-resource-current-invalid',
        prefix: `Failed to decode current frontend resource ${props.modelName}@${model.version}`,
        extra: {
          frontendName: props.frontendName,
          modelName: props.modelName,
          modelVersion: props.modelVersion,
          owner: props.owner,
        },
      }),
    );
    return {
      modelName: model.modelName,
      resource: yield* model.adaptResource({
        version: props.modelVersion,
        resource: currentResource,
      }),
    };
  }

  const service = yield* getByKeyOrThrow({
    record: system.services,
    key: props.owner.serviceName,
    recordKind: 'services',
  });
  const controller = (yield* getByKeyOrThrow({
    record: service.frontends,
    key: props.frontendName,
    recordKind: `frontends owned by service ${props.owner.serviceName}`,
  })).controller;
  const modelEntry = Object.entries(controller.models).find(
    ([, candidate]) => candidate.modelName === props.modelName,
  );
  if (
    modelEntry === undefined ||
    (modelEntry[1].version !== props.modelVersion &&
      !modelEntry[1].historicalDefinitions.some(
        definition => definition.version === props.modelVersion,
      ))
  ) {
    return yield* new ZerospinError({
      code: 'frontend-model-definition-missing',
      message: `Selected frontend requires unknown model ${props.modelName}@${props.modelVersion}`,
      extra: {
        frontendName: props.frontendName,
        modelName: props.modelName,
        modelVersion: props.modelVersion,
        owner: props.owner,
      },
    });
  }
  const model = modelEntry[1];
  const currentResource = yield* Schema.decodeUnknown(
    makeEffectSchema(model.propertiesShape),
  )(props.resource, { onExcessProperty: 'error' }).pipe(
    Effect.flatMap(resource =>
      Schema.validate(model.resourceSchema)(resource, {
        onExcessProperty: 'error',
      }),
    ),
    mapParseError({
      code: 'frontend-resource-current-invalid',
      prefix: `Failed to decode current frontend resource ${props.modelName}@${model.version}`,
      extra: {
        frontendName: props.frontendName,
        modelName: props.modelName,
        modelVersion: props.modelVersion,
        owner: props.owner,
      },
    }),
  );
  return {
    modelName: model.modelName,
    resource: yield* model.adaptResource({
      version: props.modelVersion,
      resource: currentResource,
    }),
  };
});
