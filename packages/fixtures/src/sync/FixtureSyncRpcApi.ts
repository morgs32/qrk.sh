import type { IAnyError } from '@zerospin/error';
import { makeRpcEnvelope, type IRpcEnvelope } from '@zerospin/logger';
import { RpcTarget } from 'capnweb';
import { Effect } from 'effect';

import type { ISnapshot } from './FixtureStateRepo.ts';

/**
 * Cap'n Web gateway for sync e2e tests.
 *
 * Mutations go through FixtureStateRepo; live state push is observed on the
 * Agent WebSocket at `/ws/sync/{name}`.
 */
export class FixtureSyncRpcApi extends RpcTarget {
  constructor(private readonly workerEnv: Env) {
    super();
  }

  ping(): string {
    return 'pong';
  }

  async getSnapshot(props: {
    name: string;
  }): Promise<IRpcEnvelope<ISnapshot, IAnyError>> {
    const { name } = props;
    const { workerEnv } = this;
    return Effect.runPromise(
      Effect.promise(() =>
        workerEnv.FIXTURE_STATE_REPO.getByName(name).getSnapshot(),
      ).pipe(makeRpcEnvelope),
    );
  }

  async bump(props: {
    name: string;
    value: string;
  }): Promise<IRpcEnvelope<ISnapshot, IAnyError>> {
    const { name, value } = props;
    const { workerEnv } = this;
    return Effect.runPromise(
      Effect.promise(() =>
        workerEnv.FIXTURE_STATE_REPO.getByName(name).bump({ value }),
      ).pipe(makeRpcEnvelope),
    );
  }
}
