import { type AdmissionResultSchema } from '@zerospin/core/contracts/AdmissionResultSchema';
import { EncodedServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type {
  IEncodedCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import { type IDb, type ITx } from '@zerospin/core/drizzle/types';
import {
  isZerospinError,
  makeZerospinError,
  mapParseError,
  prettyUnknownFailure,
} from '@zerospin/error';
import config from 'config';
import { desc, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { isEqual } from 'es-toolkit';

import { checkAdmission } from '../../checkAdmission.js';
import { verifyMachineFrozenCommand } from '../../verifyMachineFrozenCommand.js';
import { serviceChainDbConfig } from '../serviceChainDbConfig.js';

export const prepareServiceAdmission = Effect.fn(
  'ServiceChain.prepareServiceAdmission',
)(function* (props: {
  command: IEncodedCommand<IServiceCommand>;
  db: IDb;
  key: { systemId: string; serviceName: string };
  machine?: Readonly<{
    machineName: string;
    bindingName: string;
    mode: 'push' | 'execute';
  }>;
}) {
  const startedAt = new Date();
  const { command, db, key } = props;
  if (command.serviceName !== key.serviceName) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'service-admission-target-mismatch',
        message: 'Command does not match its service',
      }),
    );
  }
  yield* Schema.encodeEffect(EncodedServiceCommandSchema)(command).pipe(
    mapParseError({
      code: 'service-admission-encode-failed',
      prefix: 'Invalid service input',
    }),
  );
  const addressed =
    config.system.services[key.serviceName]?.[command.serviceVersion];
  if (addressed === undefined) {
    return yield* makeZerospinError({
      code: 'service-version-unsupported',
      message: `Unknown service composition ${key.serviceName}@${command.serviceVersion}`,
    });
  }
  const machineContract = addressed.contracts[command.commandName];
  if (props.machine !== undefined) {
    if (machineContract === undefined) {
      return yield* makeZerospinError('machine-contract-forbidden');
    }
    yield* verifyMachineFrozenCommand({
      command,
      mode: props.machine.mode,
      bindingName: props.machine.bindingName,
      systemId: key.systemId,
      machineName: props.machine.machineName,
    });
  }
  const retained = db
    .select()
    .from(serviceChainDbConfig.schema.commands)
    .where(eq(serviceChainDbConfig.schema.commands.id, command.id))
    .get();
  if (retained !== undefined) {
    const saved =
      yield* serviceChainDbConfig.tables.commands.decodeRow(retained);
    if (
      !isEqual(
        {
          id: saved.id,
          commandName: saved.commandName,
          contractVersion: saved.contractVersion,
          payload: saved.payload,
          serviceName: saved.serviceName,
          serviceVersion: saved.serviceVersion,
        },
        command,
      )
    ) {
      return yield* makeZerospinError('service-command-identity-mismatch');
    }
    return { command, admission: saved.admission };
  }
  if (props.machine !== undefined) {
    yield* checkAdmission({
      command,
      claims: null,
      owners: [{ contracts: [machineContract!] }],
    });
    return {
      command,
      admission: {
        status: 'succeeded' as const,
        startedAt,
        completedAt: new Date(),
      },
    };
  }
  yield* checkAdmission({
    command,
    claims: null,
    owners: [{ ...addressed, contracts: Object.values(addressed.contracts) }],
  });
  return {
    command,
    admission: {
      status: 'succeeded' as const,
      startedAt,
      completedAt: new Date(),
    },
  };
});

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
    if (!isEqual(command, props.command)) {
      return yield* makeZerospinError('service-command-identity-mismatch');
    }
    return {
      ...command,
      admission: retained.admission,
      serviceIndex: retained.serviceIndex,
    };
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
    admission: props.admission,
    serviceIndex,
  });
  tx.insert(commands).values(bytes).run();
  return { ...props.command, serviceIndex, admission: props.admission };
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

export const admitServiceCommand = Effect.fn(
  'ServiceChain.admitServiceCommand',
)(function* (props: Parameters<typeof prepareServiceAdmission>[0]) {
  const prepared = yield* prepareServiceAdmission(props);
  return yield* retainServiceCommand({ ...prepared, db: props.db });
});
