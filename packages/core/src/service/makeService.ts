import type { RoutePattern } from '@remix-run/route-pattern';
import type { IAnyError } from '@zerospin/error';
import type { ITypeError } from '@zerospin/schema';
import { Layer, Schema, type Effect } from 'effect';
import { mapValues } from 'es-toolkit';
import '@zerospin/server-only';

import { AuthenticationSchema } from '../authentication/AuthenticationSchema.ts';
import type { IServiceAuthentication } from '../authentication/types.ts';
import { Contract } from '../contracts/makeContractVersion.ts';
import type { IAnyContracts } from '../contracts/types.ts';
import type { IServiceAuthorization } from '../frontendBinding/types.ts';
import { assertValidModels } from '../models/assertValidModels.ts';
import { Model } from '../models/defineModel.ts';
import type {
  IAnyModels,
  IAssertValidModels,
  IModel,
  IModelReplica,
} from '../models/types.ts';

import type {
  IAnyService,
  IResolvedServiceQuery,
  IService,
  IServiceQuery,
} from './types.ts';

const FunctionSchema = Schema.declare(
  (input: unknown): input is (...args: never[]) => unknown =>
    typeof input === 'function',
);

const EffectSchemaSchema = Schema.declare(
  (input: unknown): input is Schema.Codec<unknown, unknown> =>
    Schema.isSchema(input),
);

const CanonicalModelSchema = Schema.declare(
  (input: unknown): input is IModel => input instanceof Model,
);

const CanonicalContractSchema = Schema.declare(
  (input: unknown): input is IAnyContracts[string] => input instanceof Contract,
);

const serviceSemVerPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const AuthenticationDeclarationSchema = AuthenticationSchema.mapFields(
  fields => ({ ...fields, authenticate: FunctionSchema }),
  { unsafePreserveChecks: true },
);

const ServicePropsSchema = Schema.Struct({
  signatureSchema: AuthenticationDeclarationSchema.fields.signatureSchema,
  authenticationSchema:
    AuthenticationDeclarationSchema.fields.authenticationSchema,
  selectionSchema: AuthenticationDeclarationSchema.fields.selectionSchema,
  pattern: AuthenticationDeclarationSchema.fields.pattern,
  authenticate: AuthenticationDeclarationSchema.fields.authenticate,
  layer: Schema.optionalKey(
    Schema.declare(
      (input: unknown): input is Layer.Layer<never, IAnyError, unknown> =>
        Layer.isLayer(input),
    ),
  ),
  name: Schema.String,
  version: Schema.String.check(
    Schema.makeFilter((version: string) => {
      const match = serviceSemVerPattern.exec(version);
      if (match === null) {
        return `expected SemVer`;
      }
      const major = Number(match[1]);
      const minor = Number(match[2]);
      const patch = Number(match[3]);
      if (
        !Number.isSafeInteger(major) ||
        !Number.isSafeInteger(minor) ||
        !Number.isSafeInteger(patch)
      ) {
        return `expected SemVer`;
      }
      return true;
    }),
  ),
  models: Schema.Record(Schema.String, CanonicalModelSchema),
  contracts: Schema.Record(Schema.String, CanonicalContractSchema),
  queries: Schema.optionalKey(
    Schema.Record(
      Schema.String,
      Schema.Struct({
        paramsSchema: EffectSchemaSchema,
        query: FunctionSchema,
      }),
    ),
  ),
  authorize: Schema.optionalKey(FunctionSchema),
});

type IResolvedServiceQueries<
  SERVICE_NAME extends string,
  MODELS extends IAnyModels,
  QUERIES extends Record<string, unknown>,
> = {
  [QUERY_NAME in keyof QUERIES &
    string]: QUERIES[QUERY_NAME] extends IServiceQuery<
    MODELS,
    infer PARAMS_SCHEMA,
    infer RESULT
  >
    ? IResolvedServiceQuery<
        SERVICE_NAME,
        QUERY_NAME,
        MODELS,
        PARAMS_SCHEMA,
        RESULT
      >
    : never;
};

class Service {}

export const ServiceSchema = Schema.declare(
  (input: unknown): input is IAnyService => input instanceof Service,
);

