import { mapParseError, ZerospinError } from '@zerospin/error';
import { Effect, JSONSchema, Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';
import { mapValues } from 'es-toolkit';

import type { IReplicateResourceMutation } from '../contracts/replicateResource.ts';
import { makeIdFromAbbreviation } from '../utils/makeIdFromAbbreviation.ts';
import type { ITypeError } from '../utils/types.ts';

import { makeTable } from './makeTable.ts';
import { PrimitiveKind } from './primitiveKind.ts';
import {
  descriptorToJsonEffectSchema,
  isAttributeDescriptor,
  makeDrizzleSchemaFromTable,
  makeEffectSchema,
} from './primitiveMaps.ts';
import { primitives } from './primitives.ts';
import type {
  IDrizzleIndexConfig,
  IDrizzleSchema,
  IModel,
  InferAttributesSchema,
  InferProperties,
  IPrimaryKeyDescriptor,
  IResourceShape,
  IServiceModel,
  IShape,
} from './types.ts';

type IReservedKeys =
  // Model / metadata keys that are not allowed as user attributes.
  | 'accountCursor'
  | 'createdAt'
  | 'id'
  | 'modelName'
  | 'pushedCursor'
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
  const HISTORICAL_DEFINITIONS extends readonly {
    readonly abbreviation: string;
    readonly attributes: IShape;
    readonly indexes: readonly IDrizzleIndexConfig<string>[];
    readonly modelName: string;
    readonly version: string;
  }[],
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
  historicalDefinitions: HISTORICAL_DEFINITIONS,
): IModel<
  ATTRIBUTES,
  ABBREVIATION,
  MODEL_NAME,
  VERSION,
  HISTORICAL_DEFINITIONS
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
    indexes: readonly IDrizzleIndexConfig<
      keyof InferProperties<ATTRIBUTES, ABBREVIATION> & string
    >[];
    version: string;
  },
  historicalDefinitions: readonly {
    readonly abbreviation: string;
    readonly attributes: IShape;
    readonly indexes: readonly IDrizzleIndexConfig<string>[];
    readonly modelName: string;
    readonly version: string;
  }[],
): IModel {
  const {
    abbreviation,
    modelName,
    attributes: declaredAttributes,
    indexes,
    version,
  } = props;

  if (
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
      version,
    )
  ) {
    throw new Error(
      `Invalid model version "${version}" for "${modelName}": expected SemVer`,
    );
  }

  const definitionsByVersion = new Map<
    string,
    typeof props | (typeof historicalDefinitions)[number]
  >();
  definitionsByVersion.set(version, props);

  for (const historicalDefinition of historicalDefinitions) {
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
    if (
      !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
        historicalDefinition.version,
      )
    ) {
      throw new Error(
        `Invalid historical model version "${historicalDefinition.version}" for "${modelName}": expected SemVer`,
      );
    }
    if (definitionsByVersion.has(historicalDefinition.version)) {
      throw new Error(
        `Duplicate model version "${historicalDefinition.version}" for "${modelName}"`,
      );
    }
    definitionsByVersion.set(
      historicalDefinition.version,
      historicalDefinition,
    );
  }

  const mergedShape: InferProperties<ATTRIBUTES, ABBREVIATION> = {
    id: primitives.primaryKey({ abbreviation }),
    modelName: primitives.text({ nullable: false }),
    createdAt: primitives.date({ nullable: false }),
    updatedAt: primitives.date({ nullable: false }),
    version: primitives.text({ nullable: false }),

    ...declaredAttributes,
  };

  for (const [key, value] of Object.entries(mergedShape)) {
    if (!isAttributeDescriptor(value)) {
      throw new Error(`Invalid attribute descriptor for "${key}"`);
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

  const table = makeTable({
    name: modelName,
    shape: mergedShape,
    indexes,
  });

  const spec = {
    modelName,
    abbreviation,
    version,
    attributes: Object.keys(declaredAttributes),
    attributesJsonSchema: JSONSchema.make(
      Schema.Struct(
        mapValues(declaredAttributes, descriptor =>
          descriptorToJsonEffectSchema(descriptor),
        ),
      ),
    ),
    propertiesJsonSchema: JSONSchema.make(
      Schema.Struct(
        mapValues(mergedShape, descriptor =>
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
    historicalDefinitions,
    modelName,
    version,
    makeId: () => makeIdFromAbbreviation({ abbreviation }),
    primaryKey: ({ autogenerate }) => ({
      ...primitives.primaryKey({ abbreviation }),
      autogenerate,
      modelName,
    }),
    prefixId: id => `${abbreviation}_${id}`,
    propertiesShape: mergedShape,
    table,
    spec,
    createMutation(modelVersion) {
      const definition = definitionsByVersion.get(modelVersion);
      if (definition === undefined) {
        throw new Error(
          `Unknown model version "${modelVersion}" for "${modelName}"`,
        );
      }

      const attributeSchemas: Record<
        string,
        Schema.Schema.AnyNoContext
      > = mapValues(definition.attributes, descriptor =>
        descriptorToJsonEffectSchema(descriptor),
      );
      const attributesSchema = Schema.Struct(attributeSchemas);
      const resourceIdSchema = descriptorToJsonEffectSchema(
        primitives.primaryKey({ abbreviation }),
      );

      return Schema.transform(
        Schema.Struct({
          modelName: Schema.Literal(modelName),
          modelVersion: Schema.Literal(modelVersion),
          operationName: Schema.Literal('create'),
          resourceId: resourceIdSchema,
          operation: Schema.Struct({ attributes: attributesSchema }),
        }),
        Schema.Struct({
          model: Schema.declare<IModel>(
            (input): input is IModel => input === model,
          ),
          modelVersion: Schema.Literal(modelVersion),
          operationName: Schema.Literal('create'),
          resourceId: resourceIdSchema,
          operation: Schema.Struct({
            attributes: Schema.typeSchema(attributesSchema),
          }),
        }),
        {
          strict: true,
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
        },
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
        yield* Schema.decodeUnknown(makeEffectSchema(definition.attributes))(
          props.attributes,
          {
            onExcessProperty: 'error',
          },
        ).pipe(
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
        Schema.Schema.AnyNoContext
      > = mapValues(definition.attributes, descriptor =>
        descriptorToJsonEffectSchema(descriptor),
      );
      const attributesSchema = Schema.Struct(attributeSchemas);
      const partialAttributesSchema = Schema.partial(attributesSchema);
      const resourceIdSchema = descriptorToJsonEffectSchema(
        primitives.primaryKey({ abbreviation }),
      );

      return Schema.transform(
        Schema.Struct({
          modelName: Schema.Literal(modelName),
          modelVersion: Schema.Literal(modelVersion),
          operationName: Schema.Literal('update'),
          resourceId: resourceIdSchema,
          operation: Schema.Struct({
            attributes: partialAttributesSchema,
            mask: Schema.optional(Schema.Array(Schema.String)),
          }),
        }),
        Schema.Struct({
          model: Schema.declare<IModel>(
            (input): input is IModel => input === model,
          ),
          modelVersion: Schema.Literal(modelVersion),
          operationName: Schema.Literal('update'),
          resourceId: resourceIdSchema,
          operation: Schema.Struct({
            attributes: Schema.typeSchema(partialAttributesSchema),
            mask: Schema.optional(Schema.Array(Schema.String)),
          }),
        }),
        {
          strict: true,
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
        },
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

      return Schema.transform(
        Schema.Struct({
          modelName: Schema.Literal(modelName),
          modelVersion: Schema.Literal(modelVersion),
          operationName: Schema.Literal('delete'),
          resourceId: resourceIdSchema,
          operation: Schema.Struct({}),
        }),
        Schema.Struct({
          model: Schema.declare<IModel>(
            (input): input is IModel => input === model,
          ),
          modelVersion: Schema.Literal(modelVersion),
          operationName: Schema.Literal('delete'),
          resourceId: resourceIdSchema,
          operation: Schema.Struct({}),
        }),
        {
          strict: true,
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
        },
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

      return Schema.transform(
        Schema.Struct({
          modelName: Schema.Literal(modelName),
          modelVersion: Schema.Literal(modelVersion),
          operationName: Schema.Literal('move'),
          resourceId: resourceIdSchema,
          operation: operationSchema,
        }),
        Schema.Struct({
          model: Schema.declare<IModel>(
            (input): input is IModel => input === model,
          ),
          modelVersion: Schema.Literal(modelVersion),
          operationName: Schema.Literal('move'),
          resourceId: resourceIdSchema,
          operation: operationSchema,
        }),
        {
          strict: true,
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
        },
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
    replicateResourceMutation(this: IServiceModel, modelVersion) {
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
        Schema.Schema.AnyNoContext
      > = mapValues(
        {
            id: primitives.primaryKey({ abbreviation }),
            modelName: primitives.text({ nullable: false }),
            createdAt: primitives.date({ nullable: false }),
            updatedAt: primitives.date({ nullable: false }),
            version: primitives.text({ nullable: false }),
            ...definition.attributes,
          },
        descriptor => descriptorToJsonEffectSchema(descriptor),
      );
      const resourceSchema = Schema.Struct(resourcePropertySchemas);
      const operationSchema = Schema.Struct({
        serviceName: Schema.Literal(this.serviceName),
        resource: resourceSchema,
      });
      const decodedOperationSchema = Schema.Struct({
        serviceName: Schema.Literal(this.serviceName),
        resource: Schema.typeSchema(resourceSchema),
      });

      return Schema.transform(
        Schema.Struct({
          modelName: Schema.Literal(modelName),
          modelVersion: Schema.Literal(modelVersion),
          operationName: Schema.Literal('replicateResource'),
          resourceId: resourceIdSchema,
          operation: operationSchema,
        }),
        Schema.Struct({
          model: Schema.declare<IServiceModel>(
            (input): input is IServiceModel => input === this,
          ),
          modelVersion: Schema.Literal(modelVersion),
          operationName: Schema.Literal('replicateResource'),
          resourceId: resourceIdSchema,
          operation: decodedOperationSchema,
        }),
        {
          strict: true,
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
        },
      );
    },
    replicateResource(this: IServiceModel, modelVersion, props) {
      const definition = definitionsByVersion.get(modelVersion);
      if (definition === undefined) {
        throw new Error(
          `Unknown model version "${modelVersion}" for "${modelName}"`,
        );
      }

      const mutation = {
        model: this,
        modelVersion,
        operationName: 'replicateResource',
        resourceId: props.resource.id,
        operation: {
          serviceName: this.serviceName,
          resource: props.resource,
        },
      } satisfies IReplicateResourceMutation<IServiceModel>;
      return Effect.gen(function* () {
        yield* Schema.validate(
          makeEffectSchema({
            id: primitives.primaryKey({ abbreviation }),
            modelName: primitives.text({ nullable: false }),
            createdAt: primitives.date({ nullable: false }),
            updatedAt: primitives.date({ nullable: false }),
            version: primitives.text({ nullable: false }),
            ...definition.attributes,
          }),
        )(props.resource).pipe(
          mapParseError({
            code: 'replicate-resource-invalid-resource',
            prefix: `replicateResource requires a complete resource for model "${modelName}"`,
            extra: { modelName, serviceName: mutation.operation.serviceName },
          }),
        );

        if (props.resource.modelName !== modelName) {
          return yield* new ZerospinError({
            code: 'replicate-resource-model-name-mismatch',
            message: `Resource ${props.resource.id} has modelName "${props.resource.modelName}", not "${modelName}"`,
            extra: {
              modelName,
              resourceModelName: props.resource.modelName,
              serviceName: mutation.operation.serviceName,
            },
          });
        }

        if (props.resource.version !== modelVersion) {
          return yield* new ZerospinError({
            code: 'replicate-resource-model-version-mismatch',
            message: `Resource ${props.resource.id} has model version ${props.resource.version}, not ${modelVersion}`,
            extra: {
              modelName,
              modelVersion,
              resourceVersion: props.resource.version,
              serviceName: mutation.operation.serviceName,
            },
          });
        }

        return mutation;
      });
    },
    // ALLOWED_CAST: model-specific Drizzle table must satisfy erased IDrizzleResourceTable on IModel plus BrandTypeId branding.
    drizzleSchema: Object.assign(makeDrizzleSchemaFromTable(table), {
      [BrandTypeId]: 'drizzleSchema',
    }) as never as IDrizzleSchema<string, IResourceShape> & {
      [BrandTypeId]: 'drizzleSchema';
    },
    // ALLOWED_CAST: makeEffectSchema return must satisfy InferAttributesSchema branding on IModel.
    attributesSchema: makeEffectSchema(
      declaredAttributes as ATTRIBUTES,
    ) as InferAttributesSchema<IModel<ATTRIBUTES, ABBREVIATION, MODEL_NAME>>,
    resourceSchema: Schema.Struct(
      mapValues(mergedShape, descriptor =>
        descriptorToJsonEffectSchema(descriptor),
      ),
      // oxlint-disable-next-line typescript/no-explicit-any -- IModel intentionally erases concrete resource-schema variance.
    ) as unknown as Schema.Schema<any, any>,
  };

  return model;
}
