import { type IAnyError } from '@zerospin/error';
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

import type { IDb } from '../drizzle/types.ts';
import { Model } from '../models/makeModel.ts';
import type {
  IAnyModels,
  IModel,
  InferCommandPayload,
} from '../models/types.ts';

import { defineCommand, type Command } from './Command.ts';
import { makeModelMutations } from './makeModelMutations.ts';
import type {
  IAnyMutation,
  IContract,
  IContractBinding,
  IModelMutations,
} from './types.ts';

export type IMutations =
  | Readonly<Record<string, IAnyMutation>>
  | readonly IAnyMutation[]
  | IAnyMutation;

export type MutationValues<MUTATIONS> = MUTATIONS extends IAnyMutation
  ? MUTATIONS
  : MUTATIONS extends readonly (infer ITEM)[]
    ? ITEM
    : MUTATIONS extends object
      ? MUTATIONS[keyof MUTATIONS]
      : never;

type IsErasedPayloadShape<PAYLOAD extends IAnyShape> =
  string extends keyof PAYLOAD ? true : false;

export type InferContractProgram<
  PAYLOAD extends IAnyShape = IAnyShape,
  MUTATIONS = IMutations,
> = (props: {
  identityKey: string | null;
  payload: IsErasedPayloadShape<PAYLOAD> extends true
    ? // oxlint-disable-next-line typescript/no-explicit-any -- erased payload shape intentionally accepts any payload
      any
    : InferCommandPayload<PAYLOAD>;
}) => Effect.Effect<MUTATIONS, IAnyError>;

type IContractProgramFn<
  PAYLOAD extends IAnyShape,
  MUTATIONS,
  MODELS extends IAnyModels,
> = (props: {
  identityKey: string | null;
  models: { readonly [K in keyof MODELS]: IModelMutations<MODELS[K]> };
  payload: InferCommandPayload<PAYLOAD>;
}) => Effect.Effect<MUTATIONS, IAnyError>;

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

const noOpProgram = (_props: { payload: unknown }) => Effect.succeed({});

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
    identityKey: string | null;
    models: Readonly<Record<string, IModelMutations<IModel>>>;
  }) => Effect.Effect<IMutations, IAnyError> => typeof input === 'function',
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
  guard: Schema.optional(
    Schema.declare(
      (input: unknown): input is NonNullable<IContractBinding['guard']> =>
        typeof input === 'function',
    ),
  ),
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
  MUTATIONS extends IMutations,
  MODELS extends IAnyModels = Record<never, never>,
  GUARD_REQUIREMENTS = never,
  GUARD_DB extends Readonly<Pick<IDb, 'query'>> = Readonly<Pick<IDb, 'query'>>,
>(
  commandName: Command<COMMAND_NAME>,
  props: {
    models?: MODELS;
    payload: PAYLOAD;
    version: VERSION;
    guard?:
      | ((props: {
          payload: InferCommandPayload<PAYLOAD>;
          db: GUARD_DB;
          identityKey: string | null;
        }) => Effect.Effect<void, IAnyError, GUARD_REQUIREMENTS>)
      | undefined;
    program: IContractProgramFn<PAYLOAD, MUTATIONS, MODELS>;
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
  (props: {
    payload: InferCommandPayload<PAYLOAD>;
    db: GUARD_DB;
    identityKey: string | null;
  }) => Effect.Effect<void, IAnyError, GUARD_REQUIREMENTS>,
  MODELS
>;

export function makeContractVersion<
  COMMAND_NAME extends string,
  PAYLOAD extends Record<string, IPayloadFieldDescriptor>,
  const VERSION extends string,
  MODELS extends IAnyModels = Record<never, never>,
  GUARD_REQUIREMENTS = never,
  GUARD_DB extends Readonly<Pick<IDb, 'query'>> = Readonly<Pick<IDb, 'query'>>,
>(
  commandName: Command<COMMAND_NAME>,
  props: {
    models?: MODELS;
    payload: PAYLOAD;
    version: VERSION;
    guard?:
      | ((props: {
          payload: InferCommandPayload<PAYLOAD>;
          db: GUARD_DB;
          identityKey: string | null;
        }) => Effect.Effect<void, IAnyError, GUARD_REQUIREMENTS>)
      | undefined;
    program?: never;
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
  Record<string, never>,
  { [K in VERSION]: Readonly<PAYLOAD> },
  (props: {
    payload: InferCommandPayload<PAYLOAD>;
    db: GUARD_DB;
    identityKey: string | null;
  }) => Effect.Effect<void, IAnyError, GUARD_REQUIREMENTS>,
  MODELS
>;

/*
 * 1. Validate and snapshot the authored payload and program.
 * 2. Bind the authored program to this definition's model mutations.
 * 3. Expose authored content and the serializable specification.
 */
export function makeContractVersion(command: Command, props: unknown): unknown {
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
  const authoredProgram = decodedProps.program ?? noOpProgram;
  const program: IContract['program'] = ({ payload, identityKey }) =>
    authoredProgram({ payload, identityKey, models: modelMutations });
  // 3 — Expose authored content and the serializable specification.
  const spec = {
    commandName,
    version,
    payloadShape: encodeShape(payload),
    models: mapValues(models, model => structuredClone(model.spec)),
  };

  const fields: Omit<IContract, 'previous' | 'next' | 'up' | 'down'> = {
    models,
    commandName,
    payload,
    version,
    spec,
    program,
    ...(decodedProps.guard === undefined ? {} : { guard: decodedProps.guard }),
  };
  const contract = Object.assign(new Contract(), fields);
  return contract;
}

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
  HISTORICAL_GUARD_REQUIREMENTS,
  MODEL_PATCH extends Readonly<Record<string, IModel | null>> = Record<
    never,
    never
  >,
  NEXT_GUARD_REQUIREMENTS = never,
  NEXT_GUARD_DB extends Readonly<Pick<IDb, 'query'>> = Readonly<
    Pick<IDb, 'query'>
  >,
>(
  contract: IContract<
    COMMAND_NAME,
    PAYLOAD,
    VERSION,
    MUTATIONS,
    PAYLOADS,
    NonNullable<IContract['guard']>,
    MODELS,
    HISTORICAL_GUARD_REQUIREMENTS
  >,
  props: {
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
    guard?:
      | ((
          props: Parameters<
            InferContractProgram<{
              readonly [K in
                | keyof PAYLOAD
                | keyof PATCH as K extends keyof PATCH
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
            }>
          >[0] & { db: NEXT_GUARD_DB; identityKey: string | null },
        ) => Effect.Effect<void, IAnyError, NEXT_GUARD_REQUIREMENTS>)
      | undefined;
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
      }
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
        (
          props: Parameters<
            InferContractProgram<{
              readonly [K in
                | keyof PAYLOAD
                | keyof PATCH as K extends keyof PATCH
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
            }>
          >[0] & { db: NEXT_GUARD_DB; identityKey: string | null },
        ) => Effect.Effect<void, IAnyError, NEXT_GUARD_REQUIREMENTS>,
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
        HISTORICAL_GUARD_REQUIREMENTS | NEXT_GUARD_REQUIREMENTS
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
  const next = makeContractVersion(defineCommand(commandName), {
    models,
    payload: nextPayload,
    version: props.version,
    program: props.program,
    ...(props.guard === undefined ? {} : { guard: props.guard }),
  });
  upgradeEdges.set(next, {
    parent: contract,
    up,
    ...(down === undefined ? {} : { down }),
  });
  nextVersions.set(contract, next);
  return next;
}
