import { Schema, type JSONSchema } from 'effect';

export const JsonSchema7RootSchema = Schema.declare(
  (input: unknown): input is JSONSchema.JsonSchema7Root =>
    typeof input === 'object' && input !== null,
);
