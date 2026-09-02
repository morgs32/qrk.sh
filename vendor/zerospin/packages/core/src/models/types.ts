import type { IAnyError } from '@zerospin/error';
import type {
  CuidFactory,
  IAnyRefDescriptor,
  IAnyShape,
  IDateDescriptor,
  IDrizzleIndexConfig,
  IDrizzleSchema,
  InferDecodedRow,
  InferEncodedRow,
  InferIdFromAbbreviation,
  IPrimaryKeyDescriptor,
  IPrimitive,
  IPrimitiveDescriptorDecoded,
  IPrimitiveDescriptorEncoded,
  IShape,
  ITable,
  ITextDescriptor,
  ITypeError,
  PrimitiveKind,
} from '@zerospin/schema';
/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded type / generic defaults */
import type { Effect, JsonSchema, Schema } from 'effect';
import type { Brand } from 'effect/Brand';
import { assert, type Equals } from 'tsafe';

import type { ICreateMutation } from '../contracts/createMutation.ts';
import type { IDeleteMutation } from '../contracts/deleteMutation.ts';
import type { IMoveMutation } from '../contracts/moveMutation.ts';
import type { IReplicateResourceMutation } from '../contracts/replicateResource.ts';
import type { IEncodedAppliedMutation } from '../contracts/types.ts';
import type { IUpdateMutation } from '../contracts/updateMutation.ts';
import { type coreAbbreviations } from '../utils/coreAbbreviations.ts';

// --- model ---

export type IProperties = IResourceShape & IShape;

export type IEncodedProperties = InferEncodedRow<IProperties>;
export type IDecodedProperties = InferDecodedRow<IProperties>;

/**
 * Caller payload **input** for contracts: id fields with `autogenerate: true`
 * may be omitted, `undefined`, or `null`. Scalar fields and nullable json fields
 * with `defaultValue` may be omitted. `validatePayload` fills both via
 * `descriptorToEffectSchema`.
 * Other fields match {@link InferDecodedRow}.
 */
export type InferPayloadInput<SHAPE extends IAnyShape> = Prettify<
  {
    [K in keyof SHAPE as SHAPE[K] extends { autogenerate: true }
      ? never
      : SHAPE[K] extends {
            kind:
              | PrimitiveKind.Boolean
              | PrimitiveKind.Integer
              | PrimitiveKind.Number
              | PrimitiveKind.Text
              | PrimitiveKind.Date
              | PrimitiveKind.Enum
              | PrimitiveKind.Json;
            defaultValue?: infer DEFAULT_VALUE;
          }
        ? [undefined] extends [DEFAULT_VALUE]
          ? K
          : unknown extends DEFAULT_VALUE
            ? K
            : never
        : K]: IPrimitiveDescriptorDecoded<SHAPE[K]>;
  } & {
    [K in keyof SHAPE as SHAPE[K] extends { autogenerate: true }
      ? K
      : SHAPE[K] extends {
            kind:
              | PrimitiveKind.Boolean
              | PrimitiveKind.Integer
              | PrimitiveKind.Number
              | PrimitiveKind.Text
              | PrimitiveKind.Date
              | PrimitiveKind.Enum
              | PrimitiveKind.Json;
            defaultValue?: infer DEFAULT_VALUE;
          }
        ? [undefined] extends [DEFAULT_VALUE]
          ? never
          : unknown extends DEFAULT_VALUE
            ? never
            : K
        : never]?: SHAPE[K] extends { autogenerate: true }
      ? IPrimitiveDescriptorDecoded<SHAPE[K]> | null | undefined
      : IPrimitiveDescriptorDecoded<SHAPE[K]>;
  }
>;

/** Command / contract program payload after `autogenerate: true` id fields are filled (non-null ids). */
export type InferCommandPayload<SHAPE extends IAnyShape> = {
  [K in keyof SHAPE]: SHAPE[K] extends { autogenerate: true }
    ? Exclude<IPrimitiveDescriptorDecoded<SHAPE[K]>, null>
    : IPrimitiveDescriptorDecoded<SHAPE[K]>;
};

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export type IResourceShape = {
  id: IPrimaryKeyDescriptor;
  modelName: ITextDescriptor<false>;
  createdAt: IDateDescriptor<false>;
  updatedAt: IDateDescriptor<false>;
  version: ITextDescriptor<false>;
};

