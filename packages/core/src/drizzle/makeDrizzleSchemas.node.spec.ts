import type { AnyRelations, Many, One } from 'drizzle-orm';
import { assert, type Equals } from 'tsafe';
import { describe, it } from 'vitest';

import { mainModels } from '../fixtures/system.ts';

import type { IDrizzleRelationsFromModels } from './types.ts';

type IDrizzleRelations<
  MODELS extends typeof mainModels,
  _OTHER_TABLES extends Record<string, never> = Record<string, never>,
> = IDrizzleRelationsFromModels<MODELS> & AnyRelations;

type IRelations = IDrizzleRelations<typeof mainModels, {}>;

describe('IDrizzleRelations', () => {
  it('infers forward and inverse model relations', () => {
    assert<Equals<keyof IRelations['list']['relations'], 'items' | 'user'>>();
    assert<Equals<keyof IRelations['item']['relations'], 'list'>>();
    assert<Equals<keyof IRelations['user']['relations'], 'lists'>>();

    assert<
      Equals<IRelations['list']['relations']['user'], One<'user', false>>
    >();
    assert<
      Equals<IRelations['item']['relations']['list'], One<'list', false>>
    >();
    assert<Equals<IRelations['user']['relations']['lists'], Many<'list'>>>();
  });

  it('uses default one-side naming without Id suffix', () => {
    assert<
      Equals<Extract<keyof IRelations['list']['relations'], 'userId'>, never>
    >();
    assert<Equals<IRelations['list']['name'], 'list'>>();
  });
});
