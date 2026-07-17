import { mapParseError, type IAnyError } from '@zerospin/error';
import { Effect, JSONSchema, Schema } from 'effect';
import { type BrandTypeId } from 'effect/Brand';

import { PrimitiveKind } from '../models/primitiveKind.ts';
import { makeEffectSchema } from '../models/primitiveMaps.ts';
import type {
  IAnyRefDescriptor,
  IAnyShape,
  InferCommandPayload,
  InferPayloadInput,
  IPrimaryKeyDescriptor,
  IPrimitiveDescriptor,
} from '../models/types.ts';
import type { CuidFactory } from '../services/CuidFactory.ts';
import type { ITypeError } from '../utils/types.ts';

import type { IAnyMutation, IContract } from './types.ts';

type IAnyMutationProgramFn = (
  // oxlint-disable-next-line typescript/no-explicit-any -- type-level inference across contract program variants
  props: any,
  // oxlint-disable-next-line typescript/no-explicit-any -- type-level inference across contract program variants
) => Effect.Effect<any, any, any>;

export type IMutations =
  | Readonly<Record<string, IAnyMutation>>
  | readonly IAnyMutation[]
  | IAnyMutation;

export type MutationValues<MUTATIONS> =
  MUTATIONS extends IAnyMutation
    ? MUTATIONS
    : MUTATIONS extends readonly (infer ITEM)[]
      ? ITEM
      : MUTATIONS extends object
        ? MUTATIONS[keyof MUTATIONS]
        : never;

type IsErasedPayloadShape<PAYLOAD extends IAnyShape> = IAnyShape extends PAYLOAD
  ? true
  : false;

export type InferContractProgram<
  PAYLOAD extends IAnyShape = IAnyShape,
  MUTATIONS = IMutations,
> = {
  [BrandTypeId]: 'program';
} & ((props: {
  payload: IsErasedPayloadShape<PAYLOAD> extends true
    ? // oxlint-disable-next-line typescript/no-explicit-any -- erased payload shape intentionally accepts any payload
      any
    : InferCommandPayload<PAYLOAD>;
}) => Effect.Effect<MUTATIONS, IAnyError>);

type IContractProgramFn<PAYLOAD extends IAnyShape, MUTATIONS> = (props: {
  payload: InferCommandPayload<PAYLOAD>;
}) => Effect.Effect<MUTATIONS, IAnyError>;

type InferContractValidatePayload<PAYLOAD extends IAnyShape> = {
  [BrandTypeId]: 'validatePayload';
} & ((props: {
  payload: InferPayloadInput<PAYLOAD>;
}) => Effect.Effect<InferCommandPayload<PAYLOAD>, IAnyError, CuidFactory>);

type InferContractEncodePayload<PAYLOAD extends IAnyShape> = {
  [BrandTypeId]: 'encodePayload';
} & ((props: {
  payload: InferCommandPayload<PAYLOAD>;
}) => Effect.Effect<string, IAnyError>);

type InferContractDecodePayload<PAYLOAD extends IAnyShape> = {
  [BrandTypeId]: 'decodePayload';
} & ((props: {
  command: {
    readonly commandName: string;
    readonly id: string;
    readonly payload: string;
  };
}) => Effect.Effect<InferCommandPayload<PAYLOAD>, IAnyError>);

/**
 * Contract payload fields only — excludes {@link IAnyRefDescriptor}.
 *
 * `primitives.ref()` belongs on persisted table/model attributes. Its concrete
 * table and relation metadata are not command input.
 *
 * `Model.primaryKey({ autogenerate })` is the payload-only model identity
 * boundary. Raw table primary keys are deliberately excluded.
 */
type IPayloadFieldDescriptor =
  | Exclude<
      IPrimitiveDescriptor,
      IAnyRefDescriptor | IPrimaryKeyDescriptor
    >
  | (IPrimaryKeyDescriptor & {
      autogenerate: boolean;
      modelName: string;
    });

const noOpProgram = (_props: { payload: unknown }) => Effect.succeed({});

export function makeContract<
  COMMAND_NAME extends string,
  PAYLOAD extends Record<string, IPayloadFieldDescriptor>,
  VERSION extends string,
  MUTATIONS_SCHEMA extends Schema.Schema.AnyNoContext,
>(props: {
  commandName: COMMAND_NAME;
  payload: PAYLOAD;
  version: VERSION;
  mutations: MUTATIONS_SCHEMA &
    ([MutationValues<Schema.Schema.Type<MUTATIONS_SCHEMA>>] extends [never]
      ? ITypeError<`Contract "${COMMAND_NAME}" mutations schema must contain mutations`>
      : MutationValues<
            Schema.Schema.Type<MUTATIONS_SCHEMA>
          > extends IAnyMutation
        ? unknown
        : ITypeError<`Contract "${COMMAND_NAME}" mutations schema must contain mutations only`>);
  program: IContractProgramFn<
    PAYLOAD,
    Schema.Schema.Type<MUTATIONS_SCHEMA>
  >;
}): IContract<COMMAND_NAME, PAYLOAD, VERSION, MUTATIONS_SCHEMA>;