/**
 * Full persisted row descriptors: caller-declared {@link ATTRIBUTES} plus standard framework
 * columns (abbreviation-scoped primary key replaces generic {@link IResourceShape} `id`).
 */
export type InferProperties<
  ATTRIBUTES extends IShape,
  ABBREVIATION extends string = string,
> = ATTRIBUTES &
  Omit<IResourceShape, 'id'> & {
    id: IPrimaryKeyDescriptor<ABBREVIATION>;
  };

export type IDecodedResource = InferDecodedRow<IResourceShape>;

export type IEncodedResourceShape = InferEncodedRow<IResourceShape> &
  Readonly<{ deletedAt?: Date | null | undefined }> &
  Record<string, unknown>;

export type IEncodedDeletedResourceShape = IEncodedResourceShape &
  Readonly<{ deletedAt: Date }>;

export type IResourceDelta = Readonly<{
  inserted: readonly IEncodedResourceShape[];
  updated: readonly IEncodedResourceShape[];
  deleted: readonly IEncodedDeletedResourceShape[];
  mutations: readonly IEncodedAppliedMutation[];
}>;

export type IEncodedResource = Readonly<IEncodedResourceShape> &
  Brand<'EncodedResource'>;

export type IDrizzleResourceTable = IDrizzleSchema<string, IResourceShape>;

/** Keys merged by {@link makeModel}; not part of payload / {@link IModel.attributesSchema}. */
export type IModelReservedAttributeKeys =
  | 'createdAt'
  | 'deletedAt'
  | 'id'
  | 'modelName'
  | 'updatedAt'
  | 'version';

/** Strips framework columns from a full {@link InferProperties} shape → declared attributes shape. */
export type InferModelAttributesShape<PROPERTIES extends IShape> = Omit<
  PROPERTIES,
  IModelReservedAttributeKeys
>;

/** Serializable model definition and JSON Schemas for deploy specs and RPC. */
export type IModelSpec = {
  readonly modelName: string;
  readonly abbreviation: string;
  readonly version: string;
  readonly attributes: readonly string[];
  readonly attributesJsonSchema: JsonSchema.Document<'draft-2020-12'>;
  readonly propertiesJsonSchema: JsonSchema.Document<'draft-2020-12'>;
  readonly indexes: readonly IDrizzleIndexConfig<string>[];
};

/**
 * `attributes` is the authored mutation shape. `propertiesShape` is the complete
 * persisted row shape consumed by {@link InferResource}, Drizzle, and resource schemas.
 */
export interface IModel<
  ATTRIBUTES extends IShape = any,
  ABBREVIATION extends string = string,
  MODEL_NAME extends string = string,
  VERSION extends string = string,
  HISTORICAL_DEFINITIONS extends readonly {
    readonly abbreviation: string;
    readonly attributes: IShape;
    readonly indexes: readonly IDrizzleIndexConfig<string>[];
    readonly modelName: string;
    readonly propertiesShape: IShape;
    readonly version: string;
    readonly adaptResource: (props: {
      resource: any;
    }) => Effect.Effect<unknown, IAnyError>;
  }[] = readonly {
    readonly abbreviation: string;
    readonly attributes: IShape;
    readonly indexes: readonly IDrizzleIndexConfig<string>[];
    readonly modelName: string;
    readonly propertiesShape: IShape;
    readonly version: string;
    readonly adaptResource: (props: {
      resource: any;
    }) => Effect.Effect<unknown, IAnyError>;
  }[],
  PROPERTIES_SHAPE extends IShape = InferProperties<ATTRIBUTES, ABBREVIATION>,
