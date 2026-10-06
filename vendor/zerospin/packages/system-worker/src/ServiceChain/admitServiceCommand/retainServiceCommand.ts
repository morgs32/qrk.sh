import type { AdmissionResultSchema } from '@zerospin/core/contracts/AdmissionResultSchema';
import { EncodedServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type {
  IEncodedCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import {
  isZerospinError,
  makeZerospinError,
  prettyUnknownFailure,
} from '@zerospin/error';
import { desc, eq, sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { isEqual } from 'es-toolkit';

import { serviceChainDbConfig } from '../serviceChainDbConfig.js';

const retain = makeTx('ServiceChain.retainServiceCommand')(function* (
  tx: ITx<typeof serviceChainDbConfig>,
  props: {
    command: IEncodedCommand<IServiceCommand>;
    admission: typeof AdmissionResultSchema.Type;
  },
) {
  const { commands } = serviceChainDbConfig.schema;
  const row = tx
    .select()
    .from(commands)
    .where(eq(commands.id, props.command.id))
    .get();
  if (row !== undefined) {
    const retained = yield* serviceChainDbConfig.tables.commands.decodeRow(row);
    const command = yield* Schema.decodeUnknownEffect(
      EncodedServiceCommandSchema,
    )(retained);
    if (
      !isEqual(
        { ...command, response: command.response ?? null },
        { ...props.command, response: props.command.response ?? null },
      )
    ) {
      return yield* makeZerospinError('service-command-identity-mismatch');
    }
    return {
      ...command,
      admission: retained.admission,
      serviceIndex: retained.serviceIndex,
    };
  }
  const caller = props.command.caller;
  if (caller !== null && caller.nodeId !== null) {
    const prior = tx
      .select()
      .from(commands)
      .where(
        sql`json_extract(${commands.caller}, '$.nodeId') = ${caller.nodeId}`,
      )
      .orderBy(desc(commands.serviceIndex))
      .limit(1)
      .get();
    const saved =
      prior === undefined
        ? undefined
        : (yield* serviceChainDbConfig.tables.commands.decodeRow(prior)).caller;
    const expectedNodeIndex = (saved?.nodeIndex ?? 0) + 1;
    if (caller.nodeIndex !== expectedNodeIndex) {
      return yield* makeZerospinError({
        code: 'node-admission-index-mismatch',
        extra: { expectedNodeIndex, nodeIndex: caller.nodeIndex },
      });
    }
    if (
      saved !== undefined &&
      saved !== null &&
      (saved.actorName !== caller.actorName ||
        saved.actorVersion !== caller.actorVersion ||
        saved.sessionName !== caller.sessionName ||
        !isEqual(saved.claims, caller.claims))
    ) {
      return yield* makeZerospinError('node-admission-identity-mismatch');
    }
  }
  const serviceIndex =
    (tx
      .select()
      .from(commands)
      .orderBy(desc(commands.serviceIndex))
      .limit(1)
      .get()?.serviceIndex ?? 0) + 1;
  const bytes = yield* serviceChainDbConfig.tables.commands.encodeRow({
    ...props.command,
    response: props.command.response ?? null,
    admission: props.admission,
    serviceIndex,
  });
  tx.insert(commands).values(bytes).run();
  return {
    ...props.command,
    response: props.command.response ?? null,
    serviceIndex,
    admission: props.admission,
  };
});
export const retainServiceCommand = Effect.fn(
  'ServiceChain.retainServiceCommand',
)(function* (props: {
  command: IEncodedCommand<IServiceCommand>;
  admission: typeof AdmissionResultSchema.Type;
  db: IDb;
}) {
  return yield* retain(props.db, props).pipe(
    Effect.mapError(cause =>
      isZerospinError(cause) && cause.code !== 'drizzle-transaction-failed'
        ? cause
        : makeZerospinError({
            code: 'service-admission-failed',
            message: 'Failed to admit service input',
            cause: prettyUnknownFailure(cause),
          }),
    ),
  );
});
