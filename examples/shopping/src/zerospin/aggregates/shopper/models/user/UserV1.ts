import { models, primitives } from '@zerospin/sdk/browser';
import { Schema } from 'effect';

import { user } from './user';

export const ClerkUserIdSchema = Schema.String.check(
  Schema.isMinLength(1),
).pipe(Schema.brand('ClerkUserId'));

export type IClerkUserId = Schema.Schema.Type<typeof ClerkUserIdSchema>;

export const userV1 = models.makeVersion(user, {
  attributes: {
    clerkUserId: primitives.text({ unique: true }),
    name: primitives.text({ nullable: true }),
  },
  indexes: [],
  version: '1.0.0',
});
