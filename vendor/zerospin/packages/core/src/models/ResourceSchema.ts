/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded type is invariant; any is intentional for satisfies */
import { Schema } from 'effect';
import { assert, type Equals } from 'tsafe';

import type { IRef } from './types.ts';

export const RefSchema = Schema.Struct({
  id: Schema.String,
  modelName: Schema.String,
}) satisfies Schema.Schema<IRef, any>;

assert<Equals<typeof RefSchema.Type, IRef>>();
