import { Schema, SchemaAST } from 'effect';

import { Contract } from '../contracts/make/makeContractVersion.ts';
import type { IAnyContracts, IContract } from '../contracts/types.ts';
import type { IClaimsSchema } from '../identity/types.ts';
import { assertValidModels } from '../models/assertValidModels.ts';
import { Model } from '../models/defineModel.ts';
import type { IAnyModels, IModel } from '../models/types.ts';
import { ServiceSessionPropsSchema } from '../serviceSession/make/makeServiceSessionDefinition.ts';

const CanonicalModelSchema = Schema.declare(
  (input: unknown): input is IModel => input instanceof Model,
);

const ContractSchema = Schema.declare(
  (input: unknown): input is IContract => input instanceof Contract,
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

const AggregateSessionPropsSchema = Schema.Struct({
  claimsSchema: ClaimsSchema,
  aggregateName: Schema.String,
  aggregateVersion: Schema.String.check(Schema.isMinLength(1)),
  actorName: Schema.String,
  actorVersion: Schema.String,
  sessionName: Schema.String,
  contracts: Schema.Record(Schema.String, ContractSchema),
  models: ModelsRecordSchema,
});

/** Internal validation and definition construction shared by session lifecycles. */
export function makeSessionDefinition(props: {
  kind: 'aggregate' | 'service';
  systemName: string;
  sessionName: string;
  actorName: string;
  actorVersion: string;
  claimsSchema: IClaimsSchema;
  models: IAnyModels;
  aggregateName?: string;
  aggregateVersion?: string;
  serviceName?: string;
  serviceVersion?: string;
  contracts?: IAnyContracts;
}) {
  const {
    claimsSchema,
    sessionName,
    actorName,
    actorVersion,
    models,
    systemName,
  } = props;
  assertValidModels({ models, context: 'makeSession' });
  const common = {
    sessionName,
    actorName,
    actorVersion,
    models,
    claimsSchema,
  };
  if (props.kind === 'aggregate') {
    if (
      props.aggregateName === undefined ||
      props.aggregateVersion === undefined ||
      props.contracts === undefined
    ) {
      throw new Error(
        'Aggregate sessions require aggregateName, aggregateVersion, and contracts',
      );
    }
    const decoded = Schema.decodeUnknownSync(AggregateSessionPropsSchema)(
      {
        ...common,
        aggregateName: props.aggregateName,
        aggregateVersion: props.aggregateVersion,
        contracts: props.contracts,
      },
      { onExcessProperty: 'error' },
    );
    for (const [name, contract] of Object.entries(decoded.contracts)) {
      if (name !== contract.commandName) {
        throw new Error(
          `Contract key ${name} must match ${contract.commandName}`,
        );
      }
      for (const model of Object.values(contract.models)) {
        if (models[model.modelName] !== model) {
          throw new Error(
            `Contract ${name} model ${model.modelName} must belong to session ${sessionName}`,
          );
        }
      }
    }
    const field = claimsSchema.fields.aggregateId;
    const ast = field === undefined ? undefined : SchemaAST.toType(field.ast);
    if (
      ast === undefined ||
      ast.context?.isOptional ||
      (ast._tag !== 'String' &&
        !(ast._tag === 'Literal' && typeof ast.literal === 'string'))
    ) {
      throw new Error(
        'Aggregate session identity must contain a required string aggregateId',
      );
    }
    const { claimsSchema: _, ...definition } = decoded;
    return {
      ...definition,
      kind: 'aggregate' as const,
      systemName,
      claimsSchema,
      contracts: { ...props.contracts },
      models: { ...models },
      modelNames: Object.keys(models),
    };
  }
  if (
    props.kind !== 'service' ||
    props.serviceName === undefined ||
    props.serviceVersion === undefined
  ) {
    throw new Error('Service sessions require serviceName and serviceVersion');
  }
  const decoded = Schema.decodeUnknownSync(ServiceSessionPropsSchema)({
    ...common,
    serviceName: props.serviceName,
    serviceVersion: props.serviceVersion,
  });
  const { claimsSchema: _, ...definition } = decoded;
  return {
    ...definition,
    kind: 'service' as const,
    systemName,
    claimsSchema,
    contracts: {},
    models: { ...models },
    modelNames: Object.keys(models),
  };
}