> {
  abbreviation: ABBREVIATION;
  attributes: ATTRIBUTES;
  indexes: readonly IDrizzleIndexConfig<keyof PROPERTIES_SHAPE & string>[];
  historicalDefinitions: HISTORICAL_DEFINITIONS;
  modelName: MODEL_NAME;
  version: VERSION;
  makeId: () => Effect.Effect<
    InferIdFromAbbreviation<ABBREVIATION>,
    IAnyError,
    CuidFactory
  >;
  primaryKey: <AUTOGENERATE extends boolean>(props: {
    autogenerate: AUTOGENERATE;
  }) => IPrimaryKeyDescriptor<ABBREVIATION> & {
    readonly autogenerate: AUTOGENERATE;
    readonly modelName: MODEL_NAME;
  };
  prefixId: (id: string) => InferIdFromAbbreviation<ABBREVIATION>;
  propertiesShape: PROPERTIES_SHAPE;
  table: ITable<MODEL_NAME, PROPERTIES_SHAPE>;
  drizzleSchema: IDrizzleResourceTable;
  attributesSchema: Schema.Codec<
    InferDecodedRow<ATTRIBUTES>,
    InferEncodedRow<ATTRIBUTES>
  > &
    Schema.Struct<{
      [K in keyof ATTRIBUTES]: Schema.Codec<
        IPrimitiveDescriptorDecoded<ATTRIBUTES[K]>,
        IPrimitiveDescriptorEncoded<ATTRIBUTES[K]>
      >;
    }>;
  resourceSchema: Schema.Codec<any, any>;
  spec: IModelSpec;
  adaptResource<
    MODEL_VERSION extends VERSION | HISTORICAL_DEFINITIONS[number]['version'],
  >(props: {
    version: MODEL_VERSION;
    resource: InferResource<
      IModel<
        ATTRIBUTES,
        ABBREVIATION,
        MODEL_NAME,
        VERSION,
        HISTORICAL_DEFINITIONS,
        PROPERTIES_SHAPE
      >
    >;
  }): Effect.Effect<
    string extends VERSION
      ? any
      : MODEL_VERSION extends VERSION
        ? InferEncodedRow<PROPERTIES_SHAPE>
        : InferEncodedRow<
            Extract<
              HISTORICAL_DEFINITIONS[number],
              { readonly version: MODEL_VERSION }
            >['propertiesShape']
          >,
    IAnyError
  >;
  createMutation<
    MODEL_VERSION extends VERSION | HISTORICAL_DEFINITIONS[number]['version'],
  >(
    modelVersion: MODEL_VERSION,
  ): Schema.Codec<
    string extends VERSION
      ? any
      : ICreateMutation<
          this,
          MODEL_VERSION extends VERSION
            ? ATTRIBUTES
            : Extract<
                HISTORICAL_DEFINITIONS[number],
                { readonly version: MODEL_VERSION }
              >['attributes']
        >,
    string extends VERSION
      ? any
      : Readonly<{
          modelName: MODEL_NAME;
          modelVersion: MODEL_VERSION;
          operationName: 'create';
          resourceId: InferIdFromAbbreviation<ABBREVIATION>;
          operation: {
            readonly attributes: InferEncodedRow<
              MODEL_VERSION extends VERSION
                ? ATTRIBUTES
                : Extract<
                    HISTORICAL_DEFINITIONS[number],
                    { readonly version: MODEL_VERSION }
                  >['attributes']
            >;
          };
        }>
  >;
  create<
    MODEL_VERSION extends VERSION | HISTORICAL_DEFINITIONS[number]['version'],
  >(
    modelVersion: MODEL_VERSION,
    props: {
      readonly resourceId: InferIdFromAbbreviation<ABBREVIATION>;
      readonly attributes: InferDecodedRow<
        MODEL_VERSION extends VERSION
          ? ATTRIBUTES
          : Extract<
              HISTORICAL_DEFINITIONS[number],
              { readonly version: MODEL_VERSION }
            >['attributes']
      >;
    },
  ): Effect.Effect<
    string extends VERSION
      ? any
      : ICreateMutation<
          this,
          MODEL_VERSION extends VERSION
            ? ATTRIBUTES
            : Extract<
                HISTORICAL_DEFINITIONS[number],
                { readonly version: MODEL_VERSION }
              >['attributes']
        >,
    IAnyError
  >;
  updateMutation<
    MODEL_VERSION extends VERSION | HISTORICAL_DEFINITIONS[number]['version'],
  >(
    modelVersion: MODEL_VERSION,
  ): Schema.Codec<
    string extends VERSION
      ? any
      : IUpdateMutation<
          this,
          MODEL_VERSION extends VERSION
            ? ATTRIBUTES
            : Extract<
                HISTORICAL_DEFINITIONS[number],
                { readonly version: MODEL_VERSION }
              >['attributes']
        >,
    string extends VERSION
      ? any
      : Readonly<{
          modelName: MODEL_NAME;
          modelVersion: MODEL_VERSION;
          operationName: 'update';
          resourceId: InferIdFromAbbreviation<ABBREVIATION>;
          operation: {
            readonly attributes: Partial<
              InferEncodedRow<
                MODEL_VERSION extends VERSION
                  ? ATTRIBUTES
                  : Extract<
                      HISTORICAL_DEFINITIONS[number],
                      { readonly version: MODEL_VERSION }
                    >['attributes']
              >
            >;
            readonly mask?: string[];
          };
        }>
  >;
  update<
    MODEL_VERSION extends VERSION | HISTORICAL_DEFINITIONS[number]['version'],
  >(
    modelVersion: MODEL_VERSION,
    props: {
      readonly resourceId: InferIdFromAbbreviation<ABBREVIATION>;
      readonly attributes: Partial<
        InferDecodedRow<
          MODEL_VERSION extends VERSION
            ? ATTRIBUTES
            : Extract<
                HISTORICAL_DEFINITIONS[number],
                { readonly version: MODEL_VERSION }
              >['attributes']
        >
      >;
      readonly mask?: ReadonlyArray<
        keyof InferDecodedRow<
          MODEL_VERSION extends VERSION
            ? ATTRIBUTES
            : Extract<
                HISTORICAL_DEFINITIONS[number],
                { readonly version: MODEL_VERSION }
              >['attributes']
        > &
          string
      >;
    },
  ): Effect.Effect<
    string extends VERSION
      ? any
      : IUpdateMutation<
          this,
          MODEL_VERSION extends VERSION
            ? ATTRIBUTES
            : Extract<
                HISTORICAL_DEFINITIONS[number],
                { readonly version: MODEL_VERSION }
              >['attributes']
        >,
    IAnyError
  >;
  deleteMutation<
    MODEL_VERSION extends VERSION | HISTORICAL_DEFINITIONS[number]['version'],
  >(
    modelVersion: MODEL_VERSION,
  ): Schema.Codec<
    string extends VERSION ? any : IDeleteMutation<this>,
    string extends VERSION
      ? any
      : Readonly<{
          modelName: MODEL_NAME;
          modelVersion: MODEL_VERSION;
          operationName: 'delete';
          resourceId: InferIdFromAbbreviation<ABBREVIATION>;
          operation: Record<string, never>;
        }>
  >;
  delete<
    MODEL_VERSION extends VERSION | HISTORICAL_DEFINITIONS[number]['version'],
  >(
    modelVersion: MODEL_VERSION,
    props: {
      readonly resourceId: InferIdFromAbbreviation<ABBREVIATION>;
    },
  ): Effect.Effect<
    string extends VERSION ? any : IDeleteMutation<this>,
    IAnyError
  >;
  moveMutation<
    MODEL_VERSION extends VERSION | HISTORICAL_DEFINITIONS[number]['version'],
  >(
    modelVersion: MODEL_VERSION,
  ): Schema.Codec<
    string extends VERSION ? any : IMoveMutation<this>,
    string extends VERSION
      ? any
      : Readonly<{
          modelName: MODEL_NAME;
          modelVersion: MODEL_VERSION;
          operationName: 'move';
          resourceId: InferIdFromAbbreviation<ABBREVIATION>;
          operation: {
            readonly property: string;
            readonly prevId: string;
            readonly nextId: string;
          };
        }>
  >;
  move<
    MODEL_VERSION extends VERSION | HISTORICAL_DEFINITIONS[number]['version'],
  >(
    modelVersion: MODEL_VERSION,
    props: {
      readonly resourceId: InferIdFromAbbreviation<ABBREVIATION>;
      readonly property: string;
      readonly prevId: string;
      readonly nextId: string;
    },
  ): Effect.Effect<
    string extends VERSION ? any : IMoveMutation<this>,
    IAnyError
  >;
  replicateResourceMutation<
    SOURCE_MODEL extends IModel,
    SERVICE_NAME extends string,
    MODEL_VERSION extends
      | SOURCE_MODEL['version']
      | SOURCE_MODEL['historicalDefinitions'][number]['version'],
  >(
    this: string extends VERSION
      ? any
      : IModelReplica<SOURCE_MODEL, SERVICE_NAME>,
    modelVersion: MODEL_VERSION,
  ): Schema.Codec<
    string extends VERSION
      ? any
      : IReplicateResourceMutation<
          IModelReplica<SOURCE_MODEL, SERVICE_NAME>,
          MODEL_VERSION extends SOURCE_MODEL['version']
            ? IModelReplica<SOURCE_MODEL, SERVICE_NAME>['propertiesShape']
            : Extract<
                IModelReplica<
                  SOURCE_MODEL,
                  SERVICE_NAME
                >['historicalDefinitions'][number],
                { readonly version: MODEL_VERSION }
              >['propertiesShape']
        >,
    string extends VERSION
      ? any
      : Readonly<{
          modelName: SOURCE_MODEL['modelName'];
          modelVersion: MODEL_VERSION;
          operationName: 'replicateResource';
          resourceId: InferIdFromAbbreviation<SOURCE_MODEL['abbreviation']>;
          operation: {
            readonly serviceName: SERVICE_NAME;
            readonly resource: InferEncodedRow<
              MODEL_VERSION extends SOURCE_MODEL['version']
                ? IModelReplica<SOURCE_MODEL, SERVICE_NAME>['propertiesShape']
                : Extract<
                    IModelReplica<
                      SOURCE_MODEL,
                      SERVICE_NAME
                    >['historicalDefinitions'][number],
                    { readonly version: MODEL_VERSION }
                  >['propertiesShape']
            >;
          };
        }>
  >;
  replicateResource<
    SOURCE_MODEL extends IModel,
    SERVICE_NAME extends string,
    MODEL_VERSION extends
      | SOURCE_MODEL['version']
      | SOURCE_MODEL['historicalDefinitions'][number]['version'],
  >(
    this: string extends VERSION
      ? any
      : IModelReplica<SOURCE_MODEL, SERVICE_NAME>,
    modelVersion: MODEL_VERSION,
    props: {
      readonly resource: InferDecodedRow<
        MODEL_VERSION extends SOURCE_MODEL['version']
          ? SOURCE_MODEL['propertiesShape']
          : Extract<
              SOURCE_MODEL['historicalDefinitions'][number],
              { readonly version: MODEL_VERSION }
            >['propertiesShape']
      >;
    },
  ): Effect.Effect<
    string extends VERSION
      ? any
      : IReplicateResourceMutation<
          IModelReplica<SOURCE_MODEL, SERVICE_NAME>,
          MODEL_VERSION extends SOURCE_MODEL['version']
            ? IModelReplica<SOURCE_MODEL, SERVICE_NAME>['propertiesShape']
            : Extract<
                IModelReplica<
                  SOURCE_MODEL,
                  SERVICE_NAME
                >['historicalDefinitions'][number],
                { readonly version: MODEL_VERSION }
              >['propertiesShape']
        >,
    IAnyError
  >;
}

