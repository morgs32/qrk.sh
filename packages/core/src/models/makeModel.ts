import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import {
  descriptorToJsonEffectSchema,
  isAttributeDescriptor,
  makeDrizzleSchemaFromTable,
  makeEffectSchema,
  makeIdFromAbbreviation,
  makeTable,
  PrimitiveKind,
  primitives,
  type IDrizzleIndexConfig,
  type IDrizzleSchema,
  type InferDecodedRow,
  type IPrimaryKeyDescriptor,
  type IShape,
  type ITypeError,
} from '@zerospin/schema';
import { Effect, Schema, SchemaTransformation, Struct } from 'effect';
import { mapValues } from 'es-toolkit';
/* oxlint-disable typescript/no-explicit-any -- complete resolved definitions span model-specific resource shapes */

import type {
  IModel,
  IModelReplica,
  InferAttributesSchema,
  InferProperties,
  IResourceShape,
} from './types.ts';

type IReservedKeys =
  // Framework property keys that are not allowed as user attributes.
  | 'aggregateIndex'
  | 'createdAt'
  | 'deletedAt'
  | 'id'
  | 'modelName'
  | 'updatedAt'
  | 'version'
  // SQLite keywords (https://sqlite.org/lang_keywords.html), lowercased.
  | 'abort'
  | 'action'
  | 'add'
  | 'after'
  | 'all'
  | 'alter'
  | 'always'
  | 'analyze'
  | 'and'
  | 'as'
  | 'asc'
  | 'attach'
  | 'autoincrement'
  | 'before'
  | 'begin'
  | 'between'
  | 'by'
  | 'cascade'
  | 'case'
  | 'cast'
  | 'check'
  | 'collate'
  | 'column'
  | 'commit'
  | 'conflict'
  | 'constraint'
  | 'create'
  | 'cross'
  | 'current'
  | 'current_date'
  | 'current_time'
  | 'current_timestamp'
  | 'database'
  | 'default'
  | 'deferrable'
  | 'deferred'
  | 'delete'
  | 'desc'
  | 'detach'
  | 'distinct'
  | 'do'
  | 'drop'
  | 'each'
  | 'else'
  | 'end'
  | 'escape'
  | 'except'
  | 'exclude'
  | 'exclusive'
  | 'exists'
  | 'explain'
  | 'fail'
  | 'filter'
  | 'first'
  | 'following'
  | 'for'
  | 'foreign'
  | 'from'
  | 'full'
  | 'generated'
  | 'glob'
  | 'group'
  | 'groups'
  | 'having'
  | 'if'
  | 'ignore'
  | 'immediate'
  | 'in'
  | 'index'
  | 'indexed'
  | 'initially'
  | 'inner'
  | 'insert'
  | 'instead'
  | 'intersect'
  | 'into'
  | 'is'
  | 'isnull'
  | 'join'
  | 'key'
  | 'last'
  | 'left'
  | 'like'
  | 'limit'
  | 'match'
  | 'materialized'
  | 'natural'
  | 'no'
  | 'not'
  | 'nothing'
  | 'notnull'
  | 'null'
  | 'nulls'
  | 'of'
  | 'offset'
  | 'on'
  | 'or'
  | 'order'
  | 'others'
  | 'outer'
  | 'over'
  | 'partition'
  | 'plan'
  | 'pragma'
  | 'preceding'
  | 'primary'
  | 'query'
  | 'raise'
  | 'range'
  | 'recursive'
  | 'references'
  | 'regexp'
  | 'reindex'
  | 'release'
  | 'rename'
  | 'replace'
  | 'restrict'
  | 'returning'
  | 'right'
  | 'rollback'
  | 'row'
  | 'rows'
  | 'savepoint'
  | 'select'
  | 'set'
  | 'table'
  | 'temp'
  | 'temporary'
  | 'then'
  | 'ties'
  | 'to'
  | 'transaction'
  | 'trigger'
  | 'unbounded'
  | 'union'
  | 'unique'
  | 'update'
  | 'using'
  | 'vacuum'
  | 'values'
  | 'view'
  | 'virtual'
  | 'when'
  | 'where'
  | 'window'
  | 'with'
  | 'without';

export function makeModel<
  MODEL_NAME extends string,
  ABBREVIATION extends string,
  ATTRIBUTES extends IShape,
  const VERSION extends string,
  const HISTORICAL_DEFINITIONS extends readonly Readonly<{
    readonly abbreviation: ABBREVIATION;
    readonly attributes: IShape;
    readonly adaptResource: (props: {
      resource: InferDecodedRow<InferProperties<ATTRIBUTES, ABBREVIATION>>;
    }) => Effect.Effect<unknown, IAnyError>;
    readonly indexes: readonly IDrizzleIndexConfig<string>[];
    readonly modelName: MODEL_NAME;
    readonly version: string;
  }>[] = readonly [],
