import type { IAnyError } from '@zerospin/error';
import type {
  CuidFactory,
  IAnyRefDescriptor,
  IAnyShape,
  IDateDescriptor,
  IDrizzleIndexConfig,
  IDrizzleSchema,
  IEncodedShape,
  IIntegerDescriptor,
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
import type { Effect, Schema } from 'effect';
import type { Brand } from 'effect/Brand';
import { assert, type Equals } from 'tsafe';

import type { IEncodedAppliedMutation } from '../contracts/types.ts';
import { type coreAbbreviations } from '../utils/coreAbbreviations.ts';

// --- model ---

export type IProperties = IResourceShape & IShape;

export type IEncodedProperties = InferEncodedRow<IProperties>;
export type IDecodedProperties = InferDecodedRow<IProperties>;

/**
 * Caller payload **input** for contracts: IDs must be supplied. Scalar fields
 * and nullable JSON fields with `defaultValue` may be omitted.
 * `validatePayload` fills defaults via
 * `descriptorToEffectSchema`.
 * Other fields match {@link InferDecodedRow}.
 */
export type InferPayloadInput<SHAPE extends IAnyShape> = Prettify<
  {
    [K in keyof SHAPE as SHAPE[K] extends {
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
    [K in keyof SHAPE as SHAPE[K] extends {
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
      : never]?: IPrimitiveDescriptorDecoded<SHAPE[K]>;
  }
>;

/** Command / contract program payload after defaults are filled. */
export type InferCommandPayload<SHAPE extends IAnyShape> = {
  [K in keyof SHAPE]: IPrimitiveDescriptorDecoded<SHAPE[K]>;
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

/** Keys merged by {@link makeVersion}; not part of payload / {@link IModel.attributesSchema}. */
export type IModelReservedAttributeKeys =
  | 'createdAt'
  | 'deletedAt'
  | 'serviceIndex'
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
  readonly attributesShape: Readonly<IEncodedShape>;
  readonly propertiesShape: Readonly<IEncodedShape>;
  readonly indexes: readonly Readonly<IDrizzleIndexConfig<string>>[];
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
  PROPERTIES_SHAPE extends IShape = InferProperties<ATTRIBUTES, ABBREVIATION>,
> {
  readonly abbreviation: ABBREVIATION;
  readonly attributes: ATTRIBUTES;
  readonly indexes: readonly Readonly<
    IDrizzleIndexConfig<keyof PROPERTIES_SHAPE & string>
  >[];

  readonly modelName: MODEL_NAME;
  readonly version: VERSION;
  readonly makeId: () => Effect.Effect<
    InferIdFromAbbreviation<ABBREVIATION>,
    IAnyError,
    CuidFactory
  >;
  readonly prefixId: (id: string) => InferIdFromAbbreviation<ABBREVIATION>;
  readonly propertiesShape: PROPERTIES_SHAPE;
  readonly table: ITable<
    MODEL_NAME,
    PROPERTIES_SHAPE & {
      readonly [KEY in keyof PROPERTIES_SHAPE]: PROPERTIES_SHAPE[KEY] extends infer DESCRIPTOR
        ? DESCRIPTOR extends IShape[string]
          ? Readonly<DESCRIPTOR>
          : never
        : never;
    }
  >;
  readonly drizzleSchema: IDrizzleResourceTable;
  readonly attributesSchema: Schema.Codec<
    InferDecodedRow<ATTRIBUTES>,
    InferEncodedRow<ATTRIBUTES>
  > &
    Schema.Struct<{
      [K in keyof ATTRIBUTES]: Schema.Codec<
        IPrimitiveDescriptorDecoded<ATTRIBUTES[K]>,
        IPrimitiveDescriptorEncoded<ATTRIBUTES[K]>
      >;
    }>;
  readonly resourceSchema: Schema.Codec<any, any>;
  readonly spec: IModelSpec;
  getVersion(
    modelVersion: string,
  ): IModel<ATTRIBUTES, ABBREVIATION, MODEL_NAME, string>;
  adaptResource(props: {
    version: VERSION;
    resource: InferResource<
      IModel<ATTRIBUTES, ABBREVIATION, MODEL_NAME, VERSION, PROPERTIES_SHAPE>
    >;
  }): Effect.Effect<
    string extends VERSION ? any : InferEncodedRow<PROPERTIES_SHAPE>,
    IAnyError
  >;
}
export type IModelReplica<
  SOURCE_MODEL extends IModel = IModel,
  SERVICE_NAME extends string = string,
  MODEL_VERSION extends string = SOURCE_MODEL['version'],
  MODEL_DEFINITION extends Pick<IModel, 'attributes' | 'propertiesShape'> =
    SOURCE_MODEL,
> = IModel<
  MODEL_DEFINITION['attributes'],
  SOURCE_MODEL['abbreviation'],
  SOURCE_MODEL['modelName'],
  MODEL_VERSION,
  MODEL_DEFINITION['propertiesShape'] & {
    readonly deletedAt: Readonly<IDateDescriptor<true>>;
    readonly serviceIndex: Readonly<IIntegerDescriptor<true>>;
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

export type IAnyModels = Readonly<Record<string, IModel>>;

export type IAssertValidModels<MODELS extends IAnyModels> = {
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
