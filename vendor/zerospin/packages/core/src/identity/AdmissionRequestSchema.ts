import { Schema } from 'effect';
export const AdmissionRequestSchema = Schema.Union([
  Schema.Struct({ claims: Schema.Unknown }),
  Schema.Struct({ credentials: Schema.Unknown }),
]);
