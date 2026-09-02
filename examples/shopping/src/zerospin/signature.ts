import { makeSignature } from '@zerospin/sdk/browser';
import { Schema } from 'effect';

import { ClerkUserIdSchema } from './models/User';

export const signature = makeSignature(
  {
    version: '1.0.0',
    schema: Schema.Struct({ clerkUserId: ClerkUserIdSchema }),
  },
  [],
);