export type IModelReplica<
  SOURCE_MODEL extends IModel = IModel,
  SERVICE_NAME extends string = string,
> = IModel<
  SOURCE_MODEL['attributes'],
  SOURCE_MODEL['abbreviation'],
  SOURCE_MODEL['modelName'],
  SOURCE_MODEL['version'],
  SOURCE_MODEL['historicalDefinitions'] extends infer HISTORICAL_DEFINITIONS extends
    readonly {
      readonly abbreviation: string;
      readonly attributes: IShape;
      readonly adaptResource: (props: {
        resource: any;
      }) => Effect.Effect<unknown, IAnyError>;
      readonly indexes: readonly IDrizzleIndexConfig<string>[];
      readonly modelName: string;
      readonly propertiesShape: IShape;
      readonly version: string;
    }[]
    ? {
        readonly [INDEX in keyof HISTORICAL_DEFINITIONS]: HISTORICAL_DEFINITIONS[INDEX] extends infer DEFINITION extends
          {
            readonly attributes: IShape;
            readonly indexes: readonly IDrizzleIndexConfig<string>[];
            readonly propertiesShape: IShape;
            readonly version: string;
          }
          ? Readonly<{
              abbreviation: SOURCE_MODEL['abbreviation'];
              attributes: DEFINITION['attributes'];
              adaptResource: (props: {
                resource: InferDecodedRow<
                  SOURCE_MODEL['propertiesShape'] & {
                    deletedAt: IDateDescriptor<true>;
                  }
                >;
              }) => Effect.Effect<
                InferDecodedRow<
                  DEFINITION['propertiesShape'] & {
                    deletedAt: IDateDescriptor<true>;
                  }
                >,
                IAnyError
              >;
              indexes: DEFINITION['indexes'];
              modelName: SOURCE_MODEL['modelName'];
              propertiesShape: DEFINITION['propertiesShape'] & {
                deletedAt: IDateDescriptor<true>;
              };
              version: DEFINITION['version'];
            }>
          : never;
      }
    : never,
  SOURCE_MODEL['propertiesShape'] & {
    deletedAt: IDateDescriptor<true>;
  }
