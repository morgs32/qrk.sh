import { Schema } from 'effect';

import { AuthenticationPolicySchema } from '../../identity/AuthenticationPolicySchema.ts';
import type { IServiceAuthentication } from '../../identity/types.ts';
import '@zerospin/server-only';

import {
  ActorDbSchema,
  ActorQuery,
  captureActorSelections,
  type IActorQueries,
  type IActorSelections,
  type IAnyActorDbVersion,
  type ValidActorQueries,
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
  queries: Schema.Record(
    Schema.String,
    Schema.declare(
      (input: unknown): input is ActorQuery => input instanceof ActorQuery,
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
  const QUERIES extends IActorQueries,
  AUTHORIZE_REQUIREMENTS = never,
>(
  actorDefinition: { name: NAME },
  props: {
    version: VERSION;
    db: DB;
    identity: IDENTITY;
    authentication: IServiceAuthentication<
      CREDENTIALS,
      IDENTITY['claimsSchema']
    >;
    queries: QUERIES & ValidActorQueries<DB['models'], QUERIES>;

    authorize?: IServiceActorAuthorization<
      IDENTITY['claimsSchema']['Type'],
      AUTHORIZE_REQUIREMENTS
    >;
  },
): NoInfer<{
  readonly kind: 'service';
  readonly name: NAME;
  readonly version: VERSION;
  readonly db: DB;
  readonly identity: IDENTITY;
  readonly authentication: IServiceAuthentication<
    CREDENTIALS,
    IDENTITY['claimsSchema']
  >;
  readonly queries: QUERIES;
  readonly selections: IActorSelections<
    DB['models'],
    QUERIES,
    IDENTITY['identitySchema']['Type']
  >;
  readonly authorize?: IServiceActorAuthorization<
    IDENTITY['claimsSchema']['Type'],
    AUTHORIZE_REQUIREMENTS
  >;
  readonly __authorizeRequirements?: AUTHORIZE_REQUIREMENTS;
}>;
export function makeServiceActorVersion(
  actorDefinition: { name: string },
  props: unknown,
): unknown {
  const name = Schema.decodeUnknownSync(
    Schema.Struct({ name: Schema.String }),
    { onExcessProperty: 'error' },
  )(actorDefinition).name;
  const decoded = Schema.decodeUnknownSync(DeclarationSchema, {
    onExcessProperty: 'error',
  })(props);
  const identity = decoded.identity;
  return Object.assign(new ServiceActorVersion(), {
    name,
    version: decoded.version,
    db: decoded.db,
    identity,
    authentication: decoded.authentication,
    queries: Object.freeze({ ...decoded.queries }),
    selections: Object.freeze(
      captureActorSelections(
        decoded.db,
        decoded.queries,
        identity.identitySchema,
      ),
    ),
    ...(decoded.authorize === undefined
      ? {}
      : { authorize: decoded.authorize }),
  });
}
