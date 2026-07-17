import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import type { IAnyErrorJson } from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import { Brand, Effect, type Schema } from 'effect';

import type { ISnapshot } from './FixtureStateRepo.js';

/**
 * Cap'n Web gateway for sync e2e tests.
 *
 * Mutations go through FixtureStateRepo; live state push is observed on the
 * Agent WebSocket at `/ws/sync/{name}`.
 */
export class FixtureSyncRpcApi extends RpcTarget {
  declare [Brand.BrandTypeId]: 'Apis';

  constructor(private readonly workerEnv: Env) {
    super();
  }

  ping(): string {
    return 'pong';
  }

  async getSnapshot(props: {
    name: string;
  }): Promise<Schema.EitherEncoded<ISnapshot, IAnyErrorJson>> {
    const { name } = props;
    const { workerEnv } = this;
    return Effect.runPromise(
      Effect.promise(() =>
        workerEnv.FIXTURE_STATE_REPO.getByName(name).getSnapshot(),
      ).pipe(encodeRpc),
    );
  }

  async bump(props: {
    name: string;
    value: string;
  }): Promise<Schema.EitherEncoded<ISnapshot, IAnyErrorJson>> {
    const { name, value } = props;
    const { workerEnv } = this;
    return Effect.runPromise(
      Effect.promise(() =>
        workerEnv.FIXTURE_STATE_REPO.getByName(name).bump({ value }),
      ).pipe(encodeRpc),
    );
  }
}
