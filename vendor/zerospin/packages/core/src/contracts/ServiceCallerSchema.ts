import { Schema } from 'effect';

/** Trusted service-command origin retained unchanged from admission to private completion. */
export const ServiceCallerSchema = Schema.Struct({
  actorName: Schema.NonEmptyString,
  actorVersion: Schema.NonEmptyString,
  claims: Schema.Record(Schema.String, Schema.Unknown),
  nodeId: Schema.NullOr(Schema.NonEmptyString),
  sessionName: Schema.NullOr(Schema.NonEmptyString),
  nodeIndex: Schema.NullOr(Schema.Int.check(Schema.isGreaterThan(0))),
}).check(
  Schema.makeFilter(
    value =>
      (value.nodeId === null &&
        value.sessionName === null &&
        value.nodeIndex === null) ||
      (value.nodeId !== null &&
        value.sessionName !== null &&
        value.nodeIndex !== null) ||
      'A browser caller requires its complete session and node occurrence',
  ),
);
