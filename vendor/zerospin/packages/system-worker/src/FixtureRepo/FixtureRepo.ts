import { RoutePattern } from '@remix-run/route-pattern';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeTable } from '@zerospin/core/models/makeTable';
import { primitives } from '@zerospin/core/models/primitives';
import { Effect, ManagedRuntime } from 'effect';
import invariant from 'tiny-invariant';

import { makeRepo } from '../makeRepo/makeRepo.js';
import { makeRepoUtils } from '../makeRepo/makeRepoUtils.js';

const managedRuntime = ManagedRuntime.make(AsyncLive);

const fixtureRepoTables = {
  fixtureValues: makeTable({
    name: 'fixtureValues',
    shape: {
      scope: primitives.text(),
      id: primitives.text(),
      value: primitives.text(),
    },
    indexes: [
      {
        name: 'fixtureValues_scope_id_unique',
        columns: ['scope', 'id'],
        unique: true,
      },
    ],
  }),
};

const fixtureRepoDbConfig = makeDbConfig({ tables: fixtureRepoTables });

const fixtureRepoUtils = makeRepoUtils({
  abbreviation: undefined,
  namePattern: RoutePattern.parse('/:scope/:id'),
  managedRuntime,
  getDbConfig: Effect.fn('FixtureRepo.getDbConfig')(function* (_props) {
    yield* Effect.void;
    return fixtureRepoDbConfig;
  }),
});

export class FixtureRepo extends makeRepo({ repoUtils: fixtureRepoUtils }) {
  async getOpenedName(): Promise<string> {
    const name = this.ctx.id.name;
    invariant(name, 'FixtureRepo must be accessed via getByName');
    return name;
  }

  async writeValue(props: { value: string }): Promise<void> {
    const { value } = props;
    await this.db
      .insert(this.schema.fixtureValues)
      .values({
        scope: this.key.scope,
        id: this.key.id,
        value,
      })
      .run();
  }
}

export { managedRuntime };
