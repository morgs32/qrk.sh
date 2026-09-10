import { config, system } from 'system';

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
