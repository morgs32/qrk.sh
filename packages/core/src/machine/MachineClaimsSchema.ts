import { Schema } from 'effect';

/** Identity retained with an aggregate command submitted by a machine owner. */
export const MachineClaimsSchema = Schema.StructWithRest(Schema.Struct({
  aggregateId: Schema.String,
  machineName: Schema.String,
  bindingName: Schema.String,
}), [Schema.Record(Schema.String, Schema.Unknown)]);
