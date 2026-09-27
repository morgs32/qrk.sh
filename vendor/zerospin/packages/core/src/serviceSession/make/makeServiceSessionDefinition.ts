import { type ITypeError } from '@zerospin/schema';
import { Schema } from 'effect';

import { assertValidModels } from '../../models/assertValidModels.ts';
import { Model } from '../../models/defineModel.ts';
import type {
  IAnyModels,
  IAssertValidModels,
  IModel,
  IModelReplica,
} from '../../models/types.ts';
import type { IServiceSessionDefinition } from '../types.ts';

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

export const ServiceSessionPropsSchema = Schema.Struct({
  actorName: Schema.String,
  actorVersion: Schema.String,
  identitySchema: ClaimsSchema,
  serviceName: Schema.String,
  serviceVersion: Schema.String.check(Schema.isMinLength(1)),
  sessionName: Schema.String,
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
 * Authored service session definition. No app, Provider, or runtime.
 * `systemName` is attached by the session or by the caller that already
 * knows the system.
 */
export function makeServiceSessionDefinition<
  const SERVICE_NAME extends string,
  const ACTOR_NAME extends string,
  const ACTOR_VERSION extends string,
  const SERVICE_VERSION extends string,
  const DEFINITION_NAME extends string,
  const MODELS extends IAnyModels,
  const IDENTITY extends Schema.Struct<
    Readonly<Record<string, Schema.Codec<unknown, unknown>>>
  >,
>(props: {
  actorName: ACTOR_NAME;
  actorVersion: ACTOR_VERSION;
  serviceName: SERVICE_NAME;
  serviceVersion: SERVICE_VERSION;
  sessionName: DEFINITION_NAME;
  identitySchema: IDENTITY;
  models: MODELS &
    IAssertValidModels<NoInfer<MODELS>> & {
      [K in keyof MODELS]: MODELS[K] extends IModelReplica
        ? ITypeError<`Service definition model "${MODELS[K]['modelName']}" must be authoritative, not a replica`>
        : MODELS[K];
    };
}) {
  Schema.decodeUnknownSync(ServiceSessionPropsSchema, {
    onExcessProperty: 'error',
  })(props);
  const models: Readonly<MODELS> = { ...props.models };
  const modelNames: readonly string[] = Object.keys(models);
  assertValidModels({ models, context: 'makeServiceSessionDefinition' });
  return {
    kind: 'service' as const,
    actorName: props.actorName,
    actorVersion: props.actorVersion,
    identity: { identitySchema: props.identitySchema },
    serviceName: props.serviceName,
    serviceVersion: props.serviceVersion,
    sessionName: props.sessionName,
    contracts: {},
    models,
    modelNames,
  } satisfies Omit<
    IServiceSessionDefinition<
      string,
      SERVICE_NAME,
      DEFINITION_NAME,
      MODELS,
      SERVICE_VERSION,
      IDENTITY
    >,
    'systemName'
  >;
}
