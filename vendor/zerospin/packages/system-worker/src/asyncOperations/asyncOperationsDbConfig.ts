import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { PublicFailureSchema } from '@zerospin/error';
import { makeTable, primitives } from '@zerospin/schema';
import { Schema } from 'effect';

export const asyncOperationShape = {
  commandId: primitives.text(),
  operationIndex: primitives.integer(),
  asyncContractName: primitives.text(),
  asyncContractVersion: primitives.text(),
  payload: primitives.json({ schema: Schema.Json }),
  committedAt: primitives.date(),
};
export const operationKeyIndex = {
  name: 'command_operation',
  columns: ['commandId', 'operationIndex'] as const,
  unique: true,
};
/** Version-owned production state; transports retain only asyncOperationShape. */
export const asyncOperationsDbConfig = makeDbConfig({
  tables: {
    asyncOperations: makeTable({
      name: 'asyncOperations',
      shape: {
        ...asyncOperationShape,
        asyncCommandId: primitives.foreignKey({
          abbreviation: 'cmd',
          nullable: true,
          unique: true,
        }),
        actorName: primitives.text({ nullable: true }),
        actorVersion: primitives.text({ nullable: true }),
        claims: primitives.json({
          schema: Schema.Record(Schema.String, Schema.Unknown),
          nullable: true,
        }),
        external: primitives.json({ schema: Schema.Json, nullable: true }),
        externalRecordedAt: primitives.date({ nullable: true }),
        nextRunAt: primitives.date({ nullable: true }),
        lastProducerFailure: primitives.json({
          schema: PublicFailureSchema,
          nullable: true,
        }),
      },
      indexes: [operationKeyIndex],
    }),
    asyncCommandOutbox: makeTable({
      name: 'asyncCommandOutbox',
      shape: {
        outboxIndex: primitives.integer({ primaryKey: true }),
        asyncCommandId: primitives.foreignKey({
          abbreviation: 'cmd',
          unique: true,
        }),
        lastDeliveryFailure: primitives.json({
          schema: PublicFailureSchema,
          nullable: true,
        }),
      },
    }),
    asyncCommandOutboxHead: makeTable({
      name: 'asyncCommandOutboxHead',
      shape: {
        singletonId: primitives.integer({ primaryKey: true }),
        lastIndex: primitives.integer(),
      },
    }),
  },
});

/** Refine the table-owned codec so malformed production authority cannot recover. */
export const asyncOperationLifecycleCodec =
  asyncOperationsDbConfig.tables.asyncOperations.codec.check(
    Schema.makeFilter(row => {
      if (row.asyncCommandId === null) {
        return (
          (row.actorName === null &&
            row.actorVersion === null &&
            row.claims === null &&
            row.external === null &&
            row.externalRecordedAt === null &&
            row.nextRunAt === null &&
            row.lastProducerFailure === null) ||
          'Replay output must have no producer lifecycle'
        );
      }
      if (
        row.actorName === null ||
        row.actorVersion === null ||
        row.claims === null
      ) {
        return 'Production requires complete retained actor authority';
      }
      return (
        (row.externalRecordedAt === null
          ? row.external === null && row.nextRunAt !== null
          : row.nextRunAt === null) ||
        'Production deadline and observation recording must agree'
      );
    }),
  );
