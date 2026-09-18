import { RoutePattern } from '@remix-run/route-pattern';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import type { ITypeError } from '@zerospin/schema';
import '@zerospin/server-only';
import { Effect, Layer, Record, Schema, SchemaAST } from 'effect';

import { AuthenticationSchema } from '../authentication/AuthenticationSchema.ts';
import type { IAggregateAuthentication } from '../authentication/types.ts';
import type { AssertContractMutationsInModels } from '../contracts/assertMutationsUseModels.ts';
import { Contract } from '../contracts/makeContractVersion.ts';
import type {
  IAnyContractBindings,
  IContract,
  IContractBinding,
} from '../contracts/types.ts';
import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import { assertValidModels } from '../models/assertValidModels.ts';
import { Model } from '../models/defineModel.ts';
import type {
  IAnyModels,
  IAssertValidModels,
  IModel,
  InferCommandPayload,
} from '../models/types.ts';
import { ServiceSchema } from '../service/makeService.ts';
import type { IAnyService } from '../service/types.ts';

import type {
  IAggregateAuthorization,
  IAnyAuthoredAggregate,
  IAuthoredAggregate,
} from './types.ts';

const FunctionSchema = Schema.declare(
  (input: unknown): input is (...args: never[]) => unknown =>
    typeof input === 'function',
);

const CanonicalModelSchema = Schema.declare(
  (input: unknown): input is IModel => input instanceof Model,
);

const CanonicalContractSchema = Schema.declare(
  (input: unknown): input is IContract => input instanceof Contract,
);

const ContractBindingSchema = Schema.Struct({
  contract: CanonicalContractSchema,
  guard: Schema.optionalKey(
    Schema.declare(
      (value): value is NonNullable<IContractBinding['guard']> =>
        typeof value === 'function',
    ),
  ),
});

const AggregateIdClaimSchema = Schema.Struct({
  aggregateId: Schema.String,
});

const defaultAggregateAuthentication = {
  signatureSchema: AggregateIdClaimSchema,
  authenticationSchema: AggregateIdClaimSchema,
  selectionSchema: AggregateIdClaimSchema,
  pattern: RoutePattern.parse('/:aggregateId'),
  authenticate: ({
    signature,
  }: {
    signature: typeof AggregateIdClaimSchema.Type;
  }) => Effect.succeed({ aggregateId: signature.aggregateId }),
};

const AuthenticationDeclarationSchema = AuthenticationSchema.mapFields(
  fields => ({ ...fields, authenticate: FunctionSchema }),
  { unsafePreserveChecks: true },
);

