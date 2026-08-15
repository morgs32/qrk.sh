import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import type { IAnyError } from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import type { ManagedRuntime } from 'effect';

import type { ServiceFrontendReplicaRepo } from '../ServiceFrontendReplicaRepo/ServiceFrontendReplicaRepo.ts';

import { getState } from './getState/getState.ts';
import { release } from './release/release.ts';

export class ServiceFrontendReplicaApi extends RpcTarget {
  constructor(
    private readonly props: {
      registrationId: string;
      replicaRuntime: ServiceFrontendReplicaRepo;
      runtime: ManagedRuntime.ManagedRuntime<
        CuidFactory | MonotonicFactory,
        IAnyError
      >;
    },
  ) {
    super();
  }

  async getState() {
    return this.props.runtime.runPromise(
      getState({
        registrationId: this.props.registrationId,
        replicaRuntime: this.props.replicaRuntime,
      }),
    );
  }

  async release() {
    return this.props.runtime.runPromise(
      release({
        registrationId: this.props.registrationId,
        replicaRuntime: this.props.replicaRuntime,
      }),
    );
  }
}
