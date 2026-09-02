import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/schema';
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
  const { frontendName, modelName, modelVersion, owner, resource } = props;
  if (owner.kind === 'aggregate') {
    const aggregate = yield* getByKeyOrThrow({
      record: system.aggregates,
      key: owner.aggregateName,
      recordKind: 'aggregates',
    });
    const controller = (yield* getByKeyOrThrow({
      record: aggregate.frontends,
      key: frontendName,
      recordKind: `frontends owned by aggregate ${owner.aggregateName}`,
    })).controller;
    const modelEntry = Object.entries(controller.models).find(
      ([, candidate]) => candidate.modelName === modelName,
    );
    if (
      modelEntry === undefined ||
      (modelEntry[1].version !== modelVersion &&
        !modelEntry[1].historicalDefinitions.some(
          definition => definition.version === modelVersion,
        ))
    ) {
      return yield* new ZerospinError({
        code: 'frontend-model-definition-missing',
        message: `Selected frontend requires unknown model ${modelName}@${modelVersion}`,
        extra: {
          frontendName: frontendName,
          modelName: modelName,
          modelVersion: modelVersion,
          owner: owner,
        },
      });
    }
    const model = modelEntry[1];
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
          frontendName: frontendName,
          modelName: modelName,
          modelVersion: modelVersion,
          owner: owner,
        },
      }),
    );
    return {
      modelName: model.modelName,
      resource: yield* model.adaptResource({
        version: modelVersion,
        resource: currentResource,
      }),
    };
  }

  const service = yield* getByKeyOrThrow({
    record: system.services,
    key: owner.serviceName,
    recordKind: 'services',
  });
  const controller = (yield* getByKeyOrThrow({
    record: service.frontends,
    key: frontendName,
    recordKind: `frontends owned by service ${owner.serviceName}`,
  })).controller;
  const modelEntry = Object.entries(controller.models).find(
    ([, candidate]) => candidate.modelName === modelName,
  );
  if (
    modelEntry === undefined ||
    (modelEntry[1].version !== modelVersion &&
      !modelEntry[1].historicalDefinitions.some(
        definition => definition.version === modelVersion,
      ))
  ) {
    return yield* new ZerospinError({
      code: 'frontend-model-definition-missing',
      message: `Selected frontend requires unknown model ${modelName}@${modelVersion}`,
      extra: {
        frontendName: frontendName,
        modelName: modelName,
        modelVersion: modelVersion,
        owner: owner,
      },
    });
  }
  const model = modelEntry[1];
  const currentResource = yield* Schema.decodeUnknownEffect(
    makeEffectSchema(model.propertiesShape),
  )(resource, { onExcessProperty: 'error' }).pipe(
    Effect.flatMap(resource =>
      Schema.decodeUnknownEffect(Schema.toType(model.resourceSchema))(
        resource,
        { onExcessProperty: 'error' },
      ),
    ),
    mapParseError({
      code: 'frontend-resource-current-invalid',
      prefix: `Failed to decode current frontend resource ${modelName}@${model.version}`,
      extra: {
        frontendName: frontendName,
        modelName: modelName,
        modelVersion: modelVersion,
        owner: owner,
      },
    }),
  );
  return {
    modelName: model.modelName,
    resource: yield* model.adaptResource({
      version: modelVersion,
      resource: currentResource,
    }),
  };
});