export function makeContract<
  COMMAND_NAME extends string,
  PAYLOAD extends Record<string, IPayloadFieldDescriptor>,
  VERSION extends string,
>(props: {
  commandName: COMMAND_NAME;
  payload: PAYLOAD;
  version: VERSION;
  mutations: null;
  program?: never;
}): IContract<COMMAND_NAME, PAYLOAD, VERSION, null>;

export function makeContract<
  COMMAND_NAME extends string,
  PAYLOAD extends Record<string, IPayloadFieldDescriptor>,
  VERSION extends string,
  MUTATIONS_SCHEMA extends Schema.Schema.AnyNoContext | null,
>(props: {
  commandName: COMMAND_NAME;
  payload: PAYLOAD;
  version: VERSION;
  mutations: MUTATIONS_SCHEMA;
  program?: IAnyMutationProgramFn;
}): IContract<COMMAND_NAME, PAYLOAD, VERSION, MUTATIONS_SCHEMA> {
  const { commandName, payload, version, mutations } = props;

  if (mutations === null && props.program !== undefined) {
    throw new Error(
      `makeContract: contract "${commandName}" declares mutations: null and must omit program`,
    );
  }

  if (mutations !== null && props.program === undefined) {
    throw new Error(
      `makeContract: contract "${commandName}" declares a mutations schema and requires program`,
    );
  }

  const program = mutations === null ? noOpProgram : props.program;

  const payloadSchema = makeEffectSchema(payload);
  const payloadJsonSchema = Schema.parseJson(payloadSchema) as Schema.Schema<
    // oxlint-disable-next-line typescript/no-explicit-any -- Effect Schema is contravariant; unknown breaks assignability?
    any,
    string
  >;

  const validatePayload = Effect.fn(`validatePayload/${commandName}`)(
    function* (props: { payload: InferPayloadInput<PAYLOAD> }) {
      const encodedPayload: Record<string, unknown> = { ...props.payload };
      for (const [key, descriptor] of Object.entries(payload)) {
        if (descriptor.kind !== PrimitiveKind.Json) {
          continue;
        }
        const value = encodedPayload[key];
        if (value === null || value === undefined) {
          continue;
        }
        encodedPayload[key] = yield* Schema.encode(
          Schema.parseJson(descriptor.schema),
        )(value).pipe(
          mapParseError({
            code: 'encode-command-json-payload-field-failed',
            prefix: `Failed to encode JSON payload field "${key}" for command "${commandName}"`,
          }),
        );
      }
      const decoded = yield* Schema.decodeUnknown(payloadSchema)(
        encodedPayload,
        {
          onExcessProperty: 'error',
        },
      ).pipe(
        mapParseError({
          code: 'validate-command-payload-failed',
          prefix: `Failed to validate payload for command "${commandName}"`,
        }),
      );

      return decoded as InferCommandPayload<PAYLOAD>;
    },
  );

  const encodePayload = Effect.fn(`encodePayload/${commandName}`)(
    function* (props: { payload: InferCommandPayload<PAYLOAD> }) {
      return yield* Schema.encode(payloadJsonSchema)(props.payload, {
        onExcessProperty: 'error',
      }).pipe(
        mapParseError({
          code: 'encode-command-payload-failed',
          prefix: `Failed to encode payload for command "${commandName}"`,
        }),
      );
    },
  );

  const decodePayload = Effect.fn(`decodePayload/${commandName}`)(
    function* (props: {
      command: {
        readonly commandName: string;
        readonly id: string;
        readonly payload: string;
      };
    }) {
      const { command } = props;

      return yield* Schema.decode(payloadJsonSchema)(command.payload, {
        onExcessProperty: 'error',
      }).pipe(
        mapParseError({
          code: 'decode-command-payload-failed',
          extra: { commandId: command.id, commandName: command.commandName },
          prefix: `Failed to decode payload for command "${command.commandName}"`,
        }),
      );
    },
  );

  const spec = {
    commandName,
    version,
    payloadJsonSchema: JSONSchema.make(payloadSchema),
  };

  return {
    commandName,
    payload,
    decodePayload: decodePayload as InferContractDecodePayload<PAYLOAD>,
    encodePayload: encodePayload as InferContractEncodePayload<PAYLOAD>,
    validatePayload:
      validatePayload as unknown as InferContractValidatePayload<PAYLOAD>,
    mutations,
    program: program as InferContractProgram<
      PAYLOAD,
      MUTATIONS_SCHEMA extends Schema.Schema.AnyNoContext
        ? Schema.Schema.Type<MUTATIONS_SCHEMA>
        : Record<string, never>
    >,
    version,
    spec,
  };
}
