import type { IZerospinErrorJson } from '@zerospin/error';
import type { IRpcEnvelope } from '@zerospin/logger';

import type {
  IAggregateCommand,
  IEncodedCommand,
  IServiceCommand,
} from '../contracts/types.js';

export type IMachineSourceDelivery = Readonly<{
  rows: readonly unknown[];
  lastIndex: number;
}>;

export type IMachineResultsSubscriber = Readonly<{
  receive(
    delivery: IMachineSourceDelivery,
  ): PromiseLike<IRpcEnvelope<void, IZerospinErrorJson>>;
}>;

export interface IAggregateMachineReceiver {
  ready(): PromiseLike<IRpcEnvelope<void, IZerospinErrorJson>>;
  frozenCommandMatches(props: {
    revision: number;
    mode: 'push' | 'execute';
    bindingName: string;
    command:
      | IEncodedCommand<IAggregateCommand>
      | IEncodedCommand<IServiceCommand>;
  }): PromiseLike<IRpcEnvelope<boolean, IZerospinErrorJson>>;
  machineResultsFanoutSubscriber(sourceKey: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
    aggregateVersion: string;
  }): PromiseLike<IMachineResultsSubscriber>;
}

export interface IServiceMachineReceiver {
  ready(): PromiseLike<IRpcEnvelope<void, IZerospinErrorJson>>;
  frozenCommandMatches(props: {
    revision: number;
    mode: 'push' | 'execute';
    bindingName: string;
    command:
      | IEncodedCommand<IAggregateCommand>
      | IEncodedCommand<IServiceCommand>;
  }): PromiseLike<IRpcEnvelope<boolean, IZerospinErrorJson>>;
  machineResultsFanoutSubscriber(sourceKey: {
    systemId: string;
    serviceName: string;
    serviceVersion: string;
  }): PromiseLike<IMachineResultsSubscriber>;
}
