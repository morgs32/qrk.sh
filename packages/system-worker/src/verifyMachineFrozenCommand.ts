import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import type { IAggregateCommand, IEncodedCommand, IServiceCommand } from '@zerospin/core/contracts/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import { Effect, Result, Schema } from 'effect';

import {
  aggregateMachineNameUtils,
  getAggregateMachineRepo,
  getServiceMachineRepo,
  serviceMachineNameUtils,
} from './machineRepoNames.js';

const CommandOwnerSchema = Schema.Tuple([Schema.String, Schema.Int]);

/** Resolve the machine owner encoded in its durable command identity and check its frozen slot. */
export const verifyMachineFrozenCommand = Effect.fn('verifyMachineFrozenCommand')(
  function* (props: {
    command: IEncodedCommand<IAggregateCommand> | IEncodedCommand<IServiceCommand>;
    mode: 'push' | 'execute';
    bindingName: string;
    systemId: string;
    machineName?: string;
  }) {
    const id = props.command.id;
    if (!/^cmd_(?:[0-9a-f]{2})+$/u.test(id)) {
      return yield* makeZerospinError('machine-command-identity-invalid');
    }
    const pairs = id.slice(4).match(/.{2}/gu);
    if (pairs === null) return yield* makeZerospinError('machine-command-identity-invalid');
    const bytes = new Uint8Array(pairs.map(byte => Number.parseInt(byte, 16)));
    const owner = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(CommandOwnerSchema))(
      new TextDecoder().decode(bytes),
    );
    const [repoName, revision] = owner;
    if (revision < 0) return yield* makeZerospinError('machine-command-identity-invalid');
    const aggregate = yield* Effect.result(aggregateMachineNameUtils.parseName(repoName));
    let matches: boolean;
    if (Result.isSuccess(aggregate)) {
      if (aggregate.success.systemId !== props.systemId ||
        (props.machineName !== undefined && aggregate.success.machineName !== props.machineName)) {
        return yield* makeZerospinError('machine-command-owner-invalid');
      }
      matches = yield* getAggregateMachineRepo({ key: aggregate.success }).pipe(
        Effect.flatMap(repo => makeAsync(() => repo.frozenCommandMatches({
          revision,
          mode: props.mode,
          bindingName: props.bindingName,
          command: props.command,
        }))),
        Effect.flatMap(readRpcEnvelope),
      );
    } else {
      const service = yield* Effect.result(serviceMachineNameUtils.parseName(repoName));
      if (Result.isFailure(service)) return yield* makeZerospinError('machine-command-owner-invalid');
      if (service.success.systemId !== props.systemId ||
        (props.machineName !== undefined && service.success.machineName !== props.machineName)) {
        return yield* makeZerospinError('machine-command-owner-invalid');
      }
      matches = yield* getServiceMachineRepo({ key: service.success }).pipe(
        Effect.flatMap(repo => makeAsync(() => repo.frozenCommandMatches({
          revision,
          mode: props.mode,
          bindingName: props.bindingName,
          command: props.command,
        }))),
        Effect.flatMap(readRpcEnvelope),
      );
    }
    if (!matches) return yield* makeZerospinError('machine-contract-forbidden');
  },
);
