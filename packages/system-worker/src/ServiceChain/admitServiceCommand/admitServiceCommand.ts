import { EncodedServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type {
  IEncodedCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import config from 'config';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { isEqual } from 'es-toolkit';

import { prepareAdmissionResult } from '../../checkAdmission.js';
import { serviceChainDbConfig } from '../serviceChainDbConfig.js';

import { retainServiceCommand } from './retainServiceCommand.js';
export const prepareServiceAdmission = Effect.fn(
  'ServiceChain.prepareServiceAdmission',
)(function* (props: {
  command: IEncodedCommand<IServiceCommand>;
  trustedAsync?: true;
  db: IDb;
  key: {
    systemId: string;
    serviceName: string;
  };
}) {
  const startedAt = new Date();
  const { command, db, key } = props;
  if (command.asyncInput != null && props.trustedAsync !== true) {
    return yield* makeZerospinError('public-async-command-forbidden');
  }
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
          asyncInput: saved.asyncInput,
          serviceName: saved.serviceName,
          serviceVersion: saved.serviceVersion,
          caller: saved.caller,
        },
        { ...command, asyncInput: command.asyncInput ?? null },
      )
    ) {
      return yield* makeZerospinError('service-command-identity-mismatch');
    }
    return { command, admission: saved.admission };
  }
  const caller = command.caller;
  const actor =
    caller === null ? undefined : addressed.actors[caller.actorName];
  if (caller !== null) {
    if (
      actor?.version !== caller.actorVersion ||
      actor.contracts[command.commandName] === undefined
    ) {
      return yield* makeZerospinError('service-command-actor-forbidden');
    }
  }
  const admission =
    props.trustedAsync === true
      ? { status: 'succeeded' as const, startedAt, completedAt: new Date() }
      : yield* prepareAdmissionResult({
          startedAt,
          command,
          claims: caller?.claims ?? null,
          owners: [
            {
              ...(actor === undefined ? {} : { identity: actor.identity }),
              contracts: Object.values(actor?.contracts ?? addressed.contracts),
            },
          ],
        });
  return {
    command,
    admission,
  };
});
export const admitServiceCommand = Effect.fn(
  'ServiceChain.admitServiceCommand',
)(function* (props: Parameters<typeof prepareServiceAdmission>[0]) {
  const prepared = yield* prepareServiceAdmission(props);
  return yield* retainServiceCommand({ ...prepared, db: props.db });
});
