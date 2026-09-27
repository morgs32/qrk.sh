import { encodedShapeSchema } from '@zerospin/schema';
import { Schema } from 'effect';

export const AggregateSessionLockSchema = Schema.Struct({
  sessionName: Schema.String,
  actorName: Schema.String,
  actorVersion: Schema.String,
  claims: Schema.Struct({
    claimsJsonSchema: Schema.Unknown,
  }),
  models: Schema.Record(
    Schema.String,
    Schema.Struct({
      modelName: Schema.String,
      abbreviation: Schema.String,
      version: Schema.String,
      propertiesShape: encodedShapeSchema,
      indexes: Schema.Array(
        Schema.Struct({
          name: Schema.String,
          columns: Schema.Array(Schema.String),
          unique: Schema.Boolean,
        }),
      ),
    }),
  ),
  contracts: Schema.Record(
    Schema.String,
    Schema.Struct({
      commandName: Schema.String,
      version: Schema.String,
      payloadShape: encodedShapeSchema,
      failureJsonSchema: Schema.Unknown,
    }),
  ),
});

export type IAggregateSessionLock = Schema.Schema.Type<
  typeof AggregateSessionLockSchema
>;
