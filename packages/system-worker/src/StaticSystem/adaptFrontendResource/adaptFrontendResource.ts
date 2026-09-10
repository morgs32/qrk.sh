import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { system } from 'system';

/*
 * Frontend snapshot paths encode a projected resource for the model
 * version selected by the admitted lock. The owning controller validates the
 * current row before encoding its exact model version.
 *
 * 1. Resolve aggregate-owned frontend adaptation.
 * 2. Decode the current aggregate frontend resource.
 * 3. Return the aggregate model adaptation.
 * 4. Resolve service-owned frontend adaptation.
 * 5. Decode the current service frontend resource.
 * 6. Return the service model adaptation.
 */
export const adaptFrontendResource = Effect.fn(
  'StaticSystem.adaptFrontendResource',
)(function* (props: {
  owner:
    | { kind: 'aggregate'; aggregateName: string; aggregateVersion: string }
    | { kind: 'service'; serviceName: string; serviceVersion: string };
  frontendName: string;
  modelName: string;
  modelVersion: string;
  resource: unknown;
}): Effect.fn.Return<
  Readonly<{ modelName: string; resource: unknown }>,
  IAnyError
> {
  const { frontendName, modelName, modelVersion, owner, resource } = props;

  // 1 — select the aggregate controller and requested model definition
  if (owner.kind === 'aggregate') {
    const aggregate = yield* getByKeyOrThrow({
      record: system.aggregates[owner.aggregateName] ?? {},
      key: owner.aggregateVersion,
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
          owner,
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
          owner,
        },
      }),
    );

    // 3 — ask model.adaptResource for the selected modelVersion
    return {
      modelName: model.modelName,
      resource: yield* model.adaptResource({
        version: modelVersion,
        resource: currentResource,
      }),
    };
  }

  // 4 — select the service controller and require a supported modelVersion
  const service = yield* getByKeyOrThrow({
    record: system.services[owner.serviceName] ?? {},
    key: owner.serviceVersion,
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
  if (modelEntry === undefined || modelEntry[1].version !== modelVersion) {
    return yield* new ZerospinError({
      code: 'frontend-model-definition-missing',
      message: `Selected frontend requires unknown model ${modelName}@${modelVersion}`,
      extra: {
        frontendName,
        modelName,
        modelVersion,
        owner,
      },
    });
  }
  const model = modelEntry[1];

  // 5 — validate its current properties and resource shape
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
        frontendName,
        modelName,
        modelVersion,
        owner,
      },
    }),
  );

  // 6 — preserve modelName and adapt the resource to modelVersion
  return {
    modelName: model.modelName,
    resource: yield* model.adaptResource({
      version: modelVersion,
      resource: currentResource,
    }),
  };
});
