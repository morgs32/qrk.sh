import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
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
  | Exclude<IPrimitiveDescriptor, IAnyRefDescriptor | IPrimaryKeyDescriptor>
  | (IPrimaryKeyDescriptor & {
      autogenerate: boolean;
      modelName: string;
    });

const noOpProgram = (_props: { payload: unknown }) => Effect.succeed({});

const semVerPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/* oxlint-disable typescript/no-explicit-any -- historical adapter requirements stay generic across authored contracts */
export function makeContract<
  COMMAND_NAME extends string,
  PAYLOAD extends Record<string, IPayloadFieldDescriptor>,
  VERSION extends string,
  MUTATIONS_SCHEMA extends Schema.Schema.AnyNoContext,
  const HISTORICAL_PAYLOADS extends readonly Record<
    string,
    IPayloadFieldDescriptor
  >[] = readonly [],
>(
  props: {
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
    program: IContractProgramFn<PAYLOAD, Schema.Schema.Type<MUTATIONS_SCHEMA>>;
  },
  historicalDefinitions?: {
    readonly [INDEX in keyof HISTORICAL_PAYLOADS]: Readonly<{
      commandName: COMMAND_NAME;
      version: string;
      payload: HISTORICAL_PAYLOADS[INDEX];
      adaptPayload: (props: {
        payload: InferCommandPayload<HISTORICAL_PAYLOADS[INDEX]>;
      }) => Effect.Effect<InferCommandPayload<PAYLOAD>, IAnyError>;
    }>;
  },
): IContract<
  COMMAND_NAME,
  PAYLOAD,
  VERSION,
  MUTATIONS_SCHEMA,
  {
    readonly [INDEX in keyof HISTORICAL_PAYLOADS]: Readonly<{
      commandName: COMMAND_NAME;
      version: string;
      payload: HISTORICAL_PAYLOADS[INDEX];
      adaptPayload: (props: {
        payload: InferCommandPayload<HISTORICAL_PAYLOADS[INDEX]>;
      }) => Effect.Effect<InferCommandPayload<PAYLOAD>, IAnyError>;
    }>;
  }
>;

export function makeContract<
  COMMAND_NAME extends string,
  PAYLOAD extends Record<string, IPayloadFieldDescriptor>,
  VERSION extends string,
  const HISTORICAL_PAYLOADS extends readonly Record<
    string,
    IPayloadFieldDescriptor
  >[] = readonly [],
>(
  props: {
    commandName: COMMAND_NAME;
    payload: PAYLOAD;
    version: VERSION;
    mutations: null;
    program?: never;
  },
  historicalDefinitions?: {
    readonly [INDEX in keyof HISTORICAL_PAYLOADS]: Readonly<{
      commandName: COMMAND_NAME;
      version: string;
      payload: HISTORICAL_PAYLOADS[INDEX];
      adaptPayload: (props: {
        payload: InferCommandPayload<HISTORICAL_PAYLOADS[INDEX]>;
      }) => Effect.Effect<InferCommandPayload<PAYLOAD>, IAnyError>;
    }>;
  },
): IContract<
  COMMAND_NAME,
  PAYLOAD,
  VERSION,
  null,
  {
    readonly [INDEX in keyof HISTORICAL_PAYLOADS]: Readonly<{
      commandName: COMMAND_NAME;
      version: string;
      payload: HISTORICAL_PAYLOADS[INDEX];
      adaptPayload: (props: {
        payload: InferCommandPayload<HISTORICAL_PAYLOADS[INDEX]>;
      }) => Effect.Effect<InferCommandPayload<PAYLOAD>, IAnyError>;
    }>;
  }
>;

export function makeContract<
  PAYLOAD extends Record<string, IPayloadFieldDescriptor>,
  MUTATIONS_SCHEMA extends Schema.Schema.AnyNoContext | null,
