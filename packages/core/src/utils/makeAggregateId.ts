import type { IAggregateId } from '../models/types.ts';

import { coreAbbreviations } from './coreAbbreviations.ts';

export function makeAggregateId(props: { id: string }): IAggregateId {
  const { id } = props;
  return `${coreAbbreviations.aggregate}_${id}`;
}
