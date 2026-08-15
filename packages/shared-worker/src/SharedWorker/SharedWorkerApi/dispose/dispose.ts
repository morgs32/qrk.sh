import type { IAnyError, IAnyErrorJson } from '@zerospin/error';
import { RpcStub } from 'capnweb';
import { Effect, type Schema } from 'effect';

import type { AggregateFrontendReplicaRepo } from '../../AggregateFrontendReplicaRepo/AggregateFrontendReplicaRepo.ts';
import type { ServiceFrontendReplicaRepo } from '../../ServiceFrontendReplicaRepo/ServiceFrontendReplicaRepo.ts';

export const dispose = Effect.fn('SharedWorkerApi.dispose')(
  (props: {
    ownerToken: object;
    terminalError: IAnyError;
    authenticationState: {
      configuration: null | {
        generateSignature:
          | RpcStub<() => Promise<Schema.EitherEncoded<unknown, IAnyErrorJson>>>
          | (() => Promise<Schema.EitherEncoded<unknown, IAnyErrorJson>>);
      };
      boundIdentity: object | null;
      current: null | { releaseAuthenticatedApi(): void };
      pending: object | null;
      terminalError: IAnyError | null;
    };
    aggregateReplicaRuntimes: Map<string, AggregateFrontendReplicaRepo>;
    serviceReplicaRuntimes: Map<string, ServiceFrontendReplicaRepo>;
  }) =>
    Effect.sync(() => {
      if (props.authenticationState.terminalError !== null) return;
      props.authenticationState.terminalError = props.terminalError;
      const authenticated = props.authenticationState.current;
      const generateSignature =
        props.authenticationState.configuration?.generateSignature;
      props.authenticationState.current = null;
      props.authenticationState.pending = null;
      props.authenticationState.boundIdentity = null;
      props.authenticationState.configuration = null;
      authenticated?.releaseAuthenticatedApi();
      if (generateSignature instanceof RpcStub) {
        generateSignature[Symbol.dispose]();
      }
      for (const replicaRuntime of props.aggregateReplicaRuntimes.values()) {
        void replicaRuntime.releaseOwner(props.ownerToken);
      }
      for (const replicaRuntime of props.serviceReplicaRuntimes.values()) {
        void replicaRuntime.releaseOwner(props.ownerToken);
      }
    }),
);
