import { encodeResource } from '@zerospin/core/models/encodeResource';
import { requireVersion as requireModelVersion } from '@zerospin/core/models/requireVersion';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import {
  makeZerospinError,
  mapParseError,
  type IAnyError,
} from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/schema';
import config from 'config';
import { Effect, Schema } from 'effect';

const { system } = config;

/** Decode and encode a service resource using the admitted model version. */
export const encodeServiceSessionResource = Effect.fn(
  'ServiceSessionApi.encodeServiceSessionResource',
)(function* (props: {
  serviceName: string;
  serviceVersion: string;
  sessionName: string;
  modelName: string;
  modelVersion: string;
  resource: unknown;
}): Effect.fn.Return<
  Readonly<{ modelName: string; resource: unknown }>,
  IAnyError
> {
  const {
    sessionName,
    modelName,
    modelVersion,
    resource,
    serviceName,
    serviceVersion,
  } = props;
  const service = yield* getByKeyOrThrow({
    record: system.services[serviceName] ?? {},
    key: serviceVersion,
    recordKind: 'services',
  });
  const modelEntry = Object.entries(service.models).find(
    ([, candidate]) => candidate.modelName === modelName,
  );
  if (modelEntry === undefined || modelEntry[1].version !== modelVersion) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'session-model-definition-missing',
        message: `Selected definition requires unknown model ${modelName}@${modelVersion}`,
        extra: {
          sessionName,
          modelName,
          modelVersion,
          serviceName,
          serviceVersion,
        },
      }),
    );
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
      code: 'session-resource-current-invalid',
      prefix: `Failed to decode current definition resource ${modelName}@${model.version}`,
      extra: {
        sessionName,
        modelName,
        modelVersion,
        serviceName,
        serviceVersion,
      },
    }),
  );

  // 6 — preserve modelName, require modelVersion, and encode the resource
  return {
    modelName: model.modelName,
    resource: yield* encodeResource(
      yield* requireModelVersion(model, modelVersion),
      currentResource,
    ),
  };
});