>(props: any, historicalDefinitions: readonly any[] = []): any {
  /* oxlint-enable typescript/no-explicit-any */
  const {
    commandName,
    payload,
    version,
    mutations,
  }: {
    commandName: string;
    payload: Record<string, IPayloadFieldDescriptor>;
    version: string;
    mutations: Schema.Schema.AnyNoContext | null;
  } = props;

  const currentVersionMatch = semVerPattern.exec(version);
  if (currentVersionMatch === null) {
    throw new Error(
      `Invalid contract version "${version}" for "${commandName}": expected SemVer`,
    );
  }

  const currentMajor = Number(currentVersionMatch[1]);
  const currentMinor = Number(currentVersionMatch[2]);
  const currentPatch = Number(currentVersionMatch[3]);
  if (
    !Number.isSafeInteger(currentMajor) ||
    !Number.isSafeInteger(currentMinor) ||
    !Number.isSafeInteger(currentPatch)
  ) {
    throw new Error(
      `Invalid contract version "${version}" for "${commandName}": expected SemVer`,
    );
  }

  const historicalVersions = new Set<string>();
  const historicalSpecs = historicalDefinitions.map(historicalDefinition => {
    if (historicalDefinition.commandName !== commandName) {
      throw new Error(
        `Historical contract version "${historicalDefinition.version}" has commandName "${historicalDefinition.commandName}", not "${commandName}"`,
      );
    }
    if (typeof historicalDefinition.adaptPayload !== 'function') {
      throw new Error(
        `Historical contract version "${historicalDefinition.version}" for "${commandName}" requires adaptPayload`,
      );
    }

    const historicalVersionMatch = semVerPattern.exec(
      historicalDefinition.version,
    );
    if (historicalVersionMatch === null) {
      throw new Error(
        `Invalid historical contract version "${historicalDefinition.version}" for "${commandName}": expected SemVer`,
      );
    }
    if (historicalDefinition.version === version) {
      throw new Error(
        `Historical contract version "${historicalDefinition.version}" duplicates the current version for "${commandName}"`,
      );
    }
    if (historicalVersions.has(historicalDefinition.version)) {
      throw new Error(
        `Duplicate historical contract version "${historicalDefinition.version}" for "${commandName}"`,
      );
    }
    historicalVersions.add(historicalDefinition.version);

    const historicalMajor = Number(historicalVersionMatch[1]);
    const historicalMinor = Number(historicalVersionMatch[2]);
    const historicalPatch = Number(historicalVersionMatch[3]);
    if (
      !Number.isSafeInteger(historicalMajor) ||
      !Number.isSafeInteger(historicalMinor) ||
      !Number.isSafeInteger(historicalPatch)
    ) {
      throw new Error(
        `Invalid historical contract version "${historicalDefinition.version}" for "${commandName}": expected SemVer`,
      );
    }

    let historicalIsOlder = historicalMajor < currentMajor;
    let versionsHaveEqualPrecedence = historicalMajor === currentMajor;
    if (versionsHaveEqualPrecedence) {
      historicalIsOlder = historicalMinor < currentMinor;
      versionsHaveEqualPrecedence = historicalMinor === currentMinor;
    }
    if (versionsHaveEqualPrecedence) {
      historicalIsOlder = historicalPatch < currentPatch;
      versionsHaveEqualPrecedence = historicalPatch === currentPatch;
    }

    if (versionsHaveEqualPrecedence) {
      const historicalPrerelease = historicalVersionMatch[4];
      const currentPrerelease = currentVersionMatch[4];
      if (
        historicalPrerelease !== undefined &&
        currentPrerelease === undefined
      ) {
        historicalIsOlder = true;
        versionsHaveEqualPrecedence = false;
      } else if (
        historicalPrerelease === undefined &&
        currentPrerelease !== undefined
      ) {
        historicalIsOlder = false;
        versionsHaveEqualPrecedence = false;
      } else if (
        historicalPrerelease !== undefined &&
        currentPrerelease !== undefined
      ) {
        const historicalIdentifiers = historicalPrerelease.split('.');
        const currentIdentifiers = currentPrerelease.split('.');
        let identifierIndex = 0;
        while (
          identifierIndex < historicalIdentifiers.length &&
          identifierIndex < currentIdentifiers.length &&
          versionsHaveEqualPrecedence
        ) {
          const historicalIdentifier = historicalIdentifiers[identifierIndex];
          const currentIdentifier = currentIdentifiers[identifierIndex];
          if (
            historicalIdentifier !== undefined &&
            currentIdentifier !== undefined &&
            historicalIdentifier !== currentIdentifier
          ) {
            const historicalIsNumeric = /^(0|[1-9]\d*)$/.test(
              historicalIdentifier,
            );
            const currentIsNumeric = /^(0|[1-9]\d*)$/.test(currentIdentifier);
            if (historicalIsNumeric && !currentIsNumeric) {
              historicalIsOlder = true;
            } else if (!historicalIsNumeric && currentIsNumeric) {
              historicalIsOlder = false;
            } else if (historicalIsNumeric && currentIsNumeric) {
              historicalIsOlder =
                historicalIdentifier.length < currentIdentifier.length ||
                (historicalIdentifier.length === currentIdentifier.length &&
                  historicalIdentifier < currentIdentifier);
            } else {
              historicalIsOlder = historicalIdentifier < currentIdentifier;
            }
            versionsHaveEqualPrecedence = false;
          }
          identifierIndex += 1;
        }
        if (versionsHaveEqualPrecedence) {
          historicalIsOlder =
            historicalIdentifiers.length < currentIdentifiers.length;
          versionsHaveEqualPrecedence =
            historicalIdentifiers.length === currentIdentifiers.length;
        }
      }
    }

    if (!historicalIsOlder || versionsHaveEqualPrecedence) {
      throw new Error(
        `Historical contract version "${historicalDefinition.version}" for "${commandName}" must be older than current version "${version}"`,
      );
    }

    return {
      commandName: historicalDefinition.commandName,
      version: historicalDefinition.version,
      payloadJsonSchema: JSONSchema.make(
        makeEffectSchema(historicalDefinition.payload),
      ),
    };
  });

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
  const payloadSchemasByVersion = new Map<string, Schema.Schema.AnyNoContext>([
    [version, payloadJsonSchema],
  ]);
  for (const historicalDefinition of historicalDefinitions) {
    payloadSchemasByVersion.set(
      historicalDefinition.version,
      Schema.parseJson(makeEffectSchema(historicalDefinition.payload)),
    );
  }

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

  const decodeAndAdaptPayload = Effect.fn(
    `decodeAndAdaptPayload/${commandName}`,
  )(function* (props: {
    command: {
      readonly commandName: string;
      readonly contractVersion: string;
      readonly id: string;
      readonly payload: string;
    };
  }) {
    const { command } = props;

    if (command.commandName !== commandName) {
      return yield* new ZerospinError({
        code: 'contract-command-name-mismatch',
        message: `Contract "${commandName}" cannot decode command "${command.commandName}"`,
        extra: {
          commandId: command.id,
          commandName: command.commandName,
          contractName: commandName,
        },
      });
    }

    const sourcePayloadSchema = payloadSchemasByVersion.get(
      command.contractVersion,
    );
    if (sourcePayloadSchema === undefined) {
      return yield* new ZerospinError({
        code: 'contract-payload-version-unsupported',
        message: `Contract "${commandName}" does not support payload version "${command.contractVersion}"`,
        extra: {
          commandId: command.id,
          commandName,
          currentVersion: version,
          sourceVersion: command.contractVersion,
        },
      });
    }

    const sourcePayload = yield* Schema.decode(sourcePayloadSchema)(
      command.payload,
      { onExcessProperty: 'error' },
    ).pipe(
      mapParseError({
        code:
          command.contractVersion === version
            ? 'decode-command-payload-failed'
            : 'decode-historical-command-payload-failed',
        extra: {
          commandId: command.id,
          commandName,
          sourceVersion: command.contractVersion,
        },
        prefix: `Failed to decode payload for command "${commandName}" at version "${command.contractVersion}"`,
      }),
    );

    if (command.contractVersion === version) {
      return sourcePayload;
    }

    const historicalDefinition = historicalDefinitions.find(
      definition => definition.version === command.contractVersion,
    );
    if (historicalDefinition === undefined) {
      return yield* new ZerospinError({
        code: 'contract-payload-adapter-missing',
        message: `Contract "${commandName}" has no direct payload adapter from version "${command.contractVersion}" to current version "${version}"`,
        extra: {
          commandId: command.id,
          commandName,
          currentVersion: version,
          sourceVersion: command.contractVersion,
        },
      });
    }

    const currentPayload = yield* Effect.suspend(() =>
      historicalDefinition.adaptPayload({ payload: sourcePayload }),
    ).pipe(
      Effect.catchAllCause(
        cause =>
          new ZerospinError({
            code: 'contract-payload-adapter-invariant-failed',
            message: `Direct payload adapter from ${commandName}@${command.contractVersion} to ${commandName}@${version} failed`,
            cause: ZerospinError.prettyUnknownFailure(cause),
            extra: {
              commandId: command.id,
              commandName,
              currentVersion: version,
              sourceVersion: command.contractVersion,
            },
          }),
      ),
    );

    return yield* Schema.validate(payloadSchema)(currentPayload, {
      onExcessProperty: 'error',
    }).pipe(
      mapParseError({
        code: 'contract-payload-adapter-output-invariant-failed',
        prefix: `Payload adapter output did not match ${commandName}@${version}`,
        extra: {
          commandId: command.id,
          commandName,
          currentVersion: version,
          sourceVersion: command.contractVersion,
        },
      }),
    );
  });

  const spec = {
    commandName,
    version,
    payloadJsonSchema: JSONSchema.make(payloadSchema),
    historicalDefinitions: historicalSpecs.toSorted((left, right) =>
      left.version.localeCompare(right.version),
    ),
  };

  return {
    commandName,
    payload,
    historicalDefinitions,
    decodeAndAdaptPayload,
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
