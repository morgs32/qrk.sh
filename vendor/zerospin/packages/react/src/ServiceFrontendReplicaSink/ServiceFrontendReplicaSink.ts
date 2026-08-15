import type {
  IServiceFrontendReplicaBlock,
  IServiceFrontendReplicaState,
} from '@zerospin/core/serviceSession/types';
import type { IAnyErrorJson } from '@zerospin/error';
import type { ServiceFrontendReplicaSinkApi } from '@zerospin/shared-worker/acquireUserPartitionRepo';
import { RpcTarget } from 'capnweb';
import { Effect, type Schema } from 'effect';

import { handleBlock } from './handleBlock/handleBlock';
import { handleFailure } from './handleFailure/handleFailure';
import { replaceState } from './replaceState/replaceState';

export class ServiceFrontendReplicaSink
  extends RpcTarget
  implements ServiceFrontendReplicaSinkApi
{
  constructor(
    private readonly props: {
      handleBlock(
        serviceFrontendReplicaBlock: IServiceFrontendReplicaBlock,
      ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
      replaceState(
        serviceFrontendReplicaState: IServiceFrontendReplicaState,
      ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
      handleFailure(
        failure: IAnyErrorJson,
      ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
    },
  ) {
    super();
  }

  async handleBlock(
    serviceFrontendReplicaBlock: IServiceFrontendReplicaBlock,
  ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    return Effect.runPromise(
      handleBlock({
        serviceFrontendReplicaBlock,
        invoke: this.props.handleBlock,
      }),
    );
  }

  async replaceState(
    serviceFrontendReplicaState: IServiceFrontendReplicaState,
  ): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    return Effect.runPromise(
      replaceState({
        serviceFrontendReplicaState,
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
