import { Schema } from 'effect';

import type { ValidActorContracts } from '../../aggregateActor/make/makeAggregateActorVersion/makeAggregateActorVersion.ts';
import { assertActorExternalContracts } from '../../contracts/externalContract.ts';
import { Contract } from '../../contracts/make/makeContractVersion.ts';
import {
  OwnerGuardsSchema,
  type IOwnerGuards,
} from '../../contracts/ownerGuards.ts';
import type { IAnyContracts, IContract } from '../../contracts/types.ts';
import { AuthenticationPolicySchema } from '../../identity/AuthenticationPolicySchema.ts';
import type { IServiceAuthentication } from '../../identity/types.ts';
import '@zerospin/server-only';

import {
  ActorDbSchema,
  ActorSelection,
  captureActorSelections,
  type IActorSelections,
  type IAnyActorDbVersion,
  type ICapturedActorSelections,
  type ValidActorSelections,
} from '../../models/make/makeActorDbVersion.ts';
import type {
  IAnyServiceActorVersion,
  IServiceActorAuthorization,
} from '../types.ts';
class ServiceActorVersion {
  readonly kind = 'service';
}
export const ServiceActorVersionSchema = Schema.declare(
  (input: unknown): input is IAnyServiceActorVersion =>
    input instanceof ServiceActorVersion,
);
const FunctionSchema = Schema.declare(
  (input: unknown): input is (...args: never[]) => unknown =>
    typeof input === 'function',
);
const DeclarationSchema = Schema.Struct({
  version: Schema.String.check(
    Schema.isPattern(
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[\w.-]+)?(?:\+[\w.-]+)?$/,
    ),
  ),
  db: ActorDbSchema,
  identity: Schema.declare(
    (input: unknown): input is IAnyServiceActorVersion['identity'] =>
      typeof input === 'object' &&
      input !== null &&
      'claimsSchema' in input &&
      'identitySchema' in input &&
      'sql' in input,
  ),
  authentication: AuthenticationPolicySchema,
  contracts: Schema.optionalKey(
    Schema.Record(
      Schema.String,
      Schema.declare(
        (value: unknown): value is IContract => value instanceof Contract,
      ),
    ),
  ),
  guards: Schema.optionalKey(OwnerGuardsSchema),
  selections: Schema.Record(
    Schema.String,
    Schema.declare(
      (input: unknown): input is ActorSelection =>
        input instanceof ActorSelection,
    ),
  ),
  authorize: Schema.optionalKey(FunctionSchema),
});
export function makeServiceActorVersion<
  const CREDENTIALS extends Schema.Codec<unknown, unknown>,
  const NAME extends string,
  const VERSION extends string,
  const DB extends IAnyActorDbVersion,
  const IDENTITY extends IAnyServiceActorVersion['identity'],
  const SELECTIONS extends IActorSelections,
  AUTHORIZE_REQUIREMENTS = never,
  const CONTRACTS extends IAnyContracts = {},
>(
  actorDefinition: {
    name: NAME;
  },
  props: {
    version: VERSION;
    db: DB;
    identity: IDENTITY;
    authentication: IServiceAuthentication<
      CREDENTIALS,
      IDENTITY['claimsSchema']
    >;
    contracts?: CONTRACTS &
      ValidActorContracts<
        CONTRACTS,
        DB['models'],
        IDENTITY['claimsSchema']['Type']
      >;
    guards?: IOwnerGuards<
      CONTRACTS,
      DB['models'],
      IDENTITY['claimsSchema']['Type'],
      'actor',
      AUTHORIZE_REQUIREMENTS
    >;
    selections: SELECTIONS & ValidActorSelections<DB['models'], SELECTIONS>;
    authorize?: IServiceActorAuthorization<
      IDENTITY['claimsSchema']['Type'],
      AUTHORIZE_REQUIREMENTS
    >;
  },
): NoInfer<{
  readonly kind: 'service';
  readonly contracts: CONTRACTS;
  readonly guards: IOwnerGuards<
    CONTRACTS,
    DB['models'],
    IDENTITY['claimsSchema']['Type'],
    'actor',
    AUTHORIZE_REQUIREMENTS
  >;
  readonly name: NAME;
  readonly version: VERSION;
  readonly db: DB;
  readonly identity: IDENTITY;
  readonly authentication: IServiceAuthentication<
    CREDENTIALS,
    IDENTITY['claimsSchema']
  >;
  readonly selections: SELECTIONS;
  readonly capturedSelections: ICapturedActorSelections<
    DB['models'],
    SELECTIONS,
    IDENTITY['identitySchema']['Type']
  >;
  readonly authorize?: IServiceActorAuthorization<
    IDENTITY['claimsSchema']['Type'],
    AUTHORIZE_REQUIREMENTS
  >;
  readonly __authorizeRequirements?: AUTHORIZE_REQUIREMENTS;
}>;
export function makeServiceActorVersion(
  actorDefinition: {
    name: string;
  },
  props: unknown,
): unknown {
  const name = Schema.decodeUnknownSync(
    Schema.Struct({ name: Schema.String }),
    { onExcessProperty: 'error' },
  )(actorDefinition).name;
  const decoded = Schema.decodeUnknownSync(DeclarationSchema, {
    onExcessProperty: 'error',
  })(props);
  assertActorExternalContracts(decoded.contracts ?? {});
  for (const contract of Object.values(decoded.contracts ?? {})) {
    for (const model of [
      ...Object.values(contract.models),
      ...Object.values(contract.mapping?.models ?? {}),
    ]) {
      if (!Object.values(decoded.db.models).includes(model)) {
        throw new Error(
          `Service actor ${name} contract ${contract.commandName} model must belong to its database`,
        );
      }
    }
  }
  const identity = decoded.identity;
  return Object.assign(new ServiceActorVersion(), {
    name,
    version: decoded.version,
    db: decoded.db,
    identity,
    authentication: decoded.authentication,
    contracts: Object.freeze({ ...decoded.contracts }),
    guards: Object.freeze({ ...decoded.guards }),
    selections: Object.freeze({ ...decoded.selections }),
    capturedSelections: Object.freeze(
      captureActorSelections(
        decoded.db,
        decoded.selections,
        identity.identitySchema,
      ),
    ),
    ...(decoded.authorize === undefined
      ? {}
      : { authorize: decoded.authorize }),
  });
}
