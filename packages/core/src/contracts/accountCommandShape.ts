import { primitives } from '../models/primitives.ts';
import { coreAbbreviations } from '../utils/coreAbbreviations.ts';

/** Account command input at the finalize boundary. */
export const accountCommandShape = {
  id: primitives.primaryKey({ abbreviation: 'cmd' }),
  commandName: primitives.text(),
  payload: primitives.text(),
  version: primitives.text(),
  commandType: primitives.enum({
    values: ['account'],
  }),
  accountId: primitives.text(),
  accountName: primitives.text(),
  systemName: primitives.text(),
  systemVersion: primitives.text(),
  sessionId: primitives.opaqueId({ abbreviation: 'sesn', nullable: true }),
  actorId: primitives.text({ nullable: true }),
  actorName: primitives.text({ nullable: true }),
  frontendName: primitives.text({ nullable: true }),
  pushedCursor: primitives.cursor({
    abbreviation: coreAbbreviations.pushedCursor,
    nullable: true,
  }),
} as const;
