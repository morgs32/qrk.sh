import { EncodedServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { encodeMutation } from '@zerospin/core/contracts/encodeAppliedMutation';
import { makeMutations } from '@zerospin/core/contracts/makeMutations';
import type { IDb } from '@zerospin/core/drizzle/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Layer, Result, Schema } from 'effect';
import { system } from 'system';

import type { serviceAdmittedChainDbConfig } from '../../ServiceAdmittedChain/serviceAdmittedChainDbConfig.js';
import {
  VersionedServiceRepoDb,
  versionedServiceRepoDbConfig,
} from '../versionedServiceRepoDbConfig.js';

import { executeCommandsTx } from './executeCommandsTx.js';

/** Caller holds the execution permit; prepare before atomically committing the new suffix. */
export const executeCommands = Effect.fn(
  'VersionedServiceRepo.executeCommands',
)(function* (props: {
  db: IDb;
  key: { systemId: string; serviceName: string; serviceVersion: string };
  rows: readonly (typeof serviceAdmittedChainDbConfig.schema.commands.$inferSelect)[];
}) {
  const { db, key } = props;
  const head = db
    .select()
    .from(versionedServiceRepoDbConfig.schema.head)
    .where(eq(versionedServiceRepoDbConfig.schema.head.singletonId, 1))
    .get();
  const cursor = head?.serviceIndex ?? 0;
  for (const row of props.rows) {
    if (!Number.isSafeInteger(row.fanoutIndex) || row.fanoutIndex < 1) {
      return yield* new ZerospinError({
        code: 'service-execution-gap',
        message: 'Admitted service page requires positive contiguous indices',
      });
    }
  }
  const rows = props.rows.filter(row => row.fanoutIndex > cursor);
  if (rows.length === 0) return;
  const latestService = yield* getByKeyOrThrow({
    record: system.services,
    key: key.serviceName,
    recordKind: 'services',
  });
  const service = yield* getByKeyOrThrow({
    record: latestService,
    key: key.serviceVersion,
    recordKind: 'listed versions',
  });
  const application = yield* Layer.build(Layer.fresh(system.layer));
  const guards = yield* service.initializeGuards.pipe(
    Effect.provideContext(application),
  );
  const inputs = yield* Effect.forEach(rows, (row, offset) =>
    Effect.gen(function* () {
      if (row.fanoutIndex !== cursor + offset + 1) {
        return yield* new ZerospinError({
          code: 'service-execution-gap',
          message: 'Admitted service page is not contiguous',
        });
      }
      const source = yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(EncodedServiceCommandSchema),
      )(row.command).pipe(
        mapParseError({
          code: 'service-input-invalid',
          prefix: 'Invalid admitted service input',
        }),
      );
      if (
        source.serviceName !== key.serviceName ||
        source.id !== row.commandId ||
        row.command !== row.canonicalBytes
      ) {
        return yield* new ZerospinError({
          code: 'service-input-target-mismatch',
          message: 'Admitted service input differs from its row',
        });
      }
      const command = {
        ...source,
        serviceIndex: row.fanoutIndex,
        chainedAt: row.chainedAt,
        delta: null,
        failedAt: null,
        failure: null,
        dispositionHash: null,
      };
      const prepared = yield* Effect.gen(function* () {
        const contract = Object.values(service.contracts).find(
          candidate => candidate.commandName === source.commandName,
        );
        if (!contract) {
          return yield* new ZerospinError({
            code: 'service-contract-not-found',
            message: `Missing service contract ${source.commandName}`,
          });
        }
        const payload = yield* contract.decodePayload({
          command: source,
        });
        const made = yield* makeMutations({
          contract,
          models: service.models,
          command: { ...source, payload },
        });
        return made;
      }).pipe(Effect.result);
      const mutations = Result.isFailure(prepared)
        ? []
        : yield* Effect.forEach(
            prepared.success.mutations,
            (mutation, mutationIndex) =>
              encodeMutation({
                commandId: source.id,
                mutationIndex,
                mutation,
              }),
          );
      return {
        command,
        prepared,
        mutations,
        now: new Date(),
        sourceCommand: row.command,
      };
    }),
  ).pipe(
    Effect.provideContext(guards.context),
    Effect.provideContext(application),
  );
  yield* executeCommandsTx({ cursor, inputs, service, guards, key }).pipe(
    Effect.provideService(VersionedServiceRepoDb, db),
    Effect.provideContext(guards.context),
    Effect.provideContext(application),
  );
}, Effect.scoped);
