import {
  type IAnyError,
  type IFrameworkError,
  type IScopedError,
} from '@zerospin/error';
import {
  encodeShape,
  isAttributeDescriptor,
  PrimitiveKind,
  type IAnyRefDescriptor,
  type IAnyShape,
  type IPrimaryKeyDescriptor,
  type IPrimitiveDescriptor,
} from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { mapValues } from 'es-toolkit';

import type { IDb, IResourceDbConfig } from '../../drizzle/types.ts';
import { Model } from '../../models/defineModel.ts';
import type {
  IAnyModels,
  IModel,
  InferCommandPayload,
} from '../../models/types.ts';
import { defineContract, type Command } from '../defineContract.ts';
import {
  FailuresSchema,
  getFailuresCodec,
  type FailureType,
  type IFailures,
} from '../failures.ts';
import type {
  IAnyMutation,
  IContract,
  IContractFailure,
  IModelMutations,
} from '../types.ts';

import { makeModelMutations } from './makeModelMutations.ts';

export type IMutations = readonly IAnyMutation[];

export type MutationValues<MUTATIONS> =
  MUTATIONS extends readonly (infer ITEM)[] ? ITEM : never;

type IsErasedPayloadShape<PAYLOAD extends IAnyShape> =
  string extends keyof PAYLOAD ? true : false;

export type InferContractProgram<
  PAYLOAD extends IAnyShape = IAnyShape,
  MUTATIONS = IMutations,
  REQUIREMENTS = never,
  ERROR extends IContractFailure = IContractFailure,
> = (props: {
  identity: Readonly<Record<string, unknown>> | null;
  payload: IsErasedPayloadShape<PAYLOAD> extends true
    ? // oxlint-disable-next-line typescript/no-explicit-any -- erased payload shape intentionally accepts any payload
      any
    : InferCommandPayload<PAYLOAD>;
}) => Effect.Effect<MUTATIONS, ERROR, REQUIREMENTS>;

type IContractProgramFn<
  PAYLOAD extends IAnyShape,
  MUTATIONS,
  MODELS extends IAnyModels,
  REQUIREMENTS = never,
  ERROR extends IContractFailure = IContractFailure,
  IDENTITY = Readonly<Record<string, unknown>> | null,
  FAILURES extends IFailures = IFailures,
> = (props: {
  identity: IDENTITY;
  failures: NoInfer<FAILURES>;
  models: { readonly [K in keyof MODELS]: IModelMutations<MODELS[K]> };
  payload: InferCommandPayload<PAYLOAD>;
}) => Effect.Effect<MUTATIONS, ERROR, REQUIREMENTS>;

/**
 * Contract payload fields only — excludes {@link IAnyRefDescriptor}.
 *
 * `primitives.ref()` belongs on persisted table/model attributes. Its concrete
 * table and relation metadata are not command input.
 *
 * Foreign keys carry caller-supplied IDs; raw table primary keys are excluded.
 */
export type IPayloadFieldDescriptor = Exclude<
  IPrimitiveDescriptor,
  IAnyRefDescriptor | IPrimaryKeyDescriptor
>;

const upgradeEdges = new WeakMap<
  object,
  {
    parent: IContract;
    up: (props: { payload: unknown }) => Effect.Effect<unknown, IAnyError>;
    down?: (props: { payload: unknown }) => Effect.Effect<unknown, IAnyError>;
  }
>();

const nextVersions = new WeakMap<object, IContract>();

const noOpProgram = (_props: { payload: unknown }) =>
  Effect.succeed([] as const);

const semVerPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const PayloadFieldDescriptorSchema = Schema.declare(
  (input: unknown): input is IPayloadFieldDescriptor => {
    if (!isAttributeDescriptor(input)) {
      return false;
    }
    if (input.kind === PrimitiveKind.Ref) {
      return false;
    }
    if (input.kind === PrimitiveKind.PrimaryKey) {
      return false;
    }
    return true;
  },
  { expected: 'Invalid attribute descriptor' },
);

const PayloadAdapterSchema = Schema.declare(
  (
    input: unknown,
  ): input is (props: {
    payload: unknown;
  }) => Effect.Effect<unknown, IAnyError> => typeof input === 'function',
);