> & {
  readonly sourceModel: SOURCE_MODEL;
  readonly serviceName: SERVICE_NAME;
};

export type InferResource<
  MODEL extends IModel,
  PROPERTIES_SHAPE extends IShape = MODEL['propertiesShape'],
> = IDecodedResource & InferDecodedRow<PROPERTIES_SHAPE>;

export type InferEncodedResource<MODEL extends IModel> = InferEncodedRow<
  MODEL['propertiesShape']
>;

export type InferPropertiesTable<MODEL extends IModel> = IDrizzleSchema<
  MODEL['modelName'],
  MODEL['propertiesShape']
>;

export type InferAttributesSchema<MODEL extends IModel> = Schema.Codec<
  InferDecodedRow<MODEL['attributes']>,
  InferEncodedRow<MODEL['attributes']>
> &
  Schema.Struct<{
    [K in keyof MODEL['attributes']]: Schema.Codec<
      IPrimitiveDescriptorDecoded<MODEL['attributes'][K]>,
      IPrimitiveDescriptorEncoded<MODEL['attributes'][K]>
    >;
  }>;

export type IModels = Record<string, IModel>;

export type IAssertValidModels<MODELS extends IModels> = {
  [K in keyof MODELS & string]: K extends MODELS[K]['modelName']
    ? MODELS[K]['modelName'] extends K
      ? {
          [ATTRIBUTE_KEY in keyof MODELS[K]['attributes'] &
            string]: MODELS[K]['attributes'][ATTRIBUTE_KEY] extends IAnyRefDescriptor
            ? MODELS[K]['attributes'][ATTRIBUTE_KEY]['targetTableName'] extends infer TARGET_MODEL_NAME extends
                keyof MODELS & string
              ? MODELS[TARGET_MODEL_NAME]['table'] extends MODELS[K]['attributes'][ATTRIBUTE_KEY]['table']
                ? MODELS[K]['attributes'][ATTRIBUTE_KEY]['table'] extends MODELS[TARGET_MODEL_NAME]['table']
                  ? MODELS[K]
                  : MODELS[TARGET_MODEL_NAME] extends {
                        readonly sourceModel: infer SOURCE_MODEL extends IModel;
                      }
                    ? SOURCE_MODEL['table'] extends MODELS[K]['attributes'][ATTRIBUTE_KEY]['table']
                      ? MODELS[K]['attributes'][ATTRIBUTE_KEY]['table'] extends SOURCE_MODEL['table']
                        ? MODELS[K]
                        : ITypeError<`ref "${MODELS[K]['modelName'] & string}.${ATTRIBUTE_KEY}" target model must match models.${TARGET_MODEL_NAME}`>
                      : ITypeError<`ref "${MODELS[K]['modelName'] & string}.${ATTRIBUTE_KEY}" target model must match models.${TARGET_MODEL_NAME}`>
                    : ITypeError<`ref "${MODELS[K]['modelName'] & string}.${ATTRIBUTE_KEY}" target model must match models.${TARGET_MODEL_NAME}`>
                : MODELS[TARGET_MODEL_NAME] extends {
                      readonly sourceModel: infer SOURCE_MODEL extends IModel;
                    }
                  ? SOURCE_MODEL['table'] extends MODELS[K]['attributes'][ATTRIBUTE_KEY]['table']
                    ? MODELS[K]['attributes'][ATTRIBUTE_KEY]['table'] extends SOURCE_MODEL['table']
                      ? MODELS[K]
                      : ITypeError<`ref "${MODELS[K]['modelName'] & string}.${ATTRIBUTE_KEY}" target model must match models.${TARGET_MODEL_NAME}`>
                    : ITypeError<`ref "${MODELS[K]['modelName'] & string}.${ATTRIBUTE_KEY}" target model must match models.${TARGET_MODEL_NAME}`>
                  : ITypeError<`ref "${MODELS[K]['modelName'] & string}.${ATTRIBUTE_KEY}" target model must match models.${TARGET_MODEL_NAME}`>
              : ITypeError<`ref "${MODELS[K]['modelName'] & string}.${ATTRIBUTE_KEY}" target model "${MODELS[K]['attributes'][ATTRIBUTE_KEY]['targetTableName'] & string}" is not registered on controller models`>
            : MODELS[K];
        }[keyof MODELS[K]['attributes'] & string] extends infer RESULT
        ? Exclude<RESULT, MODELS[K]> extends never
          ? MODELS[K]
          : Exclude<RESULT, MODELS[K]>
        : never
      : ITypeError<`models key "${K}" must equal model.modelName "${MODELS[K]['modelName'] & string}"`>
    : ITypeError<`models key "${K}" must equal model.modelName "${MODELS[K]['modelName'] & string}"`>;
}[keyof MODELS & string] extends infer RESULT
  ? Exclude<RESULT, MODELS[keyof MODELS & string]> extends never
    ? MODELS
    : Exclude<RESULT, MODELS[keyof MODELS & string]>
  : never;

