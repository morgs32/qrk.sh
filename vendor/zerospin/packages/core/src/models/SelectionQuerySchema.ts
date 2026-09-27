import { Schema } from 'effect';

export const SelectionQuerySchema = Schema.Struct({
  sql: Schema.String,
  bindings: Schema.Array(
    Schema.Union([
      Schema.Struct({
        type: Schema.Literal('identity'),
        name: Schema.String,
      }),
      Schema.Struct({
        type: Schema.Literal('literal'),
        value: Schema.Union([Schema.String, Schema.Number, Schema.Null]),
      }),
      Schema.Struct({
        type: Schema.Literal('bytes'),
        value: Schema.Array(Schema.Number),
      }),
      Schema.Struct({ type: Schema.Literal('bigint'), value: Schema.String }),
    ]),
  ),
});
export type ISelectionQuery = typeof SelectionQuerySchema.Type;
