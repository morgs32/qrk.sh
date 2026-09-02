import type { ServiceChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { ZerospinError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, type Schema } from 'effect';
import { system } from 'system';

export const isServiceCommandRelevant = Effect.fn(
  'MaterializedAggregateRepo.isServiceCommandRelevant',
)(function* (props: {
  aggregateName: string;
  command: Schema.Schema.Type<typeof ServiceChainedCommandSchema>;
  db: IDb;
}) {
  if (props.command.delta === null) {
    return yield* new ZerospinError({
      code: 'materialized-aggregate-service-command-pending',
      message: 'Service relevance requires a terminal service occurrence',
    });
  }
  const aggregate = yield* getByKeyOrThrow({
    record: system.aggregates,
    key: props.aggregateName,
    recordKind: 'aggregates',
  });
  const service = yield* getByKeyOrThrow({
    record: system.services,
    key: props.command.serviceName,
    recordKind: 'services',
  });

  for (const resource of [
    ...props.command.delta.inserted,
    ...props.command.delta.updated,
    ...props.command.delta.deleted,
  ]) {
    const model = aggregate.models[resource.modelName];
    if (
      model === undefined ||
      !('sourceModel' in model) ||
      Reflect.get(model, 'serviceName') !== props.command.serviceName ||
      Reflect.get(model, 'sourceModel') !== service.models[resource.modelName]
    ) {
      continue;
    }
    const existing = props.db
      .select({ id: model.drizzleSchema.id })
      .from(model.drizzleSchema)
      .where(eq(model.drizzleSchema.id, resource.id))
      .get();
    if (existing !== undefined) return true;
  }
  return false;
});
