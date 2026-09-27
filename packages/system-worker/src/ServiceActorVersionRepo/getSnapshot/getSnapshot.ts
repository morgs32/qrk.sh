import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IResourceDbConfig, ITx } from '@zerospin/core/drizzle/types';
import type { IAnyModels } from '@zerospin/core/models/types';
import { ServiceSessionSnapshotSchema } from '@zerospin/core/serviceSession/ServiceActorCommandSchema';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import config from 'config';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { ServiceActorVersionChain } from '../../ServiceActorVersionChain/ServiceActorVersionChain.js';
import { genesisDispositionHash } from '../../serviceDispositionHash/serviceDispositionHash.js';
import { catchup } from '../catchup/catchup.js';
import type { execute } from '../execute/execute.js';
import { readServiceResources } from '../readServiceResources.js';
import type { ServiceActorVersionRepo } from '../ServiceActorVersionRepo.js';
import { serviceActorVersionRepoDbConfig } from '../serviceActorVersionRepoDbConfig.js';
/** Snapshot graph and cursor together, then wait for publication after the read transaction. */
/*
 * Session snapshot reads capture projected state
 * together, then ensure the captured cursor is durably published to FSC.
 * Publication waits occur after the synchronous capture transaction completes.
 *
 * 1. Check the requested view identity.
 * 2. Catch the replica up to retained history.
 * 3. Capture state together.
 * 4. Use the resources captured with the cursor.
 * 5. Publish through the captured cursor.
 * 6. Verify durable definition publication.
 * 7. Return a validated synchronization snapshot.
 */
export const getSnapshot = Effect.fn('ServiceActorVersionRepo.getSnapshot')(
  function* (
    props: Parameters<typeof catchup>[0] & {
      db: Parameters<typeof execute>[0]['db'];
      key: Parameters<typeof execute>[0]['key'];
      requested: {
        serviceName: string;
        actorPath: string;
        actorName: string;
        actorVersion: string;
      };
      actorCommandsOutbox: Pick<
        ServiceActorVersionRepo['actorCommandsOutbox'],
        'drain'
      >;
    },
  ) {
    const {
      key,
      requested,
      subscriber,
      throughServiceIndex,
      db,
      actorCommandsOutbox,
    } = props;

    // 1 — compare serviceName, actor identity, and actorPath with the bound key
    if (
      requested.serviceName !== key.serviceName ||
      requested.actorPath !== key.actorPath ||
      requested.actorName !== key.actorName ||
      requested.actorVersion !== key.actorVersion
    ) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'replica-state-target-mismatch',
          message: 'State request does not match the bound view',
        }),
      );
    }

    // 2 — replay through the captured VSC tip
    yield* catchup({
      subscriber,
      throughServiceIndex,
    });

    const versions = yield* getByKeyOrThrow({
      record: config.system.services,
      key: key.serviceName,
      recordKind: 'services',
    });
    const service = yield* getByKeyOrThrow({
      record: versions,
      key: key.serviceVersion,
      recordKind: 'listed versions',
    });
    // 3 — synchronously capture resource rows and cursor in one transaction
    const captured = yield* makeTx('ServiceActorVersionRepo.captureSnapshot')(
      function* (
        tx: ITx<
          IResourceDbConfig<
            IAnyModels,
            typeof serviceActorVersionRepoDbConfig.tables
          >
        >,
      ) {
        const state = tx
          .select()
          .from(serviceActorVersionRepoDbConfig.schema.actorState)
          .where(eq(serviceActorVersionRepoDbConfig.schema.actorState.id, 1))
          .get();
        const resources = yield* readServiceResources(tx, service, key);
        return { state, resources };
      },
    )(db);

    // 4 — use the resources captured with the cursor
    const resources = captured.resources;
    const serviceIndex = captured.state?.serviceIndex ?? 0;
    const serviceHash = captured.state?.serviceHash ?? genesisDispositionHash();

    // 5 — drain the actor-command outbox after the capture transaction
    yield* actorCommandsOutbox.drain(serviceIndex);
    const chain = yield* ServiceActorVersionChain.getRepo({
      key,
    });
    const published = yield* makeAsync<
      Awaited<ReturnType<ServiceActorVersionChain['getActorCommands']>>
    >(() => chain.getActorCommands({ afterServiceIndex: serviceIndex })).pipe(
      Effect.flatMap(envelope => readRpcEnvelope(envelope)),
    );

    // 6 — reject a FSC tip behind the captured snapshot index
    if (published.tip < serviceIndex) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'replica-state-publication-pending',
          message: 'Snapshot cursor has not been durably published',
        }),
      );
    }

    // 7 — include bound identity, versions, cursor, and captured resources
    return yield* Schema.decodeUnknownEffect(
      Schema.toType(
        ServiceSessionSnapshotSchema.mapFields(
          ({ claims: _identity, sessionName: _sessionName, ...fields }) => ({
            ...fields,
            actorPath: Schema.String,
            actorName: Schema.String,
            actorVersion: Schema.String,
          }),
        ),
      ),
    )({
      serviceName: key.serviceName,
      serviceVersion: key.serviceVersion,
      actorPath: key.actorPath,
      actorName: key.actorName,
      actorVersion: key.actorVersion,
      serviceIndex,
      serviceHash,
      resources,
    }).pipe(
      mapParseError({
        code: 'replica-state-invalid',
        prefix: 'Invalid definition snapshot',
      }),
    );
  },
);
