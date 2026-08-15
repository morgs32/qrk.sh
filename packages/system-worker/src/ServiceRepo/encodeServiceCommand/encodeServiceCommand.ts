import { encodeCommand } from '@zerospin/core/contracts/encodeCommand';
import type {
  IEncodedCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';
import { system } from 'system';

export const encodeServiceCommand = Effect.fn(
  'ServiceRepo.encodeServiceCommand',
)(function* (props: {
  serviceName: string;
  command: IServiceCommand;
}): Effect.fn.Return<IEncodedCommand<IServiceCommand>, IAnyError> {
  const service = yield* getByKeyOrThrow({
    record: system.services,
    key: props.serviceName,
    recordKind: 'services',
  });
  const contract = Object.values(service.contracts).find(
    candidate => candidate.commandName === props.command.commandName,
  );
  if (contract === undefined) {
    return yield* new ZerospinError({
      code: 'service-contract-not-found',
      message: `Service contract "${props.command.commandName}" was not found`,
    });
  }
  return yield* encodeCommand({ contract, command: props.command });
});
