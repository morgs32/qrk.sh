import config from 'config';

import { system } from './zerospin.config';

export * from '@zerospin/dev-worker/DevWorker';

// oxlint-disable-next-line import/no-default-export -- Workers require a default entrypoint.
export default {
  fetch() {
    return Response.json({
      name: system.name,
      sameSystem: system === config.system,
    });
  },
};
