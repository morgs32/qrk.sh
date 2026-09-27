import { Schema } from 'effect';
export const AdmissionRequestSchema = Schema.Union([
  Schema.Struct({ identity: Schema.Unknown }),
  Schema.Struct({ credentials: Schema.Unknown }),
]);
