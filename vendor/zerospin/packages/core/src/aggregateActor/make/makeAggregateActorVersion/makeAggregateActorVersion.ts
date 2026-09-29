import { Schema, SchemaAST, type Effect } from 'effect';

import { assertSameCoreInstance } from '../../../assertSameCoreInstance.ts';
import { AutomationSchema } from '../../../automation/makeAutomation.ts';
import type {
  IActorCommandGuards,
  IAnyAutomation,
} from '../../../automation/types.ts';
import type { AssertContractMutationsInModels } from '../../../contracts/assertMutationsUseModels.ts';
import { Contract } from '../../../contracts/make/makeContractVersion.ts';
import '@zerospin/server-only';

import {
  OwnerGuardsSchema,
  type IAnyOwnerGuard,
} from '../../../contracts/ownerGuards.ts';
import type { IAnyContracts, IContract } from '../../../contracts/types.ts';
import { AuthenticationPolicySchema } from '../../../identity/AuthenticationPolicySchema.ts';
import type { IAggregateAuthentication } from '../../../identity/types.ts';
import {
  ActorDbSchema,
  ActorQuery,
  captureActorSelections,
  type IActorQueries,
  type IActorSelections,
  type IAnyActorDbVersion,
  type ValidActorQueries,
} from '../../../models/make/makeActorDbVersion.ts';
import type { IAnyModels } from '../../../models/types.ts';
import type {
  IAggregateActorAuthorization,
  IAnyAggregateActorVersion,
} from '../../types.ts';

import { assertClaimsRequirements } from './assertClaimsRequirements/assertClaimsRequirements.ts';

class AggregateActorVersion {
  readonly kind = 'aggregate';
}
export const AggregateActorVersionSchema = Schema.declare(
  (input: unknown): input is IAnyAggregateActorVersion =>
    input instanceof AggregateActorVersion,
);
const FunctionSchema = Schema.declare(
  (input: unknown): input is (...args: never[]) => unknown =>
    typeof input === 'function',
);
const DeclarationSchema = Schema.Struct({
  automations: Schema.optionalKey(
    Schema.Record(Schema.String, AutomationSchema),
  ),
  guards: Schema.optionalKey(OwnerGuardsSchema),
  version: Schema.String.check(
    Schema.isPattern(
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[\w.-]+)?(?:\+[\w.-]+)?$/,
    ),
  ),
  db: ActorDbSchema,
  identity: Schema.declare(
    (input: unknown): input is IAnyAggregateActorVersion['identity'] =>
      typeof input === 'object' &&
      input !== null &&
      'claimsSchema' in input &&
      'identitySchema' in input &&
      'sql' in input,
  ),
  authentication: AuthenticationPolicySchema,
  queries: Schema.Record(
    Schema.String,
    Schema.declare(
      (input: unknown): input is ActorQuery => input instanceof ActorQuery,
    ),
  ),
  contracts: Schema.Record(
    Schema.String,
    Schema.declare(
      (input: unknown): input is IContract => input instanceof Contract,
    ),
  ),
  authorize: Schema.optionalKey(FunctionSchema),
});

export type ValidActorContracts<
  CONTRACTS extends IAnyContracts,
  MODELS extends IAnyModels,
  CLAIMS,
> = {
  [K in keyof CONTRACTS]: K extends CONTRACTS[K]['commandName']
    ? ([CONTRACTS[K]['models'][keyof CONTRACTS[K]['models']]] extends [
        MODELS[keyof MODELS],
      ]
        ? unknown
        : never) &
        AssertContractMutationsInModels<CONTRACTS[K], MODELS> &
        (CLAIMS extends NonNullable<CONTRACTS[K]['claims']>['Type']
          ? unknown
          : never)
    : never;
};

export type ActorGuardRequirements<
  GUARDS extends Readonly<Record<string, IAnyOwnerGuard | undefined>>,
> = Effect.Services<ReturnType<NonNullable<GUARDS[keyof GUARDS]>>>;

export type IAggregateActorDeclaration<
  VERSION extends string,
  DB extends IAnyActorDbVersion,
  IDENTITY extends IAnyAggregateActorVersion['identity'],
  QUERIES extends IActorQueries,
  CONTRACTS extends IAnyContracts,
  AUTHORIZE_REQUIREMENTS,
  AUTOMATIONS extends Readonly<Record<string, IAnyAutomation>>,
  GUARDS extends Readonly<Record<string, IAnyOwnerGuard | undefined>>,
  CREDENTIALS extends Schema.Codec<unknown, unknown> = Schema.Codec<
    unknown,
    unknown
  >,
