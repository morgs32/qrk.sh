import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import {
  descriptorToJsonEffectSchema,
  encodeShape,
  isAttributeDescriptor,
  makeDrizzleSchemaFromTable,
  makeEffectSchema,
  makeIdFromAbbreviation,
  makeTable,
  PrimitiveKind,
  primitives,
  type IDrizzleIndexConfig,
  type IDrizzleSchema,
  type IPrimaryKeyDescriptor,
  type IShape,
  type ITypeError,
} from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { mapValues } from 'es-toolkit';
/* oxlint-disable typescript/no-explicit-any -- complete resolved definitions span model-specific resource shapes */

import type {
  IModel,
  IModelReplica,
  IModelReservedAttributeKeys,
  InferAttributesSchema,
  InferProperties,
  IResourceShape,
} from './types.ts';

type IReservedKeys =
  // Framework property keys that are not allowed as user attributes.
  | 'aggregateIndex'
  | 'createdAt'
  | 'deletedAt'
  | 'serviceIndex'
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

const replicaMetadata = new WeakMap<
  object,
  Readonly<{
    sourceModel: IModel;
    serviceName: string;
  }>
>();

const AttributeDescriptorSchema = Schema.declare(isAttributeDescriptor);

const SemVerSchema = Schema.String.check(
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
);

const DrizzleIndexConfigSchema = Schema.Struct({
  name: Schema.String,
  columns: Schema.NonEmptyArray(Schema.String),
  unique: Schema.optionalKey(Schema.Boolean),
});

const MakeVersionPropsSchema = Schema.Struct({
  attributes: Schema.Record(Schema.String, AttributeDescriptorSchema),
  propertiesShape: Schema.optionalKey(
    Schema.Record(Schema.String, AttributeDescriptorSchema),
  ),
  indexes: Schema.Array(DrizzleIndexConfigSchema),
  version: SemVerSchema,
});

export class Model {
  get sourceModel(): IModel | undefined {
    return replicaMetadata.get(this)?.sourceModel;
  }

  get serviceName(): string | undefined {
    return replicaMetadata.get(this)?.serviceName;
  }

  static markReplica(
    model: IModel,
    props: {
      sourceModel: IModel;
      serviceName: string;
    },
  ): IModel {
    const { sourceModel, serviceName } = props;
    if (replicaMetadata.has(model)) {
      throw new Error('Model is already marked as a replica');
    }
    replicaMetadata.set(model, { sourceModel, serviceName });
    return model;
  }

  static isReplica(model: IModel): model is IModelReplica {
    return replicaMetadata.has(model);
  }
}

export function makeModel<
  const NAME extends string,
  const ABBREVIATION extends string,
>(props: { name: NAME; abbreviation: ABBREVIATION }) {
  Schema.decodeUnknownSync(
    Schema.Struct({ name: Schema.String, abbreviation: Schema.String }),
    {
      onExcessProperty: 'error',
    },
  )(props);
  return { name: props.name, abbreviation: props.abbreviation };
}

export function makeVersion<
  MODEL_NAME extends string,
  ABBREVIATION extends string,
  ATTRIBUTES extends IShape,
  const VERSION extends string,
>(
  identity: Readonly<{ name: MODEL_NAME; abbreviation: ABBREVIATION }>,
  props: {
    attributes: ATTRIBUTES & {
      [K in keyof ATTRIBUTES &
        string]: ATTRIBUTES[K] extends IPrimaryKeyDescriptor
        ? ITypeError<`Attribute "${K}" on makeVersion cannot be a primary key because makeVersion synthesizes the model id primary key`>
        : ATTRIBUTES[K];
    } & {
      [K in IReservedKeys]?: never;
    };
    indexes: readonly IDrizzleIndexConfig<
      keyof InferProperties<ATTRIBUTES, ABBREVIATION> & string
    >[];
    version: VERSION;
  },
): IModel<
  {
    readonly [KEY in keyof ATTRIBUTES]: ATTRIBUTES[KEY] extends infer DESCRIPTOR
      ? DESCRIPTOR extends IShape[string]
        ? Readonly<DESCRIPTOR>
        : never
      : never;
  },
  ABBREVIATION,
  MODEL_NAME,
  VERSION,
  {
    readonly [KEY in keyof InferProperties<
      ATTRIBUTES,
      ABBREVIATION
    >]: InferProperties<ATTRIBUTES, ABBREVIATION>[KEY] extends infer DESCRIPTOR
      ? DESCRIPTOR extends IShape[string]
        ? Readonly<DESCRIPTOR>
        : never
      : never;
  }
>;

export function makeVersion<
  MODEL_NAME extends string,
  ABBREVIATION extends string,
  ATTRIBUTES extends IShape,
  PROPERTIES_SHAPE extends InferProperties<ATTRIBUTES, ABBREVIATION>,
  const VERSION extends string,
