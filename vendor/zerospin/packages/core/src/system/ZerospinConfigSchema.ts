import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Exit, Schema } from 'effect';

import { coreAbbreviations } from '../utils/coreAbbreviations.ts';

import type { ISystem, ISystemConfig } from './types.ts';

/** Validate live configuration capabilities without copying or executing them. */
export const ZerospinConfigSchema = Schema.declare<ISystemConfig>(
  (input): input is ISystemConfig => {
    const decoded = Schema.decodeUnknownExit(
      Schema.Struct({
        systemId: makeAbbreviationIdSchema(coreAbbreviations.system),
        system: Schema.declare<ISystem>((value): value is ISystem =>
          Schema.is(
            Schema.Struct({
              name: Schema.String,
              aggregates: Schema.Record(
                Schema.String,
                Schema.Record(
                  Schema.String,
                  Schema.Struct({ version: Schema.String }),
                ),
              ),
              services: Schema.Record(Schema.String, Schema.Struct({})),
            }),
          )(value),
        ),
      }),
    )(input, { onExcessProperty: 'error' });
    if (Exit.isFailure(decoded)) return false;
    return true;
  },
);