> = {
  version: VERSION;
  authentication: IAggregateAuthentication<
    CREDENTIALS,
    IDENTITY['claimsSchema']
  >;
  db: DB;
  identity: IDENTITY &
    (IDENTITY['claimsSchema']['Type'] extends {
      readonly aggregateId: string;
    }
      ? unknown
      : never);
  queries: QUERIES & ValidActorQueries<DB['models'], QUERIES>;
  contracts: CONTRACTS &
    ValidActorContracts<
      CONTRACTS,
      DB['models'],
      IDENTITY['claimsSchema']['Type']
    >;
  authorize?: IAggregateActorAuthorization<
    IDENTITY['claimsSchema']['Type'],
    AUTHORIZE_REQUIREMENTS
  >;
} & ({} extends AUTOMATIONS
  ? { automations?: AUTOMATIONS }
  : { automations: AUTOMATIONS }) & {
    guards?: IActorCommandGuards<
      NoInfer<CONTRACTS>,
      NoInfer<AUTOMATIONS>,
      DB['models'],
      IDENTITY['claimsSchema']['Type'],
      IDENTITY['identitySchema']['Type'],
      'actor',
      unknown
    >;
  } & ({} extends GUARDS ? { guards?: GUARDS } : { guards: GUARDS });

export type IAggregateActorVersion<
  NAME extends string,
  VERSION extends string,
  DB extends IAnyActorDbVersion,
  IDENTITY extends IAnyAggregateActorVersion['identity'],
  QUERIES extends IActorQueries,
  CONTRACTS extends IAnyContracts,
  AUTHORIZE_REQUIREMENTS,
  GUARD_REQUIREMENTS,
  AUTOMATIONS extends Readonly<Record<string, IAnyAutomation>>,
  GUARDS extends Readonly<Record<string, IAnyOwnerGuard | undefined>> =
    IActorCommandGuards<
      CONTRACTS,
      AUTOMATIONS,
      DB['models'],
      IDENTITY['claimsSchema']['Type'],
      IDENTITY['identitySchema']['Type'],
      'actor',
      GUARD_REQUIREMENTS
    >,
  AUTHORIZE extends IAnyAggregateActorVersion['authorize'] =
    IAggregateActorAuthorization<
      IDENTITY['claimsSchema']['Type'],
      AUTHORIZE_REQUIREMENTS
    >,
> = {
  readonly kind: 'aggregate';
  readonly name: NAME;
  readonly version: VERSION;
  readonly db: DB;
  readonly identity: IDENTITY;
  readonly authentication: IAggregateAuthentication<
    Schema.Codec<unknown, unknown>,
    IDENTITY['claimsSchema']
  >;
  readonly queries: QUERIES;
  readonly selections: IActorSelections<
    DB['models'],
    QUERIES,
    IDENTITY['identitySchema']['Type']
  >;
  readonly contracts: CONTRACTS;
  readonly automations: AUTOMATIONS;
  readonly guards: GUARDS;
  readonly __contractRequirements?:
    | Effect.Services<ReturnType<CONTRACTS[keyof CONTRACTS]['program']>>
    | GUARD_REQUIREMENTS
    | Effect.Services<ReturnType<AUTOMATIONS[keyof AUTOMATIONS]['program']>>;
  readonly authorize?: AUTHORIZE;
  readonly __authorizeRequirements?: AUTHORIZE_REQUIREMENTS;
};

export function makeAggregateActorVersion<
  const CREDENTIALS extends Schema.Codec<unknown, unknown>,
  const NAME extends string,
  const VERSION extends string,
  const DB extends IAnyActorDbVersion,
  const IDENTITY extends IAnyAggregateActorVersion['identity'],
  const QUERIES extends IActorQueries,
  const CONTRACTS extends IAnyContracts,
  AUTHORIZE_REQUIREMENTS = never,
  const AUTOMATIONS extends Readonly<Record<string, IAnyAutomation>> = {},
  const GUARDS extends Readonly<Record<string, IAnyOwnerGuard | undefined>> =
    {},
>(
  actorDefinition: { name: NAME },
  props: IAggregateActorDeclaration<
    VERSION,
    DB,
    IDENTITY,
    QUERIES,
    CONTRACTS,
    AUTHORIZE_REQUIREMENTS,
    AUTOMATIONS,
    GUARDS,
    CREDENTIALS
  >,
): NoInfer<
  IAggregateActorVersion<
    NAME,
    VERSION,
    DB,
    IDENTITY,
    QUERIES,
    CONTRACTS,
    AUTHORIZE_REQUIREMENTS,
    ActorGuardRequirements<GUARDS>,
    AUTOMATIONS,
    GUARDS
  >
> {
  return constructAggregateActorVersion<
    NAME,
    VERSION,
    DB,
    IDENTITY,
    QUERIES,
    CONTRACTS,
    AUTHORIZE_REQUIREMENTS,
    ActorGuardRequirements<GUARDS>,
    AUTOMATIONS,
    GUARDS
  >(actorDefinition, props);
}

