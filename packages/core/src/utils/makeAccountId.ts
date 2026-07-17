import type { IAccountId } from '../models/types.ts';

import { coreAbbreviations } from './coreAbbreviations.ts';

export function makeAccountId(props: { id: string }): IAccountId {
  const { id } = props;
  return `${coreAbbreviations.account}_${id}`;
}
