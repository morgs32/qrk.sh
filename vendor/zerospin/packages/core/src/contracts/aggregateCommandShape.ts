import { primitives } from '../models/primitives.ts';
import { coreAbbreviations } from '../utils/coreAbbreviations.ts';

/** Aggregate command input at the finalize boundary. */
export const aggregateCommandShape = {
  id: primitives.primaryKey({ abbreviation: 'cmd' }),
  commandName: primitives.text(),
  payload: primitives.text(),
  contractVersion: primitives.text(),
  commandType: primitives.enum({
    values: ['aggregate'],
  }),
  aggregateId: primitives.text(),
  aggregateName: primitives.text(),
  systemName: primitives.text(),
  sessionId: primitives.opaqueId({ abbreviation: 'sesn', nullable: true }),
  userId: primitives.text({ nullable: true }),
  frontendName: primitives.text({ nullable: true }),
  pushedCursor: primitives.cursor({
    abbreviation: coreAbbreviations.pushedCursor,
    nullable: true,
  }),
};