>(
  props: {
    abbreviation: ABBREVIATION;
    modelName: MODEL_NAME;
    attributes: ATTRIBUTES & {
      [K in keyof ATTRIBUTES &
        string]: ATTRIBUTES[K] extends IPrimaryKeyDescriptor
        ? ITypeError<`Attribute "${K}" on makeModel cannot be a primary key because makeModel synthesizes the model id primary key`>
        : ATTRIBUTES[K] extends { autogenerate: boolean }
          ? ITypeError<`Attribute "${K}" on makeModel cannot autogenerate because autogeneration belongs to contract payload primary keys`>
          : ATTRIBUTES[K];
    } & {
      [K in IReservedKeys]?: never;
    };
    indexes: readonly IDrizzleIndexConfig<
      keyof InferProperties<ATTRIBUTES, ABBREVIATION> & string
    >[];
    version: VERSION;
  },
  historicalDefinitions?: HISTORICAL_DEFINITIONS & {
    readonly [INDEX in keyof HISTORICAL_DEFINITIONS]: Readonly<{
      abbreviation: ABBREVIATION;
      attributes: HISTORICAL_DEFINITIONS[INDEX]['attributes'];
      adaptResource: (props: {
        resource: InferDecodedRow<InferProperties<ATTRIBUTES, ABBREVIATION>>;
      }) => Effect.Effect<
        InferDecodedRow<
          InferProperties<
            HISTORICAL_DEFINITIONS[INDEX]['attributes'],
            ABBREVIATION
          >
        >,
        IAnyError
      >;
      indexes: readonly IDrizzleIndexConfig<
        keyof InferProperties<
          HISTORICAL_DEFINITIONS[INDEX]['attributes'],
          ABBREVIATION
        > &
          string
      >[];
      modelName: MODEL_NAME;
      version: HISTORICAL_DEFINITIONS[INDEX]['version'];
    }>;
  },
): IModel<
  ATTRIBUTES,
  ABBREVIATION,
  MODEL_NAME,
  VERSION,
  {
    readonly [INDEX in keyof HISTORICAL_DEFINITIONS]: Readonly<{
      abbreviation: ABBREVIATION;
      attributes: HISTORICAL_DEFINITIONS[INDEX]['attributes'];
      adaptResource: (props: {
        resource: InferDecodedRow<InferProperties<ATTRIBUTES, ABBREVIATION>>;
      }) => Effect.Effect<
        InferDecodedRow<
          InferProperties<
            HISTORICAL_DEFINITIONS[INDEX]['attributes'],
            ABBREVIATION
          >
        >,
        IAnyError
      >;
      indexes: readonly IDrizzleIndexConfig<
        keyof InferProperties<
          HISTORICAL_DEFINITIONS[INDEX]['attributes'],
          ABBREVIATION
        > &
          string
      >[];
      modelName: MODEL_NAME;
      propertiesShape: InferProperties<
        HISTORICAL_DEFINITIONS[INDEX]['attributes'],
        ABBREVIATION
      >;
      version: HISTORICAL_DEFINITIONS[INDEX]['version'];
    }>;
  },
  InferProperties<ATTRIBUTES, ABBREVIATION>
>;

export function makeModel<
  MODEL_NAME extends string,
  ABBREVIATION extends string,
  ATTRIBUTES extends IShape,
  PROPERTIES_SHAPE extends InferProperties<ATTRIBUTES, ABBREVIATION>,
  const VERSION extends string,
  const HISTORICAL_DEFINITIONS extends readonly {
    readonly abbreviation: ABBREVIATION;
    readonly attributes: IShape;
    readonly adaptResource: IModel['historicalDefinitions'][number]['adaptResource'];
    readonly indexes: readonly IDrizzleIndexConfig<string>[];
    readonly modelName: MODEL_NAME;
    readonly propertiesShape: IShape;
    readonly version: string;
  }[] = readonly [],
