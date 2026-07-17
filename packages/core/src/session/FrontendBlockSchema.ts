/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded types are invariant. */

import { Schema } from 'effect';

import {
  ExecutedPushedCommandSchema,
  FailedPushedCommandSchema,
  PushedCommandSchema,
} from '../contracts/CommandSchema.ts';
import { EncodedResourceSchema } from '../models/EncodedResourceSchema.ts';
import { makeAbbreviationIdSchema } from '../models/makeIdSchema.ts';
import { RefSchema } from '../models/ResourceSchema.ts';
import { coreAbbreviations } from '../utils/coreAbbreviations.ts';

import type { IFrontendBlock, IFrontendDelta } from './types.ts';

export const FrontendDeltaSchema: Schema.Schema<IFrontendDelta, any> =
  Schema.Struct({
    inserted: Schema.Array(EncodedResourceSchema),
    updated: Schema.Array(EncodedResourceSchema),
    deleted: Schema.Array(RefSchema),
  });

export const FrontendBlockSchema = Schema.Struct({
  frontendName: Schema.String,
  lastAccountCursor: makeAbbreviationIdSchema(coreAbbreviations.accountCursor),
  frontendIndex: Schema.Number,
  lastRebasedPushedCursor: Schema.NullOr(
    makeAbbreviationIdSchema(coreAbbreviations.pushedCursor),
  ),
  delta: FrontendDeltaSchema,
  pendingPushedCommands: Schema.Array(PushedCommandSchema),
  executedPushedCommands: Schema.Array(ExecutedPushedCommandSchema),
  failedPushedCommands: Schema.Array(FailedPushedCommandSchema),
}) satisfies Schema.Schema<IFrontendBlock, any>;