const AggregatePropsSchema = Schema.Struct({
  signatureSchema: Schema.optionalKey(
    AuthenticationDeclarationSchema.fields.signatureSchema,
  ),
  authenticationSchema: Schema.optionalKey(
    AuthenticationDeclarationSchema.fields.authenticationSchema,
  ),
  selectionSchema: Schema.optionalKey(
    AuthenticationDeclarationSchema.fields.selectionSchema,
  ),
  pattern: Schema.optionalKey(AuthenticationDeclarationSchema.fields.pattern),
  authenticate: Schema.optionalKey(
    AuthenticationDeclarationSchema.fields.authenticate,
  ),
  guardLayer: Schema.optionalKey(FunctionSchema),
  version: Schema.String.check(
    Schema.makeFilter((version: string) => {
      const match =
        /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(
          version,
        );
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
  services: Schema.optionalKey(Schema.Record(Schema.String, ServiceSchema)),
  contracts: Schema.Record(Schema.String, ContractBindingSchema),
  selections: Schema.Record(
    Schema.String,
    Schema.Struct({
      model: CanonicalModelSchema,
      where: FunctionSchema,
    }),
  ),
  authorize: Schema.optionalKey(FunctionSchema),
}).check(
  Schema.makeFilter(props => {
    const present = [
      'signatureSchema',
      'authenticationSchema',
      'selectionSchema',
      'pattern',
      'authenticate',
    ].filter(field => Object.hasOwn(props, field));
    if (present.length === 0 || present.length === 5) {
      return true;
    }
    return 'Custom authentication requires signatureSchema, authenticationSchema, selectionSchema, pattern, and authenticate';
  }),
);

const authoredInputs = new WeakMap<
  IAnyAuthoredAggregate,
  Omit<
    typeof AggregatePropsSchema.Type,
    | 'signatureSchema'
    | 'authenticationSchema'
    | 'selectionSchema'
    | 'pattern'
    | 'authenticate'
  > &
    Readonly<{
      name: string;
      layer: Layer.Layer<never, IAnyError, unknown>;
      authentication: typeof AuthenticationDeclarationSchema.Type;
    }>
>();

class Aggregate {}

export const AggregateSchema = Schema.declare(
  (input: unknown): input is IAnyAuthoredAggregate =>
    input instanceof Aggregate,
);

export function makeAggregateVersion<
  const NAME extends string,
  const MODELS extends IAnyModels,
  const CONTRACTS extends IAnyContractBindings,
  const SELECTIONS extends IAnyAuthoredAggregate['selections'] = {},
  AUTHORIZE extends IAggregateAuthorization<MODELS> =
    IAggregateAuthorization<MODELS>,
  const VERSION extends string = string,
  LAYER_SERVICES = never,
  LAYER_REQUIREMENTS = never,
  SIGNATURE extends Schema.Codec<unknown, unknown> =
    typeof AggregateIdClaimSchema,
  AUTHENTICATION extends Schema.Struct<
    Readonly<Record<string, Schema.Codec<unknown, unknown>>>
  > = typeof AggregateIdClaimSchema,
  SELECTION extends Schema.Struct<
    Readonly<Record<string, Schema.Codec<unknown, unknown>>>
  > = typeof AggregateIdClaimSchema,
  const PATTERN extends string = '/:aggregateId',
  GUARD_SERVICES = never,
  GUARD_REQUIREMENTS = never,
>(
  identity: Readonly<{
    name: NAME;
    layer: Layer.Layer<LAYER_SERVICES, IAnyError, LAYER_REQUIREMENTS>;
  }>,
  props: {
    version: VERSION;
    guardLayer?: (props: {
      db: Readonly<
        Pick<IDb<IResourceDbConfig<MODELS, Record<never, never>>>, 'query'>
      >;
      authentication: AUTHENTICATION['Type'] | null;
    }) => Layer.Layer<GUARD_SERVICES, IAnyError, GUARD_REQUIREMENTS>;
    models: MODELS & IAssertValidModels<MODELS>;
    services?: Readonly<Record<string, IAnyService>>;
    contracts: CONTRACTS & {
      [K in keyof CONTRACTS &
        string]: K extends CONTRACTS[K]['contract']['commandName']
        ? CONTRACTS[K] & {
            contract: AssertContractMutationsInModels<
              CONTRACTS[K]['contract'],
              NoInfer<MODELS>
            >;
            guard?: (props: {
              authentication: AUTHENTICATION['Type'] | null;
              db: Readonly<
                Pick<
                  IDb<IResourceDbConfig<NoInfer<MODELS>, Record<never, never>>>,
                  'query'
                >
              >;
              payload: InferCommandPayload<CONTRACTS[K]['contract']['payload']>;
            }) => Effect.Effect<void, IAnyError, unknown>;
          }
        : ITypeError<`Bad contract "${K}". The key in contracts should be the commandName`>;
    };
    selections: SELECTIONS & {
      [K in keyof SELECTIONS]: {
        where: (props: {
          authentication: SELECTION['Type'];
        }) => Record<string, unknown>;
      };
    };
    authorize?: IAggregateAuthorization<MODELS, never, AUTHENTICATION['Type']>;
  } & (
    | {
        signatureSchema: SIGNATURE;
        authenticationSchema: AUTHENTICATION &
          Schema.Codec<{ readonly aggregateId: string }, unknown>;
        selectionSchema: SELECTION &
          IAggregateAuthentication<
            SIGNATURE,
            AUTHENTICATION,
            SELECTION,
            PATTERN
          >['selectionSchema'];
        pattern: RoutePattern<PATTERN> &
          IAggregateAuthentication<
            SIGNATURE,
            AUTHENTICATION,
            NoInfer<SELECTION>,
            PATTERN
          >['pattern'] &
          (string extends PATTERN ? never : unknown);
        authenticate: IAggregateAuthentication<
          SIGNATURE,
          AUTHENTICATION,
          SELECTION,
          PATTERN
        >['authenticate'];
      }
    | {
        signatureSchema?: never;
        authenticationSchema?: never;
        selectionSchema?: never;
        pattern?: never;
        authenticate?: never;
      }
  ),
): IAuthoredAggregate<
  NAME,
  MODELS,
  CONTRACTS,
  SELECTIONS,
  AUTHORIZE,
  VERSION,
  LAYER_SERVICES,
  LAYER_REQUIREMENTS,
  IAggregateAuthentication<SIGNATURE, AUTHENTICATION, SELECTION, PATTERN>,
  GUARD_SERVICES,
  GUARD_REQUIREMENTS
>;

export function makeAggregateVersion(
  identity: Readonly<{
    name: string;
    layer: Layer.Layer<never, IAnyError, unknown>;
  }>,
  props: unknown,
): unknown {
  const decodedProps = Schema.decodeUnknownSync(AggregatePropsSchema, {
    onExcessProperty: 'error',
  })(props);
  const authentication =
    decodedProps.signatureSchema === undefined ||
    decodedProps.authenticationSchema === undefined ||
    decodedProps.selectionSchema === undefined ||
    decodedProps.pattern === undefined ||
    decodedProps.authenticate === undefined
      ? defaultAggregateAuthentication
      : Schema.decodeUnknownSync(AuthenticationDeclarationSchema, {
          onExcessProperty: 'error',
        })({
          signatureSchema: decodedProps.signatureSchema,
          authenticationSchema: decodedProps.authenticationSchema,
          selectionSchema: decodedProps.selectionSchema,
          pattern: decodedProps.pattern,
          authenticate: decodedProps.authenticate,
        });
  const {
    signatureSchema: _signatureSchema,
    authenticationSchema: _authenticationSchema,
    selectionSchema: _selectionSchema,
    pattern: _pattern,
    authenticate: _authenticate,
    ...decodedWithoutAuthentication
  } = decodedProps;
  const decoded = {
    ...decodedWithoutAuthentication,
    authentication,
    ...Schema.decodeUnknownSync(
      Schema.Struct({
        name: Schema.String,
        layer: Schema.declare(
          (input: unknown): input is Layer.Layer<never, IAnyError, unknown> =>
            Layer.isLayer(input),
        ),
      }),
      { onExcessProperty: 'error' },
    )(identity),
  };
  const aggregateIdField =
    decoded.authentication.authenticationSchema.fields.aggregateId;
  const aggregateIdAst =
    aggregateIdField === undefined
      ? undefined
      : SchemaAST.toType(aggregateIdField.ast);
  if (
    aggregateIdAst === undefined ||
    aggregateIdAst.context?.isOptional ||
    (aggregateIdAst._tag !== 'String' &&
      !(
        aggregateIdAst._tag === 'Literal' &&
        typeof aggregateIdAst.literal === 'string'
      ))
  ) {
    throw new Error(
      'Aggregate authenticationSchema must contain a required string aggregateId',
    );
  }
  const {
    name,
    version,
    models,
    services: serviceDefinitions = {},
    contracts: decodedContractBindings,
    selections,
    authorize,
  } = decoded;
  const services = Record.map(serviceDefinitions, (service, serviceName) => {
    if (serviceName !== service.name) {
      throw new ZerospinError({
        code: 'aggregate-service-key-mismatch',
        message: `Aggregate "${name}" service key "${serviceName}" must match service name "${service.name}"`,
        extra: {
          aggregateName: name,
          serviceKey: serviceName,
          serviceName: service.name,
        },
      });
    }
    return service.version;
  });
  const contracts = Record.map(decodedContractBindings, binding => ({
    ...binding,
  }));

  assertValidModels({
    models,
    context: `makeAggregateVersion: ${name}`,
  });

  Schema.decodeUnknownSync(
    Schema.Record(
      Schema.String,
      Schema.Struct({
        model: CanonicalModelSchema,
        where: FunctionSchema,
      }),
    ).check(
      Schema.makeFilter(
        (decodedSelections: Record<string, { model: IModel }>) => {
          if (
            Object.keys(decodedSelections).length !== Object.keys(models).length
          ) {
            return `must contain exactly one selection for every model`;
          }
          for (const [modelKey, selection] of Object.entries(
            decodedSelections,
          )) {
            if (selection.model !== models[modelKey]) {
              return {
                path: [modelKey, 'model'],
                issue: `must be the same object as models.${modelKey}`,
              };
            }
          }
          return true;
        },
      ),
    ),
    { onExcessProperty: 'error' },
  )(selections);

  const fields = {
    layer: decoded.layer,
    authentication: decoded.authentication,
    guardLayer: decoded.guardLayer,
    name,
    version,
    models,
    services,
    contracts,
    selections,
  };
  const aggregate = Object.assign(
    new Aggregate(),
    authorize === undefined ? fields : { ...fields, authorize },
  ) as IAnyAuthoredAggregate;
  authoredInputs.set(aggregate, decoded);
  return aggregate;
}

export function upgradeAggregateVersion<
  const NAME extends string,
  const MODELS extends IAnyModels,
  const CONTRACTS extends IAnyContractBindings,
  const SELECTIONS extends IAnyAuthoredAggregate['selections'],
  AUTHORIZE extends IAggregateAuthorization<MODELS>,
  const VERSION extends string,
  const NEXT_VERSION extends string,
  LAYER_SERVICES,
  LAYER_REQUIREMENTS,
  AUTH extends IAggregateAuthentication,
  GUARD_SERVICES,
  GUARD_REQUIREMENTS,
  const MODELS_PATCH extends Record<string, IModel | null> = {},
  const CONTRACTS_PATCH extends Record<
    string,
    IAnyContractBindings[string] | null
  > = {},
  const SELECTIONS_PATCH extends Record<
    string,
    IAnyAuthoredAggregate['selections'][string] | null
  > = {},
  NEXT_MODELS extends Record<string, IModel> = {
    readonly [K in
      | keyof MODELS
      | keyof MODELS_PATCH as K extends keyof MODELS_PATCH
      ? MODELS_PATCH[K] extends null
        ? never
        : K
      : K]: K extends keyof MODELS_PATCH
      ? Exclude<MODELS_PATCH[K], null>
      : K extends keyof MODELS
        ? MODELS[K]
        : never;
  },
  NEXT_CONTRACTS extends Record<string, IAnyContractBindings[string]> = {
    readonly [K in
      | keyof CONTRACTS
      | keyof CONTRACTS_PATCH as K extends keyof CONTRACTS_PATCH
      ? CONTRACTS_PATCH[K] extends null
        ? never
        : K
      : K]: K extends keyof CONTRACTS_PATCH
      ? Exclude<CONTRACTS_PATCH[K], null>
      : K extends keyof CONTRACTS
        ? CONTRACTS[K]
        : never;
  },
  NEXT_SELECTIONS extends Record<
    string,
    IAnyAuthoredAggregate['selections'][string]
  > = {
    readonly [K in
      | keyof SELECTIONS
      | keyof SELECTIONS_PATCH as K extends keyof SELECTIONS_PATCH
      ? SELECTIONS_PATCH[K] extends null
        ? never
        : K
      : K]: K extends keyof SELECTIONS_PATCH
      ? Exclude<SELECTIONS_PATCH[K], null>
      : K extends keyof SELECTIONS
        ? SELECTIONS[K]
        : never;
  },
  NEXT_SIGNATURE extends Schema.Codec<unknown, unknown> =
    AUTH['signatureSchema'],
  NEXT_AUTHENTICATION extends Schema.Struct<
    Readonly<Record<string, Schema.Codec<unknown, unknown>>>
  > = AUTH['authenticationSchema'],
  NEXT_SELECTION extends Schema.Struct<
    Readonly<Record<string, Schema.Codec<unknown, unknown>>>
  > = AUTH['selectionSchema'],
  const NEXT_PATTERN extends string = AUTH['pattern'] extends RoutePattern<
    infer SOURCE
  >
    ? SOURCE
    : never,
  NEXT_PROPS extends {
    models: unknown;
    contracts: unknown;
    selections: unknown;
    authorize?: unknown;
    guardLayer?: unknown;
  } = Parameters<
    typeof makeAggregateVersion<
      NAME,
      NEXT_MODELS,
      NEXT_CONTRACTS,
      NEXT_SELECTIONS,
      IAggregateAuthorization<NEXT_MODELS>,
      NEXT_VERSION,
      LAYER_SERVICES,
      LAYER_REQUIREMENTS,
      NEXT_SIGNATURE,
      NEXT_AUTHENTICATION,
      NEXT_SELECTION,
      NEXT_PATTERN,
      GUARD_SERVICES,
      GUARD_REQUIREMENTS
    >
  >[1],
>(
  previous: IAuthoredAggregate<
    NAME,
    MODELS,
    CONTRACTS,
    SELECTIONS,
    AUTHORIZE,
    VERSION,
    LAYER_SERVICES,
    LAYER_REQUIREMENTS,
    AUTH,
    GUARD_SERVICES,
    GUARD_REQUIREMENTS
  >,
  props: {
    version: NEXT_VERSION;
    services?: Readonly<Record<string, IAnyService | null>>;
    authorize?: NEXT_PROPS['authorize'] | null;
    guardLayer?: NEXT_PROPS['guardLayer'];
    models?: MODELS_PATCH & {
      [K in keyof MODELS_PATCH]: MODELS_PATCH[K] extends null
        ? K extends keyof MODELS
          ? null
          : never
        : K extends keyof NonNullable<NEXT_PROPS['models']>
          ? NonNullable<NEXT_PROPS['models']>[K]
          : never;
    };
    contracts?: CONTRACTS_PATCH & {
      [K in keyof CONTRACTS_PATCH]: CONTRACTS_PATCH[K] extends null
        ? K extends keyof CONTRACTS
          ? null
          : never
        : K extends keyof NonNullable<NEXT_PROPS['contracts']>
          ? NonNullable<NEXT_PROPS['contracts']>[K]
          : never;
    };
    selections?: SELECTIONS_PATCH & {
      [K in keyof SELECTIONS_PATCH]: SELECTIONS_PATCH[K] extends null
        ? K extends keyof SELECTIONS
          ? null
          : never
        : K extends keyof NonNullable<NEXT_PROPS['selections']>
          ? NonNullable<NEXT_PROPS['selections']>[K]
          : never;
    };
  } & Omit<
    NEXT_PROPS,
    | 'version'
    | 'models'
    | 'services'
    | 'contracts'
    | 'selections'
    | 'authorize'
    | 'guardLayer'
    | 'signatureSchema'
    | 'authenticationSchema'
    | 'selectionSchema'
    | 'pattern'
    | 'authenticate'
  > &
    (
      | {
          signatureSchema: NEXT_SIGNATURE;
          authenticationSchema: NEXT_AUTHENTICATION &
            Schema.Codec<{ readonly aggregateId: string }, unknown>;
          selectionSchema: NEXT_SELECTION &
            IAggregateAuthentication<
              NEXT_SIGNATURE,
              NEXT_AUTHENTICATION,
              NEXT_SELECTION,
              NEXT_PATTERN
            >['selectionSchema'];
          pattern: RoutePattern<NEXT_PATTERN> &
            IAggregateAuthentication<
              NEXT_SIGNATURE,
              NEXT_AUTHENTICATION,
              NoInfer<NEXT_SELECTION>,
              NEXT_PATTERN
            >['pattern'] &
            (string extends NEXT_PATTERN ? never : unknown);
          authenticate: IAggregateAuthentication<
            NEXT_SIGNATURE,
            NEXT_AUTHENTICATION,
            NEXT_SELECTION,
            NEXT_PATTERN
          >['authenticate'];
        }
      | {
          authenticate: IAggregateAuthentication<
            NEXT_SIGNATURE,
            NEXT_AUTHENTICATION,
            NEXT_SELECTION,
            NEXT_PATTERN
          >['authenticate'];
          signatureSchema?: never;
          authenticationSchema?: never;
          selectionSchema?: never;
          pattern?: never;
        }
      | {
          authenticate?: never;
          signatureSchema?: never;
          authenticationSchema?: never;
          selectionSchema?: never;
          pattern?: never;
        }
    ),
): ReturnType<
  typeof makeAggregateVersion<
    NAME,
    NEXT_MODELS,
    NEXT_CONTRACTS,
    NEXT_SELECTIONS,
    IAggregateAuthorization<NEXT_MODELS>,
    NEXT_VERSION,
    LAYER_SERVICES,
    LAYER_REQUIREMENTS,
    NEXT_SIGNATURE,
    NEXT_AUTHENTICATION,
    NEXT_SELECTION,
    NEXT_PATTERN,
    GUARD_SERVICES,
    GUARD_REQUIREMENTS
  >
>;

export function upgradeAggregateVersion(
  previous: unknown,
  upgradeProps: {
    version: string;
    models?: Record<string, unknown>;
    contracts?: Record<string, unknown>;
    selections?: Record<string, unknown>;
    services?: Record<string, IAnyService | null>;
    authorize?: unknown;
    signatureSchema?: unknown;
    authenticationSchema?: unknown;
    selectionSchema?: unknown;
    pattern?: unknown;
    authenticate?: unknown;
    guardLayer?: unknown;
  },
): unknown {
  const decoded = authoredInputs.get(
    Schema.decodeUnknownSync(AggregateSchema)(previous),
  );
  if (decoded === undefined) {
    throw new Error(
      'Cannot upgrade an aggregate not constructed by makeAggregateVersion',
    );
  }
  if (Object.hasOwn(upgradeProps, 'layer')) {
    throw new Error(
      'Aggregate layers are declared on defineAggregate, not upgrades',
    );
  }
  const { name } = decoded;
  const next = {
    ...decoded,
    version: upgradeProps.version,
  };
  for (const field of ['models', 'contracts', 'selections', 'services']) {
    const patch: unknown = Reflect.get(upgradeProps, field);
    if (patch === undefined) continue;
    const entries = Schema.decodeUnknownSync(
      Schema.Record(Schema.String, Schema.Unknown),
    )(patch);
    const previous = Schema.decodeUnknownSync(
      Schema.Record(Schema.String, Schema.Unknown),
    )(Reflect.get(decoded, field) ?? {});
    const merged = { ...previous };
    for (const [key, value] of Object.entries(entries)) {
      if (value === null) {
        if (!Object.hasOwn(previous, key)) {
          throw new Error(
            `Cannot remove unknown ${field} entry "${key}" from ${name}`,
          );
        }
        delete merged[key];
      } else {
        merged[key] = value;
      }
    }
    Reflect.set(next, field, merged);
  }
  const schemaFields = [
    'signatureSchema',
    'authenticationSchema',
    'selectionSchema',
    'pattern',
  ] as const;
  const hasSchemaReplacement = schemaFields.some(field =>
    Object.hasOwn(upgradeProps, field),
  );
  if (hasSchemaReplacement) {
    if (
      !schemaFields.every(field => Object.hasOwn(upgradeProps, field)) ||
      !Object.hasOwn(upgradeProps, 'authenticate')
    ) {
      throw new Error(
        'Schema/pattern replacement requires signatureSchema, authenticationSchema, selectionSchema, pattern, and authenticate',
      );
    }
    Reflect.set(next, 'authentication', {
      signatureSchema: upgradeProps.signatureSchema,
      authenticationSchema: upgradeProps.authenticationSchema,
      selectionSchema: upgradeProps.selectionSchema,
      pattern: upgradeProps.pattern,
      authenticate: upgradeProps.authenticate,
    });
  } else if (Object.hasOwn(upgradeProps, 'authenticate')) {
    Reflect.set(next, 'authentication', {
      ...next.authentication,
      authenticate: upgradeProps.authenticate,
    });
  }
  if (Object.hasOwn(upgradeProps, 'guardLayer')) {
    Reflect.set(next, 'guardLayer', upgradeProps.guardLayer);
  }
  if (Object.hasOwn(upgradeProps, 'authorize')) {
    if (upgradeProps.authorize === null) {
      Reflect.deleteProperty(next, 'authorize');
    } else {
      Reflect.set(next, 'authorize', upgradeProps.authorize);
    }
  }
  const { name: nextName, layer, authentication, ...nextProps } = next;
  return Reflect.apply(makeAggregateVersion, undefined, [
    { name: nextName, layer },
    {
      ...nextProps,
      signatureSchema: authentication.signatureSchema,
      authenticationSchema: authentication.authenticationSchema,
      selectionSchema: authentication.selectionSchema,
      pattern: authentication.pattern,
      authenticate: authentication.authenticate,
    },
  ]);
}
