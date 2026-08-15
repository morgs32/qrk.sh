import type {
  IEncodedCommand,
  IPushedCommand,
} from '@zerospin/core/contracts/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';
import { system } from 'system';

export const runAggregateFrontendGuards = Effect.fn(
  'AggregateRepo.runAggregateFrontendGuards',
)(function* (props: {
  db: IDb;
  command: IEncodedCommand<IPushedCommand>;
}): Effect.fn.Return<void, IAnyError> {
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
  const contract = Object.values(frontendBinding.controller.contracts).find(
    candidate => candidate.commandName === props.command.commandName,
  );
  if (contract === undefined) {
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
  const payload = yield* contract.decodeAndAdaptPayload({
    command: props.command,
  });
  const guards = yield* getByKeyOrThrow({
    record: frontendBinding.controller.guards,
    key: props.command.commandName,
    recordKind: 'frontend guards',
  });
  for (const guard of guards) {
    const query = Object.create(null);
    for (const modelName of Object.keys(guard.models)) {
      const modelQuery = props.db.query[modelName];
      if (modelQuery === undefined) {
        return yield* new ZerospinError({
          code: 'aggregate-guard-model-query-missing',
          message: `AggregateRepo has no query for guard model "${modelName}"`,
        });
      }
      query[modelName] = modelQuery;
    }
    yield* guard.program({
      userId: props.command.userId,
      db: { query },
      payload,
    });
  }
});