>(
  props: {
    abbreviation: ABBREVIATION;
    modelName: MODEL_NAME;
    attributes: ATTRIBUTES & {
      [K in keyof ATTRIBUTES &
        string]: ATTRIBUTES[K] extends IPrimaryKeyDescriptor
        ? ITypeError<`Attribute "${K}" on makeModel cannot be a primary key because makeModel synthesizes the model id primary key`>
        : ATTRIBUTES[K] extends { autogenerate: boolean }
          ? ITypeError<`Attribute "${K}" on makeModel cannot autogenerate because autogeneration belongs to contract payload primary keys`>
          : ATTRIBUTES[K];
    } & {
      [K in IReservedKeys]?: never;
    };
    propertiesShape: PROPERTIES_SHAPE;
    indexes: readonly IDrizzleIndexConfig<keyof PROPERTIES_SHAPE & string>[];
    version: VERSION;
  },
  historicalDefinitions?: HISTORICAL_DEFINITIONS,
): IModel<
  ATTRIBUTES,
  ABBREVIATION,
  MODEL_NAME,
  VERSION,
  HISTORICAL_DEFINITIONS,
  PROPERTIES_SHAPE
>;

export function makeModel<
  MODEL_NAME extends string,
  ABBREVIATION extends string,
  ATTRIBUTES extends IShape,