>(
  identity: Readonly<{ name: MODEL_NAME; abbreviation: ABBREVIATION }>,
  props: {
    attributes: ATTRIBUTES & {
      [K in keyof ATTRIBUTES &
        string]: ATTRIBUTES[K] extends IPrimaryKeyDescriptor
        ? ITypeError<`Attribute "${K}" on makeVersion cannot be a primary key because makeVersion synthesizes the model id primary key`>
        : ATTRIBUTES[K];
    } & {
      [K in IReservedKeys]?: never;
    };
    propertiesShape: PROPERTIES_SHAPE;
    indexes: readonly IDrizzleIndexConfig<keyof PROPERTIES_SHAPE & string>[];
    version: VERSION;
  },
): IModel<
  {
    readonly [KEY in keyof ATTRIBUTES]: ATTRIBUTES[KEY] extends infer DESCRIPTOR
      ? DESCRIPTOR extends IShape[string]
        ? Readonly<DESCRIPTOR>
        : never
      : never;
  },
  ABBREVIATION,
  MODEL_NAME,
  VERSION,
  {
    readonly [KEY in keyof PROPERTIES_SHAPE]: PROPERTIES_SHAPE[KEY] extends infer DESCRIPTOR
      ? DESCRIPTOR extends IShape[string]
        ? Readonly<DESCRIPTOR>
        : never
      : never;
  }
>;

/*
 * 1. Validate authored props and compose the complete property shape.
 * 2. Build resource schemas, the table, and the public spec.
 * 3. Define identity helpers and exact-version resource encoding.
 * 4. Attach Drizzle and Effect schemas to the canonical Model instance.
 */
export function makeVersion<
  MODEL_NAME extends string,
  ABBREVIATION extends string,
  ATTRIBUTES extends IShape,
