import type { IActorId } from '../models/types.ts';

import { coreAbbreviations } from './coreAbbreviations.ts';

export function prefixActorId(id: string): IActorId {
  return `${coreAbbreviations.actor}_${id}`;
}
