import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';

import { serviceActorVersionRepoDbConfig } from '../ServiceActorVersionRepo/serviceActorVersionRepoDbConfig.js';

/** Retain the source command shape; browser delivery projects only permitted fields. */
export const serviceActorVersionChainDbConfig = makeDbConfig({
  tables: {
    commands: serviceActorVersionRepoDbConfig.tables.commands,
  },
});