type IRelationRefSelector<
  MODEL extends IModel = IModel,
  OWN_REF extends string = string,
  CONNECTED_REF extends keyof MODEL['attributes'] & string =
    keyof MODEL['attributes'] & string,
> =
  | {
      ownRef: OWN_REF;
      connectedRef?: never;
    }
  | {
      ownRef?: never;
      connectedRef: CONNECTED_REF;
    };

export type IConnectOneRelation<
  MODEL extends IModel = IModel,
  OWN_REF extends string = string,
  CONNECTED_REF extends keyof MODEL['attributes'] & string =
    keyof MODEL['attributes'] & string,
> = {
  kind: 'one';
  model: MODEL;
} & IRelationRefSelector<MODEL, OWN_REF, CONNECTED_REF>;

export type IConnectManyRelation<
  MODEL extends IModel = IModel,
  OWN_REF extends string = string,
  CONNECTED_REF extends keyof MODEL['attributes'] & string =
    keyof MODEL['attributes'] & string,
> = {
  kind: 'many';
  model: MODEL;
} & IRelationRefSelector<MODEL, OWN_REF, CONNECTED_REF>;

export type IAnyConnectRelation = IConnectOneRelation | IConnectManyRelation;

export type IRelationsByModelKey<MODELS extends Record<string, IModel>> =
  Partial<
    Record<
      keyof MODELS & string,
      {
        [key: string]: IAnyConnectRelation;
      }
    >
  >;

