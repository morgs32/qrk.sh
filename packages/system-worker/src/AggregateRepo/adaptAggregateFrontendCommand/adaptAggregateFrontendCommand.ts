import type {
  IAggregateCommand,
  IEncodedCommand,
  IPushedCommand,
} from '@zerospin/core/contracts/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';
import { system } from 'system';

export const adaptAggregateFrontendCommand = Effect.fn(
  'AggregateRepo.adaptAggregateFrontendCommand',
)(function* (props: {
  command: IEncodedCommand<IPushedCommand>;
}): Effect.fn.Return<IEncodedCommand<IAggregateCommand>, IAnyError> {
  const aggregate = yield* getByKeyOrThrow({
    record: system.aggregates,
    key: props.command.aggregateName,
    recordKind: 'aggregates',
  });
  const frontendBinding = yield* getByKeyOrThrow({
    record: aggregate.frontends,
    key: props.command.frontendName,
    recordKind: `frontends owned by aggregate ${props.command.aggregateName}`,
  });
  const frontendContract = Object.values(
    frontendBinding.controller.contracts,
  ).find(candidate => candidate.commandName === props.command.commandName);
  if (frontendContract === undefined) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-contract-definition-missing',
      message: `Selected frontend ${props.command.frontendName} cannot resolve ${props.command.commandName}@${props.command.contractVersion}`,
      extra: {
        aggregateName: props.command.aggregateName,
        commandName: props.command.commandName,
        contractVersion: props.command.contractVersion,
        frontendName: props.command.frontendName,
      },
    });
  }
  const frontendPayload = yield* frontendContract.decodeAndAdaptPayload({
    command: props.command,
  });
  const contractAdapter = yield* getByKeyOrThrow({
    record: frontendBinding.contractAdapters,
    key: props.command.commandName,
    recordKind: 'frontend binding contract adapters',
  });
  const targetContract = yield* getByKeyOrThrow({
    record: frontendBinding.contracts,
    key: props.command.commandName,
    recordKind: 'frontend binding contracts',
  });
  const payload = yield* contractAdapter({
    contract: frontendContract,
    payload: frontendPayload,
  });
  return {
    ...props.command,
    commandName: targetContract.commandName,
    payload: yield* targetContract.encodePayload({ payload }),
    contractVersion: targetContract.version,
    commandType: 'aggregate',
  };
});