export function makeService<
  const NAME extends string,
  const MODELS extends IAnyModels,
  const CONTRACTS extends IAnyContracts,
  const VERSION extends string,
  const QUERIES extends Record<string, IServiceQuery<MODELS>> = {},
  AUTHORIZE extends IServiceAuthorization<MODELS, never> =
    IServiceAuthorization<MODELS, never>,
  LAYER_SERVICES = never,
  LAYER_REQUIREMENTS = never,
  SIGNATURE extends Schema.Codec<unknown, unknown> = Schema.Codec<
    unknown,
    unknown
  >,
  AUTHENTICATION extends Schema.Struct<
    Readonly<Record<string, Schema.Codec<unknown, unknown>>>
  > = Schema.Struct<Readonly<Record<string, Schema.Codec<unknown, unknown>>>>,
  SELECTION extends Schema.Struct<
    Readonly<Record<string, Schema.Codec<unknown, unknown>>>
  > = Schema.Struct<Readonly<Record<string, Schema.Codec<unknown, unknown>>>>,
  const PATTERN extends string = string,
>(props: {
  name: NAME;
  version: VERSION;
  signatureSchema: SIGNATURE;
  authenticationSchema: AUTHENTICATION;
  selectionSchema: SELECTION;
  pattern: RoutePattern<PATTERN> & (string extends PATTERN ? never : unknown);
  authenticate: IServiceAuthentication<
    SIGNATURE,
    AUTHENTICATION,
    SELECTION,
    PATTERN
  >['authenticate'];
  models: MODELS &
    IAssertValidModels<MODELS> & {
      [MODEL_NAME in keyof MODELS]: MODELS[MODEL_NAME] extends IModelReplica
        ? ITypeError<`Service "${NAME}" must register the authoritative source model, not replica "${MODELS[MODEL_NAME]['modelName']}"`>
        : MODELS[MODEL_NAME];
    };
  contracts: CONTRACTS;
  queries?: QUERIES;
  layer?: Layer.Layer<LAYER_SERVICES, IAnyError, LAYER_REQUIREMENTS>;
  authorize?: IServiceAuthorization<MODELS, never, AUTHENTICATION['Type']>;
}): IService<
  NAME,
  MODELS,
  CONTRACTS,
  IResolvedServiceQueries<NAME, MODELS, QUERIES>,
  AUTHORIZE,
  VERSION,
  LAYER_SERVICES,
  LAYER_REQUIREMENTS,
  Effect.Services<ReturnType<NonNullable<CONTRACTS[keyof CONTRACTS]['guard']>>>,
  IServiceAuthentication<SIGNATURE, AUTHENTICATION, SELECTION, PATTERN>
>;

export function makeService(props: unknown): unknown {
  const decoded = Schema.decodeUnknownSync(ServicePropsSchema, {
    onExcessProperty: 'error',
  })(props);
  const authentication = Schema.decodeUnknownSync(
    AuthenticationDeclarationSchema,
    { onExcessProperty: 'error' },
  )({
    signatureSchema: decoded.signatureSchema,
    authenticationSchema: decoded.authenticationSchema,
    selectionSchema: decoded.selectionSchema,
    pattern: decoded.pattern,
    authenticate: decoded.authenticate,
  });
  const {
    name,
    version,
    models,
    contracts,
    queries: queryInputs = {},
    authorize,
  } = decoded;

  assertValidModels({
    models,
    context: `makeService: ${name}`,
  });

  Schema.decodeUnknownSync(
    Schema.Record(Schema.String, CanonicalModelSchema).check(
      Schema.makeFilter((decodedModels: Record<string, IModel>) => {
        for (const [modelKey, model] of Object.entries(decodedModels)) {
          if (Model.isReplica(model)) {
            return {
              path: [modelKey],
              issue: `must be the authoritative source model, not a replica`,
            };
          }
        }
        return true;
      }),
    ),
    { onExcessProperty: 'error' },
  )(models);

  const queries = mapValues(queryInputs, (query, queryKey) => ({
    ...query,
    kind: 'service',
    name: String(queryKey),
    serviceName: name,
  }));

  const fields = {
    layer: decoded.layer ?? Layer.empty,
    authentication,
    name,
    version,
    models,
    contracts,
    queries,
  };
  return Object.assign(
    new Service(),
    authorize === undefined ? fields : { ...fields, authorize },
  ) as IAnyService;
}
