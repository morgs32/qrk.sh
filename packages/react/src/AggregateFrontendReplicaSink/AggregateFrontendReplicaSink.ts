import type {
  IAggregateFrontendReplicaBlock,
  IAggregateFrontendReplicaState,
} from '@zerospin/core/session/types';
import type { IAnyErrorJson } from '@zerospin/error';
import type { AggregateFrontendReplicaSinkApi } from '@zerospin/shared-worker/acquireUserPartitionRepo';
import { RpcTarget } from 'capnweb';
import { Effect, type Schema } from 'effect';

import { handleBlock } from './handleBlock/handleBlock';
import { handleFailure } from './handleFailure/handleFailure';
import { replaceState } from './replaceState/replaceState';

export class AggregateFrontendReplicaSink
  extends RpcTarget
  implements AggregateFrontendReplicaSinkApi
{
  constructor(
    private readonly props: {
      handleBlock(
        frontendReplicaBlock: IAggregateFrontendReplicaBlock,
      ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
      replaceState(
        frontendReplicaState: IAggregateFrontendReplicaState,
      ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
      handleFailure(
        failure: IAnyErrorJson,
      ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
    },
  ) {
    super();
  }

  async handleBlock(
    frontendReplicaBlock: IAggregateFrontendReplicaBlock,
  ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    return Effect.runPromise(
      handleBlock({
        frontendReplicaBlock,
        invoke: this.props.handleBlock,
      }),
    );
  }

  async replaceState(
    frontendReplicaState: IAggregateFrontendReplicaState,
  ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    return Effect.runPromise(
      replaceState({
        frontendReplicaState,
        invoke: this.props.replaceState,
      }),
    );
  }

  async handleFailure(
    failure: IAnyErrorJson,
  ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    return Effect.runPromise(
      handleFailure({ failure, invoke: this.props.handleFailure }),
    );
  }
}
