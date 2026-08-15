import { makeSignature } from '@zerospin/sdk/browser';
import { Schema } from 'effect';

import { ClerkUserIdSchema } from './models';

export const authenticationSignature = makeSignature(
  {
    version: '1.0.0',
    schema: Schema.Struct({ clerkUserId: ClerkUserIdSchema }),
  },
  [],
);
