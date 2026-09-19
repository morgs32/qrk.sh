import type { IServiceFrontendController } from '@zerospin/core/frontendController/types';
import { assertValidModels } from '@zerospin/core/models/assertValidModels';
import { Model } from '@zerospin/core/models/defineModel';
import type {
  IAnyModels,
  IAssertValidModels,
  IModel,
  IModelReplica,
} from '@zerospin/core/models/types';
import { type ITypeError } from '@zerospin/schema';
import { Schema } from 'effect';

const CanonicalModelSchema = Schema.declare(
  (input: unknown): input is IModel => input instanceof Model,
);

const ModelsRecordSchema = Schema.Record(Schema.String, CanonicalModelSchema);

const ClaimsSchema = Schema.declare(
  (
    input: unknown,
  ): input is Schema.Struct<
    Readonly<Record<string, Schema.Codec<unknown, unknown>>>
  > =>
    Schema.isSchema(input) && 'fields' in input && input.ast._tag === 'Objects',
);

const ServiceFrontendPropsSchema = Schema.Struct({
  authenticationSchema: ClaimsSchema,
  serviceName: Schema.String,
  serviceVersion: Schema.String.check(Schema.isMinLength(1)),
  name: Schema.String,
  models: ModelsRecordSchema.check(
    Schema.makeFilter((models: Record<string, IModel>) => {
      for (const [modelKey, model] of Object.entries(models)) {
        if (Model.isReplica(model)) {
          return `service models.${modelKey} must be authoritative, not a replica`;
        }
      }
      return true;
    }),
  ),
});

/**
 * Authored service frontend definition. No app, Provider, or runtime.
 */
export function makeServiceFrontend<
  const SERVICE_NAME extends string,
  const SERVICE_VERSION extends string,
  const FRONTEND_NAME extends string,
  const MODELS extends IAnyModels,
  const AUTHENTICATION extends Schema.Struct<
    Readonly<Record<string, Schema.Codec<unknown, unknown>>>
  >,
>(props: {
  serviceName: SERVICE_NAME;
  serviceVersion: SERVICE_VERSION;
  name: FRONTEND_NAME;
  authenticationSchema: AUTHENTICATION;
  models: MODELS &
    IAssertValidModels<NoInfer<MODELS>> & {
      [K in keyof MODELS]: MODELS[K] extends IModelReplica
        ? ITypeError<`Service frontend model "${MODELS[K]['modelName']}" must be authoritative, not a replica`>
        : MODELS[K];
    };
}) {
  Schema.decodeUnknownSync(ServiceFrontendPropsSchema, {
    onExcessProperty: 'error',
  })(props);
  const models: Readonly<MODELS> = { ...props.models };
  const modelNames: readonly string[] = Object.keys(models);
  assertValidModels({ models, context: 'makeServiceFrontend' });
  return {
    kind: 'service' as const,
    authentication: { authenticationSchema: props.authenticationSchema },
    serviceName: props.serviceName,
    serviceVersion: props.serviceVersion,
    name: props.name,
    contracts: {},
    models,
    modelNames,
  } satisfies Omit<
    IServiceFrontendController<
      string,
      SERVICE_NAME,
      FRONTEND_NAME,
      MODELS,
      SERVICE_VERSION,
      AUTHENTICATION
    >,
    'systemName'
  >;
}
