import { Exit, Schema } from 'effect';

import { AuthenticationSchema } from '../authentication/makeVersion.ts';

import type { ISystem, ISystemConfig } from './types.ts';

/** Validate live configuration capabilities without copying or executing them. */
export const ZerospinConfigSchema = Schema.declare<ISystemConfig>(
  (input): input is ISystemConfig => {
    const decoded = Schema.decodeUnknownExit(
      Schema.Struct({
        system: Schema.declare<ISystem>((value): value is ISystem =>
          Schema.is(
            Schema.Struct({
              name: Schema.String,
              authentication: Schema.Array(AuthenticationSchema),
              aggregates: Schema.Record(
                Schema.String,
                Schema.Record(
                  Schema.String,
                  Schema.Struct({ version: Schema.String }),
                ),
              ),
              services: Schema.Record(Schema.String, Schema.Struct({})),
              config: Schema.declare(
                (fn): fn is (...args: never[]) => unknown =>
                  typeof fn === 'function',
              ),
            }),
          )(value),
        ),
      }),
    )(input, { onExcessProperty: 'error' });
    if (Exit.isFailure(decoded)) return false;
    return true;
  },
);
