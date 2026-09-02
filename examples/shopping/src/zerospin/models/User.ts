import { makeModel, primitives } from '@zerospin/sdk/browser';
import { Schema } from 'effect';

export const ClerkUserIdSchema = Schema.String.check(
  Schema.isMinLength(1),
).pipe(Schema.brand('ClerkUserId'));

export type IClerkUserId = Schema.Schema.Type<typeof ClerkUserIdSchema>;

export const User = makeModel(
  {
    abbreviation: 'usr',
    modelName: 'user',
    attributes: {
      clerkUserId: primitives.text({ unique: true }),
      name: primitives.text({ nullable: true }),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);
