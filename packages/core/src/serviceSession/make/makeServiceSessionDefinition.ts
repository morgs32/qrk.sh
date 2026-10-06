import { Schema } from 'effect';

import { assertSameCoreInstance } from '../../assertSameCoreInstance.ts';
import { publicContracts } from '../../contracts/externalContract.ts';
import { Contract } from '../../contracts/make/makeContractVersion.ts';
import type { IAnyContracts, IContract } from '../../contracts/types.ts';
import { assertValidModels } from '../../models/assertValidModels.ts';
import { Model } from '../../models/defineModel.ts';
import type {
  IAnyModels,
  IAssertValidModels,
  IModel,
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
  claimsSchema: ClaimsSchema,
  serviceName: Schema.String,
  serviceVersion: Schema.String.check(Schema.isMinLength(1)),
  sessionName: Schema.String,
  contracts: Schema.optionalKey(
    Schema.Record(
      Schema.String,
      Schema.declare(
        (value: unknown): value is IContract => value instanceof Contract,
      ),
    ),
  ),
  models: ModelsRecordSchema,
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
  const CLAIMS extends Schema.Struct<
    Readonly<Record<string, Schema.Codec<unknown, unknown>>>
  >,
  const CONTRACTS extends IAnyContracts = {},
>(props: {
  actorName: ACTOR_NAME;
  actorVersion: ACTOR_VERSION;
  serviceName: SERVICE_NAME;
  serviceVersion: SERVICE_VERSION;
  sessionName: DEFINITION_NAME;
  claimsSchema: CLAIMS;
  contracts?: CONTRACTS;
  models: MODELS &
    IAssertValidModels<NoInfer<MODELS>> & {
      [K in keyof MODELS]: MODELS[K];
    };
}) {
  for (const model of Object.values(props.models)) {
    assertSameCoreInstance({ value: model, expected: Model, kind: 'Model' });
  }
  Schema.decodeUnknownSync(ServiceSessionPropsSchema, {
    onExcessProperty: 'error',
  })(props);
  for (const contract of Object.values(props.contracts ?? {})) {
    for (const [name, model] of Object.entries(contract.models)) {
      if (props.models[name] !== model) {
        throw new Error(`Contract model ${name} must belong to session`);
      }
    }
  }
  const models: Readonly<MODELS> = { ...props.models };
  const modelNames: readonly string[] = Object.keys(models);
  assertValidModels({ models, context: 'makeServiceSessionDefinition' });
  return {
    kind: 'service' as const,
    actorName: props.actorName,
    actorVersion: props.actorVersion,
    claimsSchema: props.claimsSchema,
    serviceName: props.serviceName,
    serviceVersion: props.serviceVersion,
    sessionName: props.sessionName,
    contracts: Object.freeze(publicContracts(props.contracts ?? {})),
    models,
    modelNames,
  } satisfies Omit<
    IServiceSessionDefinition<
      string,
      SERVICE_NAME,
      DEFINITION_NAME,
      MODELS,
      SERVICE_VERSION,
      CLAIMS
    >,
    'systemName'
  >;
}
