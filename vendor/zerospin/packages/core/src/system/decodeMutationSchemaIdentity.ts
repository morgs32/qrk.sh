import { Schema } from 'effect';

const MutationIdentityJsonSchema = Schema.Struct({
  schema: Schema.Struct({
    properties: Schema.Struct({
      modelName: Schema.Struct({
        enum: Schema.NonEmptyArray(Schema.Unknown),
      }),
      modelVersion: Schema.Struct({
        enum: Schema.NonEmptyArray(Schema.Unknown),
      }),
      operationName: Schema.Struct({
        enum: Schema.NonEmptyArray(Schema.Unknown),
      }),
    }),
  }),
});

export function decodeMutationSchemaIdentity(schema: Schema.Top) {
  const document = Schema.toJsonSchemaDocument(schema);
  const decoded = Schema.decodeUnknownSync(MutationIdentityJsonSchema, {
    onExcessProperty: 'ignore',
  })(document);
  return Schema.decodeUnknownSync(
    Schema.Struct({
      modelName: Schema.String,
      modelVersion: Schema.String,
      operationName: Schema.String,
    }),
    { onExcessProperty: 'error' },
  )({
    modelName: decoded.schema.properties.modelName.enum[0],
    modelVersion: decoded.schema.properties.modelVersion.enum[0],
    operationName: decoded.schema.properties.operationName.enum[0],
  });
}
