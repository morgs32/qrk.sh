import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeTable } from '@zerospin/shapes';

import { serviceActorVersionRepoDbConfig } from '../ServiceActorVersionRepo/serviceActorVersionRepoDbConfig.js';

/** Retain each selected local execution with original command identity. */
export const serviceActorVersionChainDbConfig = makeDbConfig({
  tables: {
    browserCommands: makeTable({
      name: 'browserCommands',
      shape: serviceActorVersionRepoDbConfig.tables.browserCommandOutbox.shape,
    }),
  },
});
