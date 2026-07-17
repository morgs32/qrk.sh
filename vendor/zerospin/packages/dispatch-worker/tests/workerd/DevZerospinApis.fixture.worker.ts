import { env } from 'cloudflare:workers';

import { makeSystemWorkerName } from '@zerospin/dispatch-worker/makeSystemWorkerName';

export { AccountBlockRepo } from 'system-worker';
export { AccountRepo } from 'system-worker';
export { ActorBlockRepo } from 'system-worker';
export { ActorRepo } from 'system-worker';
export { AuthorizationRepo } from 'system-worker';
export { DevZerospinApis } from '@zerospin/dispatch-worker/DevZerospinApis/DevZerospinApis';
export { FrontendBlockRepo } from 'system-worker';
export { FrontendRepo } from 'system-worker';
export { ServiceBlockRepo } from 'system-worker';
export { ServiceRepo } from 'system-worker';
export { SystemLogAgent } from 'system-worker';
export { SystemLogRepo } from 'system-worker';
export { SystemRepo } from 'system-worker';
export { SystemWorker } from 'system-worker';

// oxlint-disable-next-line import/no-default-export -- workerd fixture entrypoint
export default {
  fetch(request: Request) {
    return env.DEV_ZEROSPIN_APIS.getByName(
      makeSystemWorkerName({
        systemId: env.ZEROSPIN_SYSTEM_ID,
        instanceId: env.ZEROSPIN_INSTANCE_ID,
      }),
    ).fetch(request);
  },
};
