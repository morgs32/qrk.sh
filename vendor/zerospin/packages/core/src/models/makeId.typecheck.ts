import { CuidFactory } from '@zerospin/schema';
import { Effect } from 'effect';
import { assert, type Equals } from 'tsafe';

import { List, User } from '../fixtures/system.ts';

import { makeId } from './makeId.ts';
import { prefixId } from './prefixId.ts';

const userId = prefixId(User, 'seed1');
const listId = Effect.runSync(
  makeId(List).pipe(
    Effect.provideService(CuidFactory, () => Effect.succeed('generated')),
  ),
);
assert<Equals<typeof userId, `usr_${string}`>>();
assert<Equals<typeof listId, `lst_${string}`>>();

// @ts-expect-error Explicit suffixes belong to models.prefixId.
makeId(User, 'seed1');
