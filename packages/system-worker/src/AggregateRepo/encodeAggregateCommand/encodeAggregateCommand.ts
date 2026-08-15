import { encodeCommand } from '@zerospin/core/contracts/encodeCommand';
import type {
  IAggregateCommand,
  IEncodedCommand,
} from '@zerospin/core/contracts/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';
import { system } from 'system';

export const encodeAggregateCommand = Effect.fn(
  'AggregateRepo.encodeAggregateCommand',
)(function* (props: {
  aggregateName: string;
  command: IAggregateCommand;
}): Effect.fn.Return<IEncodedCommand<IAggregateCommand>, IAnyError> {
  const aggregate = yield* getByKeyOrThrow({
    record: system.aggregates,
    key: props.aggregateName,
    recordKind: 'aggregates',
  });
  const contract = Object.values(aggregate.contracts).find(
    candidate => candidate.commandName === props.command.commandName,
  );
  if (contract === undefined) {
    return yield* new ZerospinError({
      code: 'aggregate-contract-not-found',
      message: `Aggregate contract "${props.command.commandName}" was not found`,
    });
  }
  return yield* encodeCommand({ contract, command: props.command });
});