>(
  props: {
    abbreviation: ABBREVIATION;
    modelName: MODEL_NAME;
    attributes: ATTRIBUTES;
    propertiesShape?: IShape;
    indexes: readonly IDrizzleIndexConfig<string>[];
    version: string;
  },
  historicalDefinitions: readonly {
    readonly abbreviation: string;
    readonly attributes: IShape;
    readonly adaptResource: (props: {
      resource: any;
    }) => Effect.Effect<any, IAnyError>;
    readonly indexes: readonly IDrizzleIndexConfig<string>[];
    readonly modelName: string;
    readonly propertiesShape?: IShape;
    readonly version: string;
  }[] = [],
): IModel {
  const {
    abbreviation,
    modelName,
    attributes: declaredAttributes,
    indexes,
    version,
  } = props;
  const standardProperties = {
    id: primitives.primaryKey({ abbreviation }),
    modelName: primitives.text({ nullable: false }),
    createdAt: primitives.date({ nullable: false }),
    updatedAt: primitives.date({ nullable: false }),
    version: primitives.text({ nullable: false }),
  };
  const propertiesShape = props.propertiesShape ?? {
    ...standardProperties,
    ...declaredAttributes,
  };
  const resolvedHistoricalDefinitions = historicalDefinitions.map(
    definition => ({
      ...definition,
      propertiesShape: definition.propertiesShape ?? {
        ...standardProperties,
        ...definition.attributes,
      },
    }),
  );
  const currentVersionMatch =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(
      version,
    );
  if (currentVersionMatch === null) {
    throw new Error(
      `Invalid model version "${version}" for "${modelName}": expected SemVer`,
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
      `Invalid model version "${version}" for "${modelName}": expected SemVer`,
    );
  }

  const definitionsByVersion = new Map<
    string,
    {
      readonly abbreviation: string;
      readonly attributes: IShape;
      readonly adaptResource?: (typeof historicalDefinitions)[number]['adaptResource'];
      readonly indexes: readonly IDrizzleIndexConfig<string>[];
      readonly modelName: string;
      readonly propertiesShape: IShape;
      readonly version: string;
    }
  >();
  definitionsByVersion.set(version, {
    ...props,
    propertiesShape,
  });

  for (const historicalDefinition of resolvedHistoricalDefinitions) {
    if (historicalDefinition.modelName !== modelName) {
      throw new Error(
        `Historical model version "${historicalDefinition.version}" has modelName "${historicalDefinition.modelName}", not "${modelName}"`,
      );
    }
    if (historicalDefinition.abbreviation !== abbreviation) {
      throw new Error(
        `Historical model version "${historicalDefinition.version}" has abbreviation "${historicalDefinition.abbreviation}", not "${abbreviation}"`,
      );
    }
    if (typeof historicalDefinition.adaptResource !== 'function') {
      throw new Error(
        `Historical model version "${historicalDefinition.version}" for "${modelName}" requires adaptResource`,
      );
    }
    const historicalVersionMatch =
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(
        historicalDefinition.version,
      );
    if (historicalVersionMatch === null) {
      throw new Error(
        `Invalid historical model version "${historicalDefinition.version}" for "${modelName}": expected SemVer`,
      );
    }
    if (definitionsByVersion.has(historicalDefinition.version)) {
      throw new Error(
        `Duplicate model version "${historicalDefinition.version}" for "${modelName}"`,
      );
    }

    const historicalMajor = Number(historicalVersionMatch[1]);
    const historicalMinor = Number(historicalVersionMatch[2]);
    const historicalPatch = Number(historicalVersionMatch[3]);
    if (
      !Number.isSafeInteger(historicalMajor) ||
      !Number.isSafeInteger(historicalMinor) ||
      !Number.isSafeInteger(historicalPatch)
    ) {
      throw new Error(
        `Invalid historical model version "${historicalDefinition.version}" for "${modelName}": expected SemVer`,
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
        `Historical model version "${historicalDefinition.version}" for "${modelName}" must be older than current version "${version}"`,
      );
    }
    definitionsByVersion.set(
      historicalDefinition.version,
      historicalDefinition,
    );
  }

  for (const [key, value] of Object.entries(propertiesShape)) {
    if (!isAttributeDescriptor(value)) {
      throw new Error(`Invalid attribute descriptor for "${key}"`);
    }
    if (
      key in declaredAttributes &&
      (key === 'createdAt' ||
        key === 'deletedAt' ||
        key === 'id' ||
        key === 'modelName' ||
        key === 'updatedAt' ||
        key === 'version')
    ) {
      throw new Error(
        `Invalid attribute "${key}" on model "${modelName}": framework property keys are reserved`,
      );
    }
    if (key in declaredAttributes && value.kind === PrimitiveKind.PrimaryKey) {
      throw new Error(
        `Invalid attribute "${key}" on model "${modelName}": makeModel synthesizes the model id primary key`,
      );
    }
    if (key in declaredAttributes && 'autogenerate' in value) {
      throw new Error(
        `Invalid attribute "${key}" on model "${modelName}": autogeneration belongs to contract payload primary keys`,
      );
    }
  }

  const resourceSchemasByVersion = new Map<
    string,
    Schema.Codec<Record<string, unknown>, unknown>
  >();
  for (const [definitionVersion, definition] of definitionsByVersion) {
    const propertySchemas: Record<
      string,
      Schema.Codec<unknown, unknown>
    > = mapValues(definition.propertiesShape, descriptor =>
      descriptorToJsonEffectSchema(descriptor),
    );
    resourceSchemasByVersion.set(
      definitionVersion,
      Schema.Struct(propertySchemas),
    );
  }

  const table = makeTable({
    name: modelName,
    shape: propertiesShape,
    indexes,
  });

  const spec = {
    modelName,
    abbreviation,
    version,
    attributes: Object.keys(declaredAttributes),
    attributesJsonSchema: Schema.toJsonSchemaDocument(
      Schema.Struct(
        mapValues(declaredAttributes, descriptor =>
          descriptorToJsonEffectSchema(descriptor),
        ),
      ),
    ),
    propertiesJsonSchema: Schema.toJsonSchemaDocument(
      Schema.Struct(
        mapValues(propertiesShape, descriptor =>
          descriptorToJsonEffectSchema(descriptor),
        ),
      ),
    ),
    indexes,
  };

  const model: IModel = {
    abbreviation,
    attributes: declaredAttributes,
    indexes,
    historicalDefinitions: resolvedHistoricalDefinitions,
    modelName,
    version,
    makeId: () => makeIdFromAbbreviation({ abbreviation }),
    primaryKey: ({ autogenerate }) => ({
      ...primitives.primaryKey({ abbreviation }),
      autogenerate,
      modelName,
    }),
    prefixId: id => `${abbreviation}_${id}`,
    propertiesShape,
    table,
    spec,
    adaptResource: Effect.fn(`adaptResource/${modelName}`)(function* (props: {
      version: string;
      resource: unknown;
    }): Effect.fn.Return<unknown, IAnyError> {
      const { resource, version: targetVersion } = props;
      const currentResourceSchema = resourceSchemasByVersion.get(version);
      if (currentResourceSchema === undefined) {
        return yield* new ZerospinError({
          code: 'model-current-resource-schema-missing',
          message: `Current resource schema for ${modelName}@${version} is missing`,
          extra: { modelName, modelVersion: version },
        });
      }

      const currentResource = yield* Schema.decodeUnknownEffect(
        Schema.toType(makeEffectSchema(propertiesShape)),
      )(resource, { onExcessProperty: 'error' }).pipe(
        mapParseError({
          code: 'model-current-resource-invalid',
          prefix: `Failed to validate current resource for ${modelName}@${version}`,
          extra: { modelName, modelVersion: version },
        }),
      );
      if (
        Reflect.get(currentResource, 'modelName') !== modelName ||
        Reflect.get(currentResource, 'version') !== version
      ) {
        return yield* new ZerospinError({
          code: 'model-current-resource-identity-invalid',
          message: `Current resource must identify ${modelName}@${version}`,
          extra: {
            modelName,
            modelVersion: version,
            resourceModelName: Reflect.get(currentResource, 'modelName'),
            resourceVersion: Reflect.get(currentResource, 'version'),
          },
        });
      }

      const targetDefinition = definitionsByVersion.get(targetVersion);
      const targetResourceSchema = resourceSchemasByVersion.get(targetVersion);
      if (
        targetDefinition === undefined ||
        targetResourceSchema === undefined
      ) {
        return yield* new ZerospinError({
          code: 'model-resource-version-unsupported',
          message: `Model ${modelName} does not support resource version ${targetVersion}`,
          extra: {
            modelName,
            currentVersion: version,
            targetVersion,
          },
        });
      }

      let targetResource: unknown = currentResource;
      if (targetVersion !== version) {
        const targetHistoricalDefinition = resolvedHistoricalDefinitions.find(
          definition => definition.version === targetVersion,
        );
        if (targetHistoricalDefinition === undefined) {
          return yield* new ZerospinError({
            code: 'model-resource-adapter-missing',
            message: `Historical model ${modelName}@${targetVersion} has no direct adaptResource from current version ${version}`,
            extra: {
              modelName,
              currentVersion: version,
              targetVersion,
            },
          });
        }
        const adaptedResource: Effect.Effect<unknown, IAnyError> =
          Effect.suspend(() =>
            targetHistoricalDefinition.adaptResource({
              resource: currentResource,
            }),
          ).pipe(
            Effect.catchCause(
              cause =>
                new ZerospinError({
                  code: 'model-resource-adapter-invariant-failed',
                  message: `Direct resource adapter from ${modelName}@${version} to ${modelName}@${targetVersion} failed`,
                  cause: ZerospinError.prettyUnknownFailure(cause),
                  extra: {
                    modelName,
                    currentVersion: version,
                    targetVersion,
                  },
                }),
            ),
          );
        targetResource = yield* adaptedResource;
      }

      const validatedTargetResource = yield* Schema.decodeUnknownEffect(
        Schema.toType(targetResourceSchema),
      )(targetResource, { onExcessProperty: 'error' }).pipe(
        mapParseError({
          code: 'model-resource-adapter-output-invariant-failed',
          prefix: `Resource adapter output did not match ${modelName}@${targetVersion}`,
          extra: {
            modelName,
            currentVersion: version,
            targetVersion,
          },
        }),
      );
      if (
        Reflect.get(validatedTargetResource, 'modelName') !== modelName ||
        Reflect.get(validatedTargetResource, 'version') !== targetVersion
      ) {
        return yield* new ZerospinError({
          code: 'model-resource-adapter-output-invariant-failed',
          message: `Resource adapter output must identify ${modelName}@${targetVersion}`,
          extra: {
            modelName,
            currentVersion: version,
            targetVersion,
            resourceModelName: Reflect.get(
              validatedTargetResource,
              'modelName',
            ),
            resourceVersion: Reflect.get(validatedTargetResource, 'version'),
          },
        });
      }

      return yield* Schema.encodeEffect(targetResourceSchema)(
        validatedTargetResource,
        { onExcessProperty: 'error' },
      ).pipe(
        mapParseError({
          code: 'model-resource-encode-invariant-failed',
          prefix: `Failed to encode resource for ${modelName}@${targetVersion}`,
          extra: {
            modelName,
            currentVersion: version,
            targetVersion,
          },
        }),
      );
    }),
    createMutation(modelVersion) {
      const definition = definitionsByVersion.get(modelVersion);
      if (definition === undefined) {
        throw new Error(
          `Unknown model version "${modelVersion}" for "${modelName}"`,
        );
      }

      const attributeSchemas: Record<
        string,
        Schema.Codec<unknown, unknown>
      > = mapValues(definition.attributes, descriptor =>
        descriptorToJsonEffectSchema(descriptor),
      );
      const attributesSchema = Schema.Struct(attributeSchemas);
      const resourceIdSchema = descriptorToJsonEffectSchema(
        primitives.primaryKey({ abbreviation }),
      );

      return Schema.Struct({
        modelName: Schema.Literal(modelName),
        modelVersion: Schema.Literal(modelVersion),
        operationName: Schema.Literal('create'),
        resourceId: resourceIdSchema,
        operation: Schema.Struct({ attributes: attributesSchema }),
      }).pipe(
        Schema.decodeTo(
          Schema.Struct({
            model: Schema.declare<IModel>(
              (input): input is IModel => input === model,
            ),
            modelVersion: Schema.Literal(modelVersion),
            operationName: Schema.Literal('create'),
            resourceId: resourceIdSchema,
            operation: Schema.Struct({
              attributes: Schema.toType(attributesSchema),
            }),
          }),
          SchemaTransformation.transform({
            decode: mutation => ({
              model,
              modelVersion: mutation.modelVersion,
              operationName: mutation.operationName,
              resourceId: mutation.resourceId,
              operation: mutation.operation,
            }),
            encode: mutation => ({
              modelName,
              modelVersion: mutation.modelVersion,
              operationName: mutation.operationName,
              resourceId: mutation.resourceId,
              operation: mutation.operation,
            }),
          }),
        ),
      );
    },
    create(modelVersion, props) {
      const definition = definitionsByVersion.get(modelVersion);
      if (definition === undefined) {
        throw new Error(
          `Unknown model version "${modelVersion}" for "${modelName}"`,
        );
      }

      return Effect.gen(function* () {
        yield* Schema.decodeUnknownEffect(
          makeEffectSchema(definition.attributes),
        )(props.attributes, {
          onExcessProperty: 'error',
        }).pipe(
          mapParseError({
            code: 'create-resource-missing-attributes',
            prefix: `createMutation requires all model attributes for "${modelName}"`,
            extra: { modelName },
          }),
          Effect.asVoid,
        );

        return {
          model,
          modelVersion,
          operationName: 'create',
          resourceId: props.resourceId,
          operation: { attributes: props.attributes },
        };
      });
    },
    updateMutation(modelVersion) {
      const definition = definitionsByVersion.get(modelVersion);
      if (definition === undefined) {
        throw new Error(
          `Unknown model version "${modelVersion}" for "${modelName}"`,
        );
      }

      const attributeSchemas: Record<
        string,
        Schema.Codec<unknown, unknown>
      > = mapValues(definition.attributes, descriptor =>
        descriptorToJsonEffectSchema(descriptor),
      );
      const attributesSchema = Schema.Struct(attributeSchemas);
      const partialAttributesSchema = attributesSchema.mapFields(
        Struct.map(Schema.optional),
      );
      const resourceIdSchema = descriptorToJsonEffectSchema(
        primitives.primaryKey({ abbreviation }),
      );

      return Schema.Struct({
        modelName: Schema.Literal(modelName),
        modelVersion: Schema.Literal(modelVersion),
        operationName: Schema.Literal('update'),
        resourceId: resourceIdSchema,
        operation: Schema.Struct({
          attributes: partialAttributesSchema,
          mask: Schema.optional(Schema.Array(Schema.String)),
        }),
      }).pipe(
        Schema.decodeTo(
          Schema.Struct({
            model: Schema.declare<IModel>(
              (input): input is IModel => input === model,
            ),
            modelVersion: Schema.Literal(modelVersion),
            operationName: Schema.Literal('update'),
            resourceId: resourceIdSchema,
            operation: Schema.Struct({
              attributes: Schema.toType(partialAttributesSchema),
              mask: Schema.optional(Schema.Array(Schema.String)),
            }),
          }),
          SchemaTransformation.transform({
            decode: mutation => ({
              model,
              modelVersion: mutation.modelVersion,
              operationName: mutation.operationName,
              resourceId: mutation.resourceId,
              operation: mutation.operation,
            }),
            encode: mutation => ({
              modelName,
              modelVersion: mutation.modelVersion,
              operationName: mutation.operationName,
              resourceId: mutation.resourceId,
              operation: mutation.operation,
            }),
          }),
        ),
      );
    },
    update(modelVersion, props) {
      if (!definitionsByVersion.has(modelVersion)) {
        throw new Error(
          `Unknown model version "${modelVersion}" for "${modelName}"`,
        );
      }

      return Effect.gen(function* () {
        yield* Effect.void;
        const filteredAttributes = props.mask
          ? props.mask.reduce(
              (attributes: Record<string, unknown>, key: string) => {
                attributes[key] = props.attributes[key];
                return attributes;
              },
              {},
            )
          : props.attributes;

        return {
          model,
          modelVersion,
          operationName: 'update',
          resourceId: props.resourceId,
          operation: props.mask
            ? { attributes: filteredAttributes, mask: [...props.mask] }
            : { attributes: filteredAttributes },
        };
      });
    },
    deleteMutation(modelVersion) {
      if (!definitionsByVersion.has(modelVersion)) {
        throw new Error(
          `Unknown model version "${modelVersion}" for "${modelName}"`,
        );
      }

      const resourceIdSchema = descriptorToJsonEffectSchema(
        primitives.primaryKey({ abbreviation }),
      );

      return Schema.Struct({
        modelName: Schema.Literal(modelName),
        modelVersion: Schema.Literal(modelVersion),
        operationName: Schema.Literal('delete'),
        resourceId: resourceIdSchema,
        operation: Schema.Struct({}),
      }).pipe(
        Schema.decodeTo(
          Schema.Struct({
            model: Schema.declare<IModel>(
              (input): input is IModel => input === model,
            ),
            modelVersion: Schema.Literal(modelVersion),
            operationName: Schema.Literal('delete'),
            resourceId: resourceIdSchema,
            operation: Schema.Struct({}),
          }),
          SchemaTransformation.transform({
            decode: mutation => ({
              model,
              modelVersion: mutation.modelVersion,
              operationName: mutation.operationName,
              resourceId: mutation.resourceId,
              operation: mutation.operation,
            }),
            encode: mutation => ({
              modelName,
              modelVersion: mutation.modelVersion,
              operationName: mutation.operationName,
              resourceId: mutation.resourceId,
              operation: mutation.operation,
            }),
          }),
        ),
      );
    },
    delete(modelVersion, props) {
      if (!definitionsByVersion.has(modelVersion)) {
        throw new Error(
          `Unknown model version "${modelVersion}" for "${modelName}"`,
        );
      }

      return Effect.gen(function* () {
        yield* Effect.void;

        return {
          model,
          modelVersion,
          operationName: 'delete',
          resourceId: props.resourceId,
          operation: {},
        };
      });
    },
    moveMutation(modelVersion) {
      if (!definitionsByVersion.has(modelVersion)) {
        throw new Error(
          `Unknown model version "${modelVersion}" for "${modelName}"`,
        );
      }

      const resourceIdSchema = descriptorToJsonEffectSchema(
        primitives.primaryKey({ abbreviation }),
      );
      const operationSchema = Schema.Struct({
        property: Schema.String,
        prevId: Schema.String,
        nextId: Schema.String,
      });

      return Schema.Struct({
        modelName: Schema.Literal(modelName),
        modelVersion: Schema.Literal(modelVersion),
        operationName: Schema.Literal('move'),
        resourceId: resourceIdSchema,
        operation: operationSchema,
      }).pipe(
        Schema.decodeTo(
          Schema.Struct({
            model: Schema.declare<IModel>(
              (input): input is IModel => input === model,
            ),
            modelVersion: Schema.Literal(modelVersion),
            operationName: Schema.Literal('move'),
            resourceId: resourceIdSchema,
            operation: operationSchema,
          }),
          SchemaTransformation.transform({
            decode: mutation => ({
              model,
              modelVersion: mutation.modelVersion,
              operationName: mutation.operationName,
              resourceId: mutation.resourceId,
              operation: mutation.operation,
            }),
            encode: mutation => ({
              modelName,
              modelVersion: mutation.modelVersion,
              operationName: mutation.operationName,
              resourceId: mutation.resourceId,
              operation: mutation.operation,
            }),
          }),
        ),
      );
    },
    move(modelVersion, props) {
      if (!definitionsByVersion.has(modelVersion)) {
        throw new Error(
          `Unknown model version "${modelVersion}" for "${modelName}"`,
        );
      }

      return Effect.gen(function* () {
        yield* Effect.void;

        return {
          model,
          modelVersion,
          operationName: 'move',
          resourceId: props.resourceId,
          operation: {
            property: props.property,
            prevId: props.prevId,
            nextId: props.nextId,
          },
        };
      });
    },
    replicateResourceMutation(this: IModelReplica, modelVersion) {
      const definition = definitionsByVersion.get(modelVersion);
      if (definition === undefined) {
        throw new Error(
          `Unknown model version "${modelVersion}" for "${modelName}"`,
        );
      }

      const resourceIdSchema = descriptorToJsonEffectSchema(
        primitives.primaryKey({ abbreviation }),
      );
      const resourcePropertySchemas: Record<
        string,
        Schema.Codec<unknown, unknown>
      > = mapValues(definition.propertiesShape, descriptor =>
        descriptorToJsonEffectSchema(descriptor),
      );
      const resourceSchema = Schema.Struct(resourcePropertySchemas);
      const operationSchema = Schema.Struct({
        serviceName: Schema.Literal(this.serviceName),
        resource: resourceSchema,
      });
      const decodedOperationSchema = Schema.Struct({
        serviceName: Schema.Literal(this.serviceName),
        resource: Schema.toType(resourceSchema),
      });

      return Schema.Struct({
        modelName: Schema.Literal(modelName),
        modelVersion: Schema.Literal(modelVersion),
        operationName: Schema.Literal('replicateResource'),
        resourceId: resourceIdSchema,
        operation: operationSchema,
      }).pipe(
        Schema.decodeTo(
          Schema.Struct({
            model: Schema.declare<IModelReplica>(
              (input): input is IModelReplica => input === this,
            ),
            modelVersion: Schema.Literal(modelVersion),
            operationName: Schema.Literal('replicateResource'),
            resourceId: resourceIdSchema,
            operation: decodedOperationSchema,
          }),
          SchemaTransformation.transform({
            decode: mutation => ({
              model: this,
              modelVersion: mutation.modelVersion,
              operationName: mutation.operationName,
              resourceId: mutation.resourceId,
              operation: mutation.operation,
            }),
            encode: mutation => ({
              modelName,
              modelVersion: mutation.modelVersion,
              operationName: mutation.operationName,
              resourceId: mutation.resourceId,
              operation: mutation.operation,
            }),
          }),
        ),
      );
    },
    replicateResource(this: IModelReplica, modelVersion, props) {
      const definition = definitionsByVersion.get(modelVersion);
      if (definition === undefined) {
        throw new Error(
          `Unknown model version "${modelVersion}" for "${modelName}"`,
        );
      }

      const sourceDefinition =
        modelVersion === this.sourceModel.version
          ? this.sourceModel
          : this.sourceModel.historicalDefinitions.find(
              historicalDefinition =>
                historicalDefinition.version === modelVersion,
            );
      if (sourceDefinition === undefined) {
        throw new Error(
          `Unknown source model version "${modelVersion}" for "${modelName}"`,
        );
      }

      // oxlint-disable-next-line typescript/no-this-alias -- Effect.gen's generator needs the receiver captured lexically.
      const replica = this;
      return Effect.gen(function* () {
        const sourceResource = yield* Schema.decodeUnknownEffect(
          Schema.toType(makeEffectSchema(sourceDefinition.propertiesShape)),
        )(props.resource, { onExcessProperty: 'error' }).pipe(
          mapParseError({
            code: 'replicate-resource-invalid-resource',
            prefix: `replicateResource requires a complete resource for model "${modelName}"`,
            extra: { modelName, serviceName: replica.serviceName },
          }),
        );

        if (sourceResource.modelName !== modelName) {
          return yield* new ZerospinError({
            code: 'replicate-resource-model-name-mismatch',
            message: `Resource ${sourceResource.id} has modelName "${sourceResource.modelName}", not "${modelName}"`,
            extra: {
              modelName,
              resourceModelName: sourceResource.modelName,
              serviceName: replica.serviceName,
            },
          });
        }

        if (sourceResource.version !== modelVersion) {
          return yield* new ZerospinError({
            code: 'replicate-resource-model-version-mismatch',
            message: `Resource ${sourceResource.id} has model version ${sourceResource.version}, not ${modelVersion}`,
            extra: {
              modelName,
              modelVersion,
              resourceVersion: sourceResource.version,
              serviceName: replica.serviceName,
            },
          });
        }

        return {
          model: replica,
          modelVersion,
          operationName: 'replicateResource',
          resourceId: sourceResource.id,
          operation: {
            serviceName: replica.serviceName,
            resource: {
              ...sourceResource,
              deletedAt: null,
            },
          },
        };
      });
    },
    // ALLOWED_CAST: model-specific Drizzle table must satisfy erased IDrizzleResourceTable on IModel.
    drizzleSchema: makeDrizzleSchemaFromTable(table) as never as IDrizzleSchema<
      string,
      IResourceShape
    >,
    // ALLOWED_CAST: makeEffectSchema return must satisfy erased InferAttributesSchema on IModel.
    attributesSchema: makeEffectSchema(
      declaredAttributes as ATTRIBUTES,
    ) as InferAttributesSchema<IModel<ATTRIBUTES, ABBREVIATION, MODEL_NAME>>,
    resourceSchema: Schema.Struct(
      mapValues(propertiesShape, descriptor =>
        descriptorToJsonEffectSchema(descriptor),
      ),
      // oxlint-disable-next-line typescript/no-explicit-any -- IModel intentionally erases concrete resource-schema variance.
    ) as unknown as Schema.Codec<any, any>,
  };

  return model;
}
