import { Schema, SchemaAST } from 'effect';

import { AggregateSessionPropsSchema } from '../aggregateSession/make/makeAggregateSessionDefinition.ts';
import type { IAnyContractBindings } from '../contracts/types.ts';
import type { IIdentitySchema } from '../identity/types.ts';
import { assertValidModels } from '../models/assertValidModels.ts';
import type { IAnyModels } from '../models/types.ts';
import { ServiceSessionPropsSchema } from '../serviceSession/make/makeServiceSessionDefinition.ts';

/** Internal validation and definition construction shared by session lifecycles. */
export function makeSessionDefinition(props: {
  kind: 'aggregate' | 'service';
  systemName: string;
  sessionName: string;
  actorName: string;
  actorVersion: string;
  identitySchema: IIdentitySchema;
  models: IAnyModels;
  aggregateName?: string;
  aggregateVersion?: string;
  serviceName?: string;
  serviceVersion?: string;
  contracts?: IAnyContractBindings;
}) {
  const {
    identitySchema,
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
    identitySchema,
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
    const field = identitySchema.fields.aggregateId;
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
    const { identitySchema: _, ...definition } = decoded;
    return {
      ...definition,
      kind: 'aggregate' as const,
      systemName,
      identity: { identitySchema },
      contracts: Object.fromEntries(
        Object.entries(props.contracts).map(([name, binding]) => [
          name,
          { ...binding },
        ]),
      ),
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
  const { identitySchema: _, ...definition } = decoded;
  return {
    ...definition,
    kind: 'service' as const,
    systemName,
    identity: { identitySchema },
    contracts: {},
    models: { ...models },
    modelNames: Object.keys(models),
  };
}