/** Validate the completed declaration and construct from its typed values. */
export function constructAggregateActorVersion<
  const NAME extends string,
  const VERSION extends string,
  const DB extends IAnyActorDbVersion,
  const IDENTITY extends IAnyAggregateActorVersion['identity'],
  const QUERIES extends IActorQueries,
  const CONTRACTS extends IAnyContracts,
  AUTHORIZE_REQUIREMENTS = never,
  GUARD_REQUIREMENTS = never,
  const AUTOMATIONS extends Readonly<Record<string, IAnyAutomation>> = {},
  const GUARDS extends Readonly<Record<string, IAnyOwnerGuard | undefined>> =
    IActorCommandGuards<
      CONTRACTS,
      AUTOMATIONS,
      DB['models'],
      IDENTITY['claimsSchema']['Type'],
      IDENTITY['identitySchema']['Type'],
      'actor',
      GUARD_REQUIREMENTS
    >,
  AUTHORIZE extends IAnyAggregateActorVersion['authorize'] =
    IAggregateActorAuthorization<
      IDENTITY['claimsSchema']['Type'],
      AUTHORIZE_REQUIREMENTS
    >,
>(
  actorDefinition: { name: NAME },
  props: {
    version: VERSION;
    db: DB;
    identity: IDENTITY;
    authentication: IAggregateAuthentication<
      Schema.Codec<unknown, unknown>,
      IDENTITY['claimsSchema']
    >;
    queries: QUERIES;
    contracts: CONTRACTS;
    automations?: AUTOMATIONS;
    guards?: GUARDS;
    authorize?: AUTHORIZE;
  },
): IAggregateActorVersion<
  NAME,
  VERSION,
  DB,
  IDENTITY,
  QUERIES,
  CONTRACTS,
  AUTHORIZE_REQUIREMENTS,
  GUARD_REQUIREMENTS,
  AUTOMATIONS,
  GUARDS,
  AUTHORIZE
> {
  for (const contract of Object.values(props.contracts)) {
    assertSameCoreInstance({ value: contract, expected: Contract, kind: 'Contract' });
  }
  const name = Schema.decodeUnknownSync(
    Schema.Struct({ name: Schema.String }),
    { onExcessProperty: 'error' },
  )(actorDefinition).name;
  const decoded = Schema.decodeUnknownSync(DeclarationSchema, {
    onExcessProperty: 'error',
  })(props);
  for (const [key, automation] of Object.entries(decoded.automations ?? {})) {
    if (key !== automation.name) {
      throw new Error(`Automation key ${key} must match ${automation.name}`);
    }
    for (const contract of [
      automation.on,
      ...Object.values(automation.contracts),
    ]) {
      for (const model of Object.values(contract.models)) {
        if (!Object.values(decoded.db.models).includes(model)) {
          throw new Error(
            `Automation ${key} model ${model.modelName} must belong to its actor database`,
          );
        }
      }
    }
    for (const contract of Object.values(automation.contracts)) {
      if (contract.claims !== undefined) {
        assertClaimsRequirements(
          decoded.identity.identitySchema,
          contract.claims,
        );
      }
    }
  }
  for (const key of Object.keys(decoded.guards ?? {})) {
    if (
      !(key in decoded.contracts) &&
      !Object.values(decoded.automations ?? {}).some(
        automation => key in automation.contracts,
      )
    ) {
      throw new Error(`Unknown actor guard command ${key}`);
    }
  }
  const identity = decoded.identity;
  const field = identity.claimsSchema.fields.aggregateId;
  const ast = field === undefined ? undefined : SchemaAST.toType(field.ast);
  if (
    ast === undefined ||
    ast.context?.isOptional ||
    !(
      ast._tag === 'String' ||
      (ast._tag === 'Literal' && typeof ast.literal === 'string')
    )
  ) {
    throw new Error(
      'Actor claimsSchema must contain a required string aggregateId',
    );
  }
  for (const [key, contract] of Object.entries(decoded.contracts)) {
    if (key !== contract.commandName) {
      throw new Error(
        `Actor contract key ${key} must match ${contract.commandName}`,
      );
    }
    if (contract.claims !== undefined) {
      assertClaimsRequirements(identity.claimsSchema, contract.claims);
    }
    for (const model of Object.values(contract.models)) {
      if (!Object.values(decoded.db.models).includes(model)) {
        throw new Error(
          `Actor ${name} contract ${key} model ${model.modelName}@${model.version} must belong to its database`,
        );
      }
    }
  }
  return Object.assign(new AggregateActorVersion(), {
    name: actorDefinition.name,
    version: props.version,
    db: props.db,
    identity: props.identity,
    authentication: props.authentication,
    queries: Object.freeze({ ...props.queries }),
    selections: Object.freeze(
      captureActorSelections(
        props.db,
        props.queries,
        props.identity.identitySchema,
      ),
    ),
    contracts: Object.freeze({ ...props.contracts }),
    automations: Object.freeze(Object.assign({}, props.automations)),
    guards: Object.freeze(Object.assign({}, props.guards)),
    ...(props.authorize === undefined ? {} : { authorize: props.authorize }),
  });
}
