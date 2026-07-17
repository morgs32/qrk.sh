import type { IAnyErrorJson } from '@zerospin/error';
import type { IRpcEnvelope } from '@zerospin/logger';

export const queuedJobs: Array<{
  name: 'drain' | 'alarm';
  delayMs: number;
  run: () => Promise<IRpcEnvelope<void, IAnyErrorJson>>;
}> = [];

export const harness = {
  failNextSystemWorkerRpc: false,
  failNextAccountBlockPublish: false,
  failNextActorDelivery: false,
  systemWorkerRpcAttempts: 0,
  accountBlockPublishAttempts: 0,
  subscriberDeliveryAttempts: 0,
};

export const resetFinalizeHarness = (): void => {
  queuedJobs.length = 0;
  harness.failNextSystemWorkerRpc = false;
  harness.failNextAccountBlockPublish = false;
  harness.failNextActorDelivery = false;
  harness.systemWorkerRpcAttempts = 0;
  harness.accountBlockPublishAttempts = 0;
  harness.subscriberDeliveryAttempts = 0;
};
