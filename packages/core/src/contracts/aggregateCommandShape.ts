import { primitives } from '@zerospin/schema';

/** Aggregate command input at the finalize boundary. */
export const aggregateCommandShape = {
  id: primitives.primaryKey({ abbreviation: 'cmd' }),
  commandName: primitives.text(),
  payload: primitives.text(),
  contractVersion: primitives.text(),
  aggregateId: primitives.text(),
  aggregateName: primitives.text(),
  systemName: primitives.text(),
  sessionId: primitives.foreignKey({ abbreviation: 'sesn', nullable: true }),
  userId: primitives.text({ nullable: true }),
  frontendName: primitives.text({ nullable: true }),
  pushIndex: primitives.integer({ nullable: true }),
};