>(
  identity: Readonly<{ name: MODEL_NAME; abbreviation: ABBREVIATION }>,
  props: {
    attributes: ATTRIBUTES;
    propertiesShape?: IShape;
    indexes: readonly IDrizzleIndexConfig<string>[];
    version: string;
  },
): unknown {
  // 1 — Strictly decode the current definition, synthesize framework fields,
  // and use an explicit propertiesShape only when the author supplied one.
  const { name: modelName, abbreviation } = makeModel(identity);
  const decodedProps = Schema.decodeUnknownSync(MakeVersionPropsSchema, {
    onExcessProperty: 'error',
  })(props);
  const {
    attributes: decodedAttributes,
    indexes: decodedIndexes,
    version,
  } = decodedProps;
  const declaredAttributes = mapValues(decodedAttributes, descriptor => {
    if (descriptor.kind === PrimitiveKind.Enum) {
      const values: typeof descriptor.values = [...descriptor.values];
      return { ...descriptor, values };
    }
    return { ...descriptor };
  });
  const indexes = decodedIndexes.map(index => {
    const columns: typeof index.columns = [...index.columns];
    return {
      ...index,
      columns,
    };
  });

  const standardProperties = {
    id: primitives.primaryKey({ abbreviation }),
    modelName: primitives.text({ nullable: false }),
    createdAt: primitives.date({ nullable: false }),
    updatedAt: primitives.date({ nullable: false }),
    version: primitives.text({ nullable: false }),
  };
  const propertiesShape =
    decodedProps.propertiesShape === undefined
      ? {
          ...standardProperties,
          ...declaredAttributes,
        }
      : mapValues(decodedProps.propertiesShape, descriptor => {
          if (descriptor.kind === PrimitiveKind.Enum) {
            const values: typeof descriptor.values = [...descriptor.values];
            return { ...descriptor, values };
          }
          return { ...descriptor };
        });
  Schema.decodeUnknownSync(
    Schema.Record(Schema.String, AttributeDescriptorSchema).check(
      Schema.makeFilter((shape: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(shape)) {
          if (!isAttributeDescriptor(value)) {
            return `Invalid attribute descriptor for "${key}"`;
          }
          if (
            key in declaredAttributes &&
            (key === 'createdAt' ||
              key === 'deletedAt' ||
              key === 'serviceIndex' ||
              key === 'id' ||
              key === 'modelName' ||
              key === 'updatedAt' ||
              key === 'version')
          ) {
            return `Invalid attribute "${key}" on model "${modelName}": framework property keys are reserved`;
          }
          if (
            key in declaredAttributes &&
            isAttributeDescriptor(value) &&
            value.kind === PrimitiveKind.PrimaryKey
          ) {
            return `Invalid attribute "${key}" on model "${modelName}": makeVersion synthesizes the model id primary key`;
          }
        }
        return true;
      }),
    ),
    { onExcessProperty: 'error' },
  )(propertiesShape);

  // 2 — Resolve self refs against the Model-owned table, prepare its complete
  // authored graph, then derive schemas and serializable metadata.
  const table = makeTable({
    name: modelName,
    shape: propertiesShape,
    indexes,
  });
  for (const key in declaredAttributes) {
    const descriptor = declaredAttributes[key];
    if (
      descriptor !== undefined &&
      descriptor.kind === PrimitiveKind.Ref &&
      'self' in descriptor
    ) {
      Object.assign(descriptor, table.shape[key]);
      Reflect.deleteProperty(descriptor, 'self');
    }
  }
  Object.assign(propertiesShape, table.shape);

  const spec = {
    modelName,
    abbreviation,
    version,
    attributes: Object.keys(declaredAttributes),
    attributesShape: encodeShape(declaredAttributes),
    propertiesShape: encodeShape(propertiesShape),
    indexes,
  };

  let model: IModel;

  const fields: IModel = {
    abbreviation,
    attributes: declaredAttributes,
    indexes,
    modelName,
    version,
    makeId: () => makeIdFromAbbreviation({ abbreviation }),
    prefixId: id => `${abbreviation}_${id}`,
    propertiesShape,
    table,
    spec,
    getVersion(requestedVersion) {
      if (requestedVersion !== version) {
        throw new ZerospinError({
          code: 'model-version-unsupported',
          message: `Model ${modelName} is version ${version}, not ${requestedVersion}`,
          extra: { modelName, currentVersion: version, requestedVersion },
        });
      }
      return model;
    },
    adaptResource: Effect.fn(`adaptResource/${modelName}`)(function* (props: {
      version: string;
      resource: unknown;
    }): Effect.fn.Return<unknown, IAnyError> {
      const { resource, version: targetVersion } = props;
      if (targetVersion !== version) {
        return yield* new ZerospinError({
          code: 'model-resource-version-unsupported',
          message: `Model ${modelName} is version ${version}, not ${targetVersion}`,
          extra: { modelName, currentVersion: version, targetVersion },
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

      return yield* Schema.encodeEffect(model.resourceSchema)(currentResource, {
        onExcessProperty: 'error',
      }).pipe(
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
    // 4 — Attach current table, attribute, and resource codecs before stamping
    // the canonical Model prototype; the existing casts erase generic variance.
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

  model = Object.assign(new Model(), fields);
  return model;
}

export function upgradeVersion<
  ATTRIBUTES extends IShape,
  ABBREVIATION extends string,
  MODEL_NAME extends string,
  VERSION extends string,
  PROPERTIES_SHAPE extends IShape,
  PATCH extends Record<string, IShape[string] | null>,
  const NEXT_VERSION extends string,
>(
  previous: IModel<
    ATTRIBUTES,
    ABBREVIATION,
    MODEL_NAME,
    VERSION,
    PROPERTIES_SHAPE
  >,
  props: {
    attributes: PATCH & {
      [K in keyof PATCH]: PATCH[K] extends null
        ? K extends keyof ATTRIBUTES
          ? null
          : never
        : PATCH[K] extends IPrimaryKeyDescriptor
          ? never
          : K extends IModelReservedAttributeKeys
            ? never
            : PATCH[K];
    };
    version: NEXT_VERSION;
    indexes?: readonly IDrizzleIndexConfig<
      (
        | Exclude<keyof PROPERTIES_SHAPE, keyof PATCH>
        | {
            [K in keyof PATCH]: PATCH[K] extends null ? never : K;
          }[keyof PATCH]
      ) &
        string
    >[];
  },
): string extends VERSION
  ? IModel
  : IModel<
      {
        readonly [K in keyof ATTRIBUTES | keyof PATCH as K extends keyof PATCH
          ? PATCH[K] extends null
            ? never
            : K
          : K]: K extends keyof PATCH
          ? Exclude<PATCH[K], null>
          : K extends keyof ATTRIBUTES
            ? ATTRIBUTES[K]
            : never;
      },
      ABBREVIATION,
      MODEL_NAME,
      NEXT_VERSION,
      {
        readonly [K in
          | keyof PROPERTIES_SHAPE
          | keyof PATCH as K extends keyof PATCH
          ? PATCH[K] extends null
            ? never
            : K
          : K]: K extends keyof PATCH
          ? Exclude<PATCH[K], null>
          : K extends keyof PROPERTIES_SHAPE
            ? PROPERTIES_SHAPE[K]
            : never;
      }
    >;

export function upgradeVersion(
  previous: IModel,
  props: {
    attributes: Record<string, IShape[string] | null>;
    version: string;
    indexes?: readonly IDrizzleIndexConfig<string>[];
  },
): unknown {
  const { modelName, abbreviation } = previous;
  const attributes: IShape = { ...previous.attributes };
  const nextProperties: InferProperties<IShape> = {
    ...previous.propertiesShape,
  };
  for (const [key, descriptor] of Object.entries(props.attributes)) {
    if (descriptor === null) {
      if (!Object.hasOwn(previous.attributes, key)) {
        throw new Error(
          `Cannot remove unknown attribute "${key}" from ${modelName}`,
        );
      }
      delete attributes[key];
      delete nextProperties[key];
    } else {
      attributes[key] = descriptor;
      nextProperties[key] = descriptor;
    }
  }
  const nextIndexes = props.indexes ?? previous.indexes;
  for (const index of nextIndexes) {
    for (const column of index.columns) {
      if (!Object.hasOwn(nextProperties, column)) {
        throw new Error(
          `Index "${index.name}" references missing attribute "${column}"`,
        );
      }
    }
  }
  return makeVersion(
    { name: modelName, abbreviation },
    {
      attributes,
      propertiesShape: nextProperties,
      indexes: nextIndexes,
      version: props.version,
    },
  );
}
