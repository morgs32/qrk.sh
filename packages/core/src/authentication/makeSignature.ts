import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, JSONSchema, Schema } from 'effect';

const stableSemVerPattern =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u;

export function makeSignature<
  const VERSION extends string,
  CURRENT_SCHEMA extends Schema.Schema.AnyNoContext,
  const HISTORICAL_DEFINITIONS extends readonly Readonly<{
    version: string;
    schema: Schema.Schema.AnyNoContext;
    adaptSignature: (props: {
      signature: never;
    }) => Effect.Effect<unknown, IAnyError>;
  }>[],
>(
  props: Readonly<{
    version: VERSION;
    schema: CURRENT_SCHEMA;
  }>,
  historicalDefinitions: HISTORICAL_DEFINITIONS & {
    readonly [INDEX in keyof HISTORICAL_DEFINITIONS]: Readonly<{
      version: HISTORICAL_DEFINITIONS[INDEX]['version'];
      schema: HISTORICAL_DEFINITIONS[INDEX]['schema'];
      adaptSignature: (props: {
        signature: Schema.Schema.Type<HISTORICAL_DEFINITIONS[INDEX]['schema']>;
      }) => Effect.Effect<Schema.Schema.Type<CURRENT_SCHEMA>, IAnyError>;
    }>;
  },
) {
  if (!stableSemVerPattern.test(props.version)) {
    throw new Error(
      `makeSignature: version "${props.version}" must be stable SemVer major.minor.patch`,
    );
  }

  const definitionsByVersion = new Map<
    string,
    Readonly<{
      schema: Schema.Schema.AnyNoContext;
      adaptSignature?: (props: {
        signature: unknown;
      }) => Effect.Effect<unknown, IAnyError>;
    }>
  >([[props.version, { schema: props.schema }]]);

  for (const definition of historicalDefinitions) {
    if (!stableSemVerPattern.test(definition.version)) {
      throw new Error(
        `makeSignature: historical version "${definition.version}" must be stable SemVer major.minor.patch`,
      );
    }
    if (definitionsByVersion.has(definition.version)) {
      throw new Error(
        `makeSignature: duplicate signature version "${definition.version}"`,
      );
    }
    definitionsByVersion.set(definition.version, definition);
  }

  return {
    version: props.version,
    schema: props.schema,
    historicalDefinitions,
    spec: {
      version: props.version,
      schemaJsonSchema: JSONSchema.make(props.schema),
      historicalDefinitions: historicalDefinitions
        .map(definition => ({
          version: definition.version,
          schemaJsonSchema: JSONSchema.make(definition.schema),
        }))
        .toSorted((left, right) => left.version.localeCompare(right.version)),
    },
    decodeAndAdaptSignature: Effect.fn('decodeAndAdaptSignature')(
      function* (decodeProps: { version: string; signature: unknown }) {
        const definition = definitionsByVersion.get(decodeProps.version);
        if (definition === undefined) {
          return yield* new ZerospinError({
            code: 'authentication-signature-version-unsupported',
            message: `Authentication signature version "${decodeProps.version}" is unavailable`,
            extra: {
              currentVersion: props.version,
              sourceVersion: decodeProps.version,
            },
          });
        }

        const sourceSignature = yield* Schema.decodeUnknown(definition.schema)(
          decodeProps.signature,
          { onExcessProperty: 'error' },
        ).pipe(
          mapParseError({
            code: 'authentication-signature-invalid',
            prefix: `Failed to decode authentication signature version "${decodeProps.version}"`,
          }),
        );

        if (decodeProps.version === props.version) {
          return sourceSignature;
        }
        if (definition.adaptSignature === undefined) {
          return yield* new ZerospinError({
            code: 'authentication-signature-adapter-missing',
            message: `Authentication signature version "${decodeProps.version}" has no direct adapter to current version "${props.version}"`,
          });
        }

        const adaptSignature = definition.adaptSignature;
        const currentSignature = yield* Effect.suspend(() =>
          adaptSignature({ signature: sourceSignature }),
        );
        return yield* Schema.validate(props.schema)(currentSignature, {
          onExcessProperty: 'error',
        }).pipe(
          mapParseError({
            code: 'authentication-signature-adapter-output-invalid',
            prefix: `Adapted authentication signature did not match current version "${props.version}"`,
          }),
        );
      },
    ),
  };
}
