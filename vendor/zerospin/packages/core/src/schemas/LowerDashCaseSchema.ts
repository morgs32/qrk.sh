import { Schema } from 'effect';

export const LOWER_DASH_CASE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const LOWER_DASH_CASE_VALIDATION_MESSAGE =
  'Use only lowercase letters and numbers, in one segment or hyphen-separated segments (e.g. production, my-service, prod-2).';

export const LowerDashCaseSchema = Schema.NonEmptyTrimmedString.pipe(
  Schema.pattern(LOWER_DASH_CASE_PATTERN, {
    message: () => LOWER_DASH_CASE_VALIDATION_MESSAGE,
  }),
  Schema.brand('LowerDashCase'),
);

export type ILowerDashCase = Schema.Schema.Type<typeof LowerDashCaseSchema>;