export type IRelationHelpers = {
  connectOne: <
    MODEL extends IModel,
    OWN_REF extends string,
    CONNECTED_REF extends keyof MODEL['attributes'] & string,
  >(
    props: {
      model: MODEL;
    } & IRelationRefSelector<MODEL, OWN_REF, CONNECTED_REF>,
  ) => IConnectOneRelation<MODEL, OWN_REF, CONNECTED_REF>;
  connectMany: <
    MODEL extends IModel,
    OWN_REF extends string,
    CONNECTED_REF extends keyof MODEL['attributes'] & string,
  >(
    props: {
      model: MODEL;
    } & IRelationRefSelector<MODEL, OWN_REF, CONNECTED_REF>,
  ) => IConnectManyRelation<MODEL, OWN_REF, CONNECTED_REF>;
};

export type IAggregateId = InferIdFromAbbreviation<
  (typeof coreAbbreviations)['aggregate']
>;

/** Alias for resource id string type (e.g. \`usr_xxx\`). */
export type IResourceIdString<ABBREVIATION extends string> =
  InferIdFromAbbreviation<ABBREVIATION>;

export type IRef = Readonly<{
  id: string;
  modelName: string;
}>;

assert<Equals<IRef['id'], string>>();

export type IAnyResource = IDecodedResource & {
  readonly [key: string]: IPrimitive;
};