const ContractProgramSchema = Schema.declare(
  (
    input: unknown,
  ): input is (props: {
    payload: unknown;
    identity: Readonly<Record<string, unknown>> | null;
    models: Readonly<Record<string, IModelMutations<IModel>>>;
    failures: IFailures;
  }) => Effect.Effect<
    IMutations,
    IFrameworkError | Extract<IScopedError, { scope: 'contract' }>,
    unknown
  > => typeof input === 'function',
);

const ContractSemVerSchema = Schema.String.check(
  Schema.makeFilter((version: string) => {
    const match = semVerPattern.exec(version);
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
);

const MakeVersionPropsSchema = Schema.Struct({
  identity: Schema.optionalKey(
    Schema.declare(
      (
        input: unknown,
      ): input is Schema.Codec<
        Readonly<Record<string, unknown>> | null,
        unknown
      > => Schema.isSchema(input),
    ),
  ),
  guard: Schema.optionalKey(
    Schema.declare(
      (
        input: unknown,
      ): input is (props: {
        queryDb: Readonly<Pick<IDb, 'query'>>;
        payload: unknown;
        identity: Readonly<Record<string, unknown>> | null;
        failures: IFailures;
      }) => Effect.Effect<
        void,
        IFrameworkError | Extract<IScopedError, { scope: 'contract' }>,
        unknown
      > => typeof input === 'function',
    ),
  ),
  failures: Schema.optionalKey(FailuresSchema),
  models: Schema.optionalKey(
    Schema.Record(
      Schema.String,
      Schema.declare(
        (input: unknown): input is IModel => input instanceof Model,
      ),
    ),
  ),
  payload: Schema.Record(Schema.String, PayloadFieldDescriptorSchema),
  version: ContractSemVerSchema,
  program: Schema.optionalKey(ContractProgramSchema),
});

export class Contract {
  get previous(): IContract | undefined {
    return upgradeEdges.get(this)?.parent;
  }

  get next(): IContract | undefined {
    return nextVersions.get(this);
  }

  get up() {
    return upgradeEdges.get(this)?.up;
  }

  get down() {
    return upgradeEdges.get(this)?.down;
  }
}

export function makeContractVersion<
  COMMAND_NAME extends string,
  PAYLOAD extends Record<string, IPayloadFieldDescriptor>,
  const VERSION extends string,
  MUTATIONS extends IMutations = readonly [],
  MODELS extends IAnyModels = Record<never, never>,
  const FAILURE extends IFailures = Record<never, never>,
  PROGRAM_REQUIREMENTS = never,
  PROGRAM_ERROR extends
    | IFrameworkError
    | NoInfer<Extract<FailureType<FAILURE>, { readonly scope: 'contract' }>> =
    IAnyError,
  IDENTITY extends Schema.Codec<
    Readonly<Record<string, unknown>> | null,
    unknown
  > = Schema.Codec<Readonly<Record<string, unknown>> | null, unknown>,
  GUARD_REQUIREMENTS = never,
>(
  commandName: Command<COMMAND_NAME>,
  props: {
    identity?: never;
    guard?: (props: {
      failures: NoInfer<FAILURE>;
      queryDb: string extends keyof MODELS
        ? Readonly<Pick<IDb, 'query'>>
        : Readonly<
            Pick<IDb<IResourceDbConfig<MODELS, Record<never, never>>>, 'query'>
          >;
      payload: InferCommandPayload<PAYLOAD>;
      identity: NoInfer<Readonly<Record<string, unknown>> | null>;
    }) => Effect.Effect<
      void,
      | IFrameworkError
      | NoInfer<Extract<FailureType<FAILURE>, { readonly scope: 'contract' }>>,
      GUARD_REQUIREMENTS
    >;
    failures?: FAILURE;
    models?: MODELS;
    payload: PAYLOAD;
    version: VERSION;

    program?: IContractProgramFn<
      PAYLOAD,
      MUTATIONS,
      MODELS,
      PROGRAM_REQUIREMENTS,
      PROGRAM_ERROR,
      Readonly<Record<string, unknown>> | null,
      FAILURE
    >;
  },
): IContract<
  COMMAND_NAME,
  {
    readonly [K in keyof PAYLOAD]: PAYLOAD[K] extends infer DESCRIPTOR
      ? DESCRIPTOR extends IPayloadFieldDescriptor
        ? Readonly<DESCRIPTOR>
        : never
      : never;
  },
  VERSION,
  MUTATIONS,
  { [K in VERSION]: Readonly<PAYLOAD> },
  MODELS,
  PROGRAM_REQUIREMENTS | GUARD_REQUIREMENTS,
  PROGRAM_ERROR,
  PROGRAM_REQUIREMENTS | GUARD_REQUIREMENTS,
  FAILURE,
  { [K in VERSION]: FAILURE },
  IDENTITY
>;

export function makeContractVersion<
  COMMAND_NAME extends string,
  PAYLOAD extends Record<string, IPayloadFieldDescriptor>,
  const VERSION extends string,
  MUTATIONS extends IMutations = readonly [],
  MODELS extends IAnyModels = Record<never, never>,
  const FAILURE extends IFailures = Record<never, never>,
  PROGRAM_REQUIREMENTS = never,
  PROGRAM_ERROR extends
    | IFrameworkError
    | NoInfer<Extract<FailureType<FAILURE>, { readonly scope: 'contract' }>> =
    IAnyError,
  IDENTITY extends Schema.Codec<
    Readonly<Record<string, unknown>> | null,
    unknown
  > = Schema.Codec<Readonly<Record<string, unknown>> | null, unknown>,
  GUARD_REQUIREMENTS = never,
>(
  commandName: Command<COMMAND_NAME>,
  props: {
    identity: IDENTITY;
    guard?: (props: {
      failures: NoInfer<FAILURE>;
      queryDb: string extends keyof MODELS
        ? Readonly<Pick<IDb, 'query'>>
        : Readonly<
            Pick<IDb<IResourceDbConfig<MODELS, Record<never, never>>>, 'query'>
          >;
      payload: InferCommandPayload<PAYLOAD>;
      identity: NoInfer<IDENTITY['Type']>;
    }) => Effect.Effect<
      void,
      | IFrameworkError
      | NoInfer<Extract<FailureType<FAILURE>, { readonly scope: 'contract' }>>,
      GUARD_REQUIREMENTS
    >;
    failures?: FAILURE;
    models?: MODELS;
    payload: PAYLOAD;
    version: VERSION;

    program?: IContractProgramFn<
      PAYLOAD,
      MUTATIONS,
      MODELS,
      PROGRAM_REQUIREMENTS,
      PROGRAM_ERROR,
      IDENTITY['Type'],
      FAILURE
    >;
  },
): IContract<
  COMMAND_NAME,
  {
    readonly [K in keyof PAYLOAD]: PAYLOAD[K] extends infer DESCRIPTOR
      ? DESCRIPTOR extends IPayloadFieldDescriptor
        ? Readonly<DESCRIPTOR>
        : never
      : never;
  },
  VERSION,
  MUTATIONS,
  { [K in VERSION]: Readonly<PAYLOAD> },
  MODELS,
  PROGRAM_REQUIREMENTS | GUARD_REQUIREMENTS,
  PROGRAM_ERROR,
  PROGRAM_REQUIREMENTS | GUARD_REQUIREMENTS,
  FAILURE,
  { [K in VERSION]: FAILURE },
  IDENTITY
>;

/*
 * 1. Validate and snapshot the authored payload and program.
 * 2. Bind the authored program to this definition's model mutations.
 * 3. Expose authored content and the serializable specification.
 */
export function makeContractVersion(command: Command, props: unknown): unknown {
  return makeVersion(command, props);
}

function makeVersion(
  command: Command,
  props: unknown,
  inheritedFailures?: IFailures,
) {
  // 1 — Strictly decode the current definition and its optional program.
  const decodedProps = Schema.decodeUnknownSync(MakeVersionPropsSchema, {
    onExcessProperty: 'error',
  })(props);
  const commandName = Schema.decodeUnknownSync(Schema.String)(command);
  const { version } = decodedProps;
  const payload: Record<string, IPayloadFieldDescriptor> = {};
  for (const [key, descriptor] of Object.entries(decodedProps.payload)) {
    payload[key] =
      descriptor.kind === PrimitiveKind.Enum
        ? { ...descriptor, values: [...descriptor.values] }
        : { ...descriptor };
  }

  // 2 — Bind the authored program to this definition's model mutations.
  const models = { ...decodedProps.models };
  const modelMutations = mapValues(models, makeModelMutations);
  const failures =
    inheritedFailures ?? Object.freeze({ ...decodedProps.failures });
  getFailuresCodec(failures);
  const authoredProgram = decodedProps.program ?? noOpProgram;
  const program: IContract['program'] = ({ payload, identity }) =>
    authoredProgram({
      payload,
      identity,
      models: modelMutations,
      failures,
    });
  // 3 — Expose authored content and the serializable specification.
  const spec = {
    commandName,
    version,
    payloadShape: encodeShape(payload),
    failureJsonSchema:
      Object.keys(failures).length === 0
        ? null
        : Schema.toJsonSchemaDocument(getFailuresCodec(failures)),
    models: mapValues(models, model => structuredClone(model.spec)),
  };

  const fields: Omit<IContract, 'previous' | 'next' | 'up' | 'down'> = {
    ...(decodedProps.identity === undefined
      ? {}
      : { identity: decodedProps.identity }),
    ...(decodedProps.guard === undefined ? {} : { guard: decodedProps.guard }),
    failures,
    models,
    commandName,
    payload,
    version,
    spec,
    program,
  };
  const contract = Object.assign(new Contract(), fields);
  return contract;
}

type IPatchedModels<
  M extends IAnyModels,
  P extends Readonly<Record<string, IModel | null>>,
> = Omit<M, keyof P> & {
  readonly [K in keyof P as P[K] extends null ? never : K]: Exclude<P[K], null>;
};

export function upgradeContractVersion<
  COMMAND_NAME extends string,
  PAYLOAD extends IAnyShape,
  VERSION extends string,
  MUTATIONS,
  PAYLOADS extends Record<string, IAnyShape>,
  PATCH extends Record<string, IPayloadFieldDescriptor | null>,
  const NEXT_VERSION extends string,
  NEXT_MUTATIONS extends IMutations,
  MODELS extends IAnyModels,
  PREVIOUS_FAILURE extends IFailures,
  FAILURES extends Record<string, IFailures>,
  MODEL_PATCH extends Readonly<Record<string, IModel | null>> = Record<
    never,
    never
  >,
  const FAILURE extends IFailures = PREVIOUS_FAILURE,
  NEXT_PROGRAM_REQUIREMENTS = never,
  NEXT_PROGRAM_ERROR extends
    | IFrameworkError
    | NoInfer<Extract<FailureType<FAILURE>, { readonly scope: 'contract' }>> =
    IAnyError,
  HISTORICAL_PROGRAM_REQUIREMENTS = never,
  IDENTITY extends Schema.Codec<
    Readonly<Record<string, unknown>> | null,
    unknown
  > = Schema.Codec<Readonly<Record<string, unknown>> | null, unknown>,
  GUARD_REQUIREMENTS = never,
>(
  contract: IContract<
    COMMAND_NAME,
    PAYLOAD,
    VERSION,
    MUTATIONS,
    PAYLOADS,
    MODELS,
    HISTORICAL_PROGRAM_REQUIREMENTS,
    IContractFailure,
    HISTORICAL_PROGRAM_REQUIREMENTS,
    PREVIOUS_FAILURE,
    FAILURES
  >,
  props: {
    identity?: never;
    guard?: (props: {
      failures: NoInfer<FAILURE>;
      queryDb: Readonly<
        Pick<
          IDb<
            IResourceDbConfig<
              IPatchedModels<MODELS, NoInfer<MODEL_PATCH>>,
              Record<never, never>
            >
          >,
          'query'
        >
      >;
      payload: InferCommandPayload<{
        readonly [K in keyof PAYLOAD | keyof PATCH as K extends keyof PATCH
          ? PATCH[K] extends null
            ? never
            : K
          : K]: K extends keyof PATCH
          ? PATCH[K] extends infer DESCRIPTOR
            ? DESCRIPTOR extends IPayloadFieldDescriptor
              ? Readonly<DESCRIPTOR>
              : never
            : never
          : K extends keyof PAYLOAD
            ? PAYLOAD[K]
            : never;
      }>;
      identity: Readonly<Record<string, unknown>> | null;
    }) => Effect.Effect<
      void,
      | IFrameworkError
      | NoInfer<Extract<FailureType<FAILURE>, { readonly scope: 'contract' }>>,
      GUARD_REQUIREMENTS
    >;
    failures?: FAILURE;
    models?: MODEL_PATCH & {
      [K in keyof MODEL_PATCH]: MODEL_PATCH[K] extends null
        ? K extends keyof MODELS
          ? null
          : never
        : MODEL_PATCH[K];
    };
    payload: PATCH & {
      [K in keyof PATCH]: PATCH[K] extends null
        ? K extends keyof PAYLOAD
          ? null
          : never
        : PATCH[K];
    };
    version: NEXT_VERSION;

    up: (props: {
      payload: Parameters<InferContractProgram<PAYLOAD>>[0]['payload'];
    }) => Effect.Effect<
      InferCommandPayload<{
        readonly [K in keyof PAYLOAD | keyof PATCH as K extends keyof PATCH
          ? PATCH[K] extends null
            ? never
            : K
          : K]: K extends keyof PATCH
          ? PATCH[K] extends infer DESCRIPTOR
            ? DESCRIPTOR extends IPayloadFieldDescriptor
              ? Readonly<DESCRIPTOR>
              : never
            : never
          : K extends keyof PAYLOAD
            ? PAYLOAD[K]
            : never;
      }>,
      IAnyError
    >;
    down?: (props: {
      payload: InferCommandPayload<{
        readonly [K in keyof PAYLOAD | keyof PATCH as K extends keyof PATCH
          ? PATCH[K] extends null
            ? never
            : K
          : K]: K extends keyof PATCH
          ? PATCH[K] extends infer DESCRIPTOR
            ? DESCRIPTOR extends IPayloadFieldDescriptor
              ? Readonly<DESCRIPTOR>
              : never
            : never
          : K extends keyof PAYLOAD
            ? PAYLOAD[K]
            : never;
      }>;
    }) => Effect.Effect<
      Parameters<InferContractProgram<PAYLOAD>>[0]['payload'],
      IAnyError
    >;
    program: IContractProgramFn<
      {
        readonly [K in keyof PAYLOAD | keyof PATCH as K extends keyof PATCH
          ? PATCH[K] extends null
            ? never
            : K
          : K]: K extends keyof PATCH
          ? PATCH[K] extends infer DESCRIPTOR
            ? DESCRIPTOR extends IPayloadFieldDescriptor
              ? Readonly<DESCRIPTOR>
              : never
            : never
          : K extends keyof PAYLOAD
            ? PAYLOAD[K]
            : never;
      },
      NEXT_MUTATIONS,
      {
        readonly [K in
          | keyof MODELS
          | keyof MODEL_PATCH as K extends keyof MODEL_PATCH
          ? MODEL_PATCH[K] extends null
            ? never
            : K
          : K]: K extends keyof MODEL_PATCH
          ? Exclude<MODEL_PATCH[K], null>
          : K extends keyof MODELS
            ? MODELS[K]
            : never;
      },
      NEXT_PROGRAM_REQUIREMENTS,
      NEXT_PROGRAM_ERROR,
      Readonly<Record<string, unknown>> | null,
      FAILURE
    >;
  },
): string extends NEXT_VERSION
  ? IContract
  : string extends keyof PAYLOAD
    ? IContract
    : IContract<
        COMMAND_NAME,
        {
          readonly [K in keyof PAYLOAD | keyof PATCH as K extends keyof PATCH
            ? PATCH[K] extends null
              ? never
              : K
            : K]: K extends keyof PATCH
            ? PATCH[K] extends infer DESCRIPTOR
              ? DESCRIPTOR extends IPayloadFieldDescriptor
                ? Readonly<DESCRIPTOR>
                : never
              : never
            : K extends keyof PAYLOAD
              ? PAYLOAD[K]
              : never;
        },
        NEXT_VERSION,
        NEXT_MUTATIONS,
        PAYLOADS & {
          [K in NEXT_VERSION]: {
            readonly [K in keyof PAYLOAD | keyof PATCH as K extends keyof PATCH
              ? PATCH[K] extends null
                ? never
                : K
              : K]: K extends keyof PATCH
              ? PATCH[K] extends infer DESCRIPTOR
                ? DESCRIPTOR extends IPayloadFieldDescriptor
                  ? Readonly<DESCRIPTOR>
                  : never
                : never
              : K extends keyof PAYLOAD
                ? PAYLOAD[K]
                : never;
          };
        },
        {
          readonly [K in
            | keyof MODELS
            | keyof MODEL_PATCH as K extends keyof MODEL_PATCH
            ? MODEL_PATCH[K] extends null
              ? never
              : K
            : K]: K extends keyof MODEL_PATCH
            ? Exclude<MODEL_PATCH[K], null>
            : K extends keyof MODELS
              ? MODELS[K]
              : never;
        },
        NEXT_PROGRAM_REQUIREMENTS | GUARD_REQUIREMENTS,
        NEXT_PROGRAM_ERROR,
        | HISTORICAL_PROGRAM_REQUIREMENTS
        | NEXT_PROGRAM_REQUIREMENTS
        | GUARD_REQUIREMENTS,
        FAILURE,
        FAILURES & { [K in NEXT_VERSION]: FAILURE },
        IDENTITY
      >;

export function upgradeContractVersion<
  COMMAND_NAME extends string,
  PAYLOAD extends IAnyShape,
  VERSION extends string,
  MUTATIONS,
  PAYLOADS extends Record<string, IAnyShape>,
  PATCH extends Record<string, IPayloadFieldDescriptor | null>,
  const NEXT_VERSION extends string,
  NEXT_MUTATIONS extends IMutations,
  MODELS extends IAnyModels,
  PREVIOUS_FAILURE extends IFailures,
  FAILURES extends Record<string, IFailures>,
  MODEL_PATCH extends Readonly<Record<string, IModel | null>> = Record<
    never,
    never
  >,
  const FAILURE extends IFailures = PREVIOUS_FAILURE,
  NEXT_PROGRAM_REQUIREMENTS = never,
  NEXT_PROGRAM_ERROR extends
    | IFrameworkError
    | NoInfer<Extract<FailureType<FAILURE>, { readonly scope: 'contract' }>> =
    IAnyError,
  HISTORICAL_PROGRAM_REQUIREMENTS = never,
  IDENTITY extends Schema.Codec<
    Readonly<Record<string, unknown>> | null,
    unknown
  > = Schema.Codec<Readonly<Record<string, unknown>> | null, unknown>,
  GUARD_REQUIREMENTS = never,
>(
  contract: IContract<
    COMMAND_NAME,
    PAYLOAD,
    VERSION,
    MUTATIONS,
    PAYLOADS,
    MODELS,
    HISTORICAL_PROGRAM_REQUIREMENTS,
    IContractFailure,
    HISTORICAL_PROGRAM_REQUIREMENTS,
    PREVIOUS_FAILURE,
    FAILURES
  >,
  props: {
    identity: IDENTITY;
    guard?: (props: {
      failures: NoInfer<FAILURE>;
      queryDb: Readonly<
        Pick<
          IDb<
            IResourceDbConfig<
              IPatchedModels<MODELS, NoInfer<MODEL_PATCH>>,
              Record<never, never>
            >
          >,
          'query'
        >
      >;
      payload: InferCommandPayload<{
        readonly [K in keyof PAYLOAD | keyof PATCH as K extends keyof PATCH
          ? PATCH[K] extends null
            ? never
            : K
          : K]: K extends keyof PATCH
          ? PATCH[K] extends infer DESCRIPTOR
            ? DESCRIPTOR extends IPayloadFieldDescriptor
              ? Readonly<DESCRIPTOR>
              : never
            : never
          : K extends keyof PAYLOAD
            ? PAYLOAD[K]
            : never;
      }>;
      identity: NoInfer<IDENTITY['Type']>;
    }) => Effect.Effect<
      void,
      | IFrameworkError
      | NoInfer<Extract<FailureType<FAILURE>, { readonly scope: 'contract' }>>,
      GUARD_REQUIREMENTS
    >;
    failures?: FAILURE;
    models?: MODEL_PATCH & {
      [K in keyof MODEL_PATCH]: MODEL_PATCH[K] extends null
        ? K extends keyof MODELS
          ? null
          : never
        : MODEL_PATCH[K];
    };
    payload: PATCH & {
      [K in keyof PATCH]: PATCH[K] extends null
        ? K extends keyof PAYLOAD
          ? null
          : never
        : PATCH[K];
    };
    version: NEXT_VERSION;

    up: (props: {
      payload: Parameters<InferContractProgram<PAYLOAD>>[0]['payload'];
    }) => Effect.Effect<
      InferCommandPayload<{
        readonly [K in keyof PAYLOAD | keyof PATCH as K extends keyof PATCH
          ? PATCH[K] extends null
            ? never
            : K
          : K]: K extends keyof PATCH
          ? PATCH[K] extends infer DESCRIPTOR
            ? DESCRIPTOR extends IPayloadFieldDescriptor
              ? Readonly<DESCRIPTOR>
              : never
            : never
          : K extends keyof PAYLOAD
            ? PAYLOAD[K]
            : never;
      }>,
      IAnyError
    >;
    down?: (props: {
      payload: InferCommandPayload<{
        readonly [K in keyof PAYLOAD | keyof PATCH as K extends keyof PATCH
          ? PATCH[K] extends null
            ? never
            : K
          : K]: K extends keyof PATCH
          ? PATCH[K] extends infer DESCRIPTOR
            ? DESCRIPTOR extends IPayloadFieldDescriptor
              ? Readonly<DESCRIPTOR>
              : never
            : never
          : K extends keyof PAYLOAD
            ? PAYLOAD[K]
            : never;
      }>;
    }) => Effect.Effect<
      Parameters<InferContractProgram<PAYLOAD>>[0]['payload'],
      IAnyError
    >;
    program: IContractProgramFn<
      {
        readonly [K in keyof PAYLOAD | keyof PATCH as K extends keyof PATCH
          ? PATCH[K] extends null
            ? never
            : K
          : K]: K extends keyof PATCH
          ? PATCH[K] extends infer DESCRIPTOR
            ? DESCRIPTOR extends IPayloadFieldDescriptor
              ? Readonly<DESCRIPTOR>
              : never
            : never
          : K extends keyof PAYLOAD
            ? PAYLOAD[K]
            : never;
      },
      NEXT_MUTATIONS,
      {
        readonly [K in
          | keyof MODELS
          | keyof MODEL_PATCH as K extends keyof MODEL_PATCH
          ? MODEL_PATCH[K] extends null
            ? never
            : K
          : K]: K extends keyof MODEL_PATCH
          ? Exclude<MODEL_PATCH[K], null>
          : K extends keyof MODELS
            ? MODELS[K]
            : never;
      },
      NEXT_PROGRAM_REQUIREMENTS,
      NEXT_PROGRAM_ERROR,
      IDENTITY['Type'],
      FAILURE
    >;
  },
): string extends NEXT_VERSION
  ? IContract
  : string extends keyof PAYLOAD
    ? IContract
    : IContract<
        COMMAND_NAME,
        {
          readonly [K in keyof PAYLOAD | keyof PATCH as K extends keyof PATCH
            ? PATCH[K] extends null
              ? never
              : K
            : K]: K extends keyof PATCH
            ? PATCH[K] extends infer DESCRIPTOR
              ? DESCRIPTOR extends IPayloadFieldDescriptor
                ? Readonly<DESCRIPTOR>
                : never
              : never
            : K extends keyof PAYLOAD
              ? PAYLOAD[K]
              : never;
        },
        NEXT_VERSION,
        NEXT_MUTATIONS,
        PAYLOADS & {
          [K in NEXT_VERSION]: {
            readonly [K in keyof PAYLOAD | keyof PATCH as K extends keyof PATCH
              ? PATCH[K] extends null
                ? never
                : K
              : K]: K extends keyof PATCH
              ? PATCH[K] extends infer DESCRIPTOR
                ? DESCRIPTOR extends IPayloadFieldDescriptor
                  ? Readonly<DESCRIPTOR>
                  : never
                : never
              : K extends keyof PAYLOAD
                ? PAYLOAD[K]
                : never;
          };
        },
        {
          readonly [K in
            | keyof MODELS
            | keyof MODEL_PATCH as K extends keyof MODEL_PATCH
            ? MODEL_PATCH[K] extends null
              ? never
              : K
            : K]: K extends keyof MODEL_PATCH
            ? Exclude<MODEL_PATCH[K], null>
            : K extends keyof MODELS
              ? MODELS[K]
              : never;
        },
        NEXT_PROGRAM_REQUIREMENTS | GUARD_REQUIREMENTS,
        NEXT_PROGRAM_ERROR,
        | HISTORICAL_PROGRAM_REQUIREMENTS
        | NEXT_PROGRAM_REQUIREMENTS
        | GUARD_REQUIREMENTS,
        FAILURE,
        FAILURES & { [K in NEXT_VERSION]: FAILURE },
        IDENTITY
      >;

export function upgradeContractVersion(
  contract: IContract,
  input: unknown,
): IContract {
  const props = Schema.decodeUnknownSync(
    Schema.Struct({
      ...MakeVersionPropsSchema.fields,
      models: Schema.optionalKey(
        Schema.Record(
          Schema.String,
          Schema.NullOr(
            Schema.declare(
              (input: unknown): input is IModel => input instanceof Model,
            ),
          ),
        ),
      ),
      payload: Schema.Record(
        Schema.String,
        Schema.NullOr(PayloadFieldDescriptorSchema),
      ),
      program: ContractProgramSchema,
      up: PayloadAdapterSchema,
      down: Schema.optionalKey(PayloadAdapterSchema),
    }),
    { onExcessProperty: 'error' },
  )(input);
  const commandName = contract.commandName;
  const payload = Schema.decodeUnknownSync(
    Schema.Record(Schema.String, PayloadFieldDescriptorSchema),
  )(contract.payload);
  const nextPayload = { ...payload };
  for (const [key, descriptor] of Object.entries(props.payload)) {
    if (descriptor === null) {
      if (!Object.hasOwn(payload, key)) {
        throw new Error(
          `Cannot remove unknown payload field "${key}" from ${commandName}`,
        );
      }
      delete nextPayload[key];
    } else {
      nextPayload[key] = descriptor;
    }
  }
  const models = { ...contract.models };
  for (const [key, model] of Object.entries(props.models ?? {})) {
    if (model === null) {
      if (!Object.hasOwn(models, key)) {
        throw new Error(
          `Cannot remove unknown model "${key}" from ${commandName}`,
        );
      }
      delete models[key];
    } else {
      models[key] = model;
    }
  }
  const { up, down } = props;
  let ancestor: IContract | undefined = contract;
  while (ancestor !== undefined) {
    if (ancestor.version === props.version) {
      throw new Error(`Duplicate contract version "${props.version}"`);
    }
    ancestor = ancestor.previous;
  }
  if (nextVersions.has(contract)) {
    throw new Error(
      `Contract "${commandName}@${contract.version}" already has a next version`,
    );
  }
  const next = makeVersion(
    defineContract(commandName),
    {
      models,
      payload: nextPayload,
      version: props.version,
      program: props.program,
      ...(props.identity === undefined ? {} : { identity: props.identity }),
      ...(props.guard === undefined ? {} : { guard: props.guard }),
      failures: props.failures ?? contract.failures,
    },
    props.failures === undefined ? contract.failures : undefined,
  );
  upgradeEdges.set(next, {
    parent: contract,
    up,
    ...(down === undefined ? {} : { down }),
  });
  nextVersions.set(contract, next);
  return next;
}
