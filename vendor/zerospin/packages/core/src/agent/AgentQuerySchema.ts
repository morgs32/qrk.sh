import { Schema } from 'effect';

const literal = Schema.Union([
  Schema.String,
  Schema.Number.check(Schema.isFinite()),
  Schema.Boolean,
]);
export const AgentQuerySchema = Schema.Struct({
  modelName: Schema.NonEmptyString,
  where: Schema.optionalKey(
    Schema.Record(
      Schema.String,
      Schema.Struct({
        eq: Schema.optionalKey(literal),
        ne: Schema.optionalKey(literal),
        gt: Schema.optionalKey(literal),
        gte: Schema.optionalKey(literal),
        lt: Schema.optionalKey(literal),
        lte: Schema.optionalKey(literal),
        isNull: Schema.optionalKey(Schema.Boolean),
        isNotNull: Schema.optionalKey(Schema.Boolean),
      }),
    ),
  ),
});
export type IAgentQuery = typeof AgentQuerySchema.Type;
