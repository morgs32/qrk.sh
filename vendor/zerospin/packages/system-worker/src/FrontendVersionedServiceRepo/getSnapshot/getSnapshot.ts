import { makeAsync } from '@zerospin/core/async/makeAsync';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import { ServiceFrontendSnapshotSchema } from '@zerospin/core/serviceSession/ServiceSelectedCommandSchema';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Schema, type Semaphore } from 'effect';

import { genesisDispositionHash } from '../../serviceDispositionHash/serviceDispositionHash.js';
import { FrontendServiceChain } from '../../FrontendServiceChain/FrontendServiceChain.js';
import { catchup } from '../catchup/catchup.js';
import type { execute } from '../execute/execute.js';
import type { FrontendVersionedServiceRepo } from '../FrontendVersionedServiceRepo.js';
import { frontendVersionedServiceRepoDbConfig } from '../frontendVersionedServiceRepoDbConfig.js';
/** Snapshot graph and cursor together, then wait for publication without holding the execution semaphore. */
/*
 * Frontend snapshot reads capture projected state
 * together, then ensure the captured cursor is durably published to FSC.
 * Publication waits occur after releasing the local execution permit.
 *
 * 1. Check the requested view identity.
 * 2. Catch the replica up to retained history.
 * 3. Capture state together.
 * 4. Decode the captured graph.
 * 5. Publish through the captured cursor.
 * 6. Verify durable frontend publication.
 * 7. Return a validated synchronization snapshot.
 */
export const getSnapshot = Effect.fn('FrontendVersionedServiceRepo.getSnapshot')(
  function* (
    props: Parameters<typeof catchup>[0] & {
      db: Parameters<typeof execute>[0]['db'];
      key: Parameters<typeof execute>[0]['key'];
      execution: Semaphore.Semaphore;
      requested: {
        serviceName: string;
        selectionPath: string;
        frontendName: string;
      };
      selectedCommands: FrontendVersionedServiceRepo['selectedCommands'];
    },
  ) {
    const { key, requested } = props;

    // 1 — compare serviceName, selectionPath, and frontendName with the bound key
    if (
      requested.serviceName !== key.serviceName ||
      requested.selectionPath !== key.selectionPath ||
      requested.frontendName !== key.frontendName
    ) {
      return yield* new ZerospinError({
        code: 'replica-state-target-mismatch',
        message: 'State request does not match the bound view',
      });
    }

    // 2 — replay through the captured VSC tip
    yield* catchup(props);

    // 3 — read projectionState under the execution permit
    const captured = yield* props.execution.withPermits(1)(
      Effect.sync(() => ({
        state: props.db
          .select()
          .from(frontendVersionedServiceRepoDbConfig.schema.projectionState)
          .where(
            eq(
              frontendVersionedServiceRepoDbConfig.schema.projectionState.id,
              1,
            ),
          )
          .get(),
      })),
    );

    // 4 — use an empty graph at cursor zero when no projection exists
    const resources =
      captured.state === undefined
        ? []
        : yield* Schema.decodeUnknownEffect(
            Schema.fromJsonString(Schema.Array(EncodedResourceSchema)),
          )(captured.state.graph).pipe(
            mapParseError({
              code: 'replica-state-invalid',
              prefix: 'Invalid retained projected state',
            }),
          );
    const serviceIndex = captured.state?.serviceIndex ?? 0;
    const serviceHash =
      captured.state?.serviceHash ?? genesisDispositionHash();

    // 5 — drain the selected-command outbox without retaining the execution permit
    yield* props.selectedCommands.drain(serviceIndex);
    const chain = yield* FrontendServiceChain.getRepo({
      key,
    });
    const published = yield* makeAsync<
      Awaited<ReturnType<FrontendServiceChain['getSelectedCommands']>>
    >(() => chain.getSelectedCommands({ afterServiceIndex: serviceIndex })).pipe(
      Effect.flatMap(decodeRpc),
    );

    // 6 — reject a FSC tip behind the captured snapshot index
    if (published.tip < serviceIndex) {
      return yield* new ZerospinError({
        code: 'replica-state-publication-pending',
        message: 'Snapshot cursor has not been durably published',
      });
    }

    // 7 — include bound identity, versions, cursor, and captured resources
    return yield* Schema.decodeUnknownEffect(
      Schema.toType(
        ServiceFrontendSnapshotSchema.mapFields(
          ({ authentication: _authentication, ...fields }) => ({
            ...fields,
            selectionPath: Schema.String,
          }),
        ),
      ),
    )({
      serviceName: key.serviceName,
      serviceVersion: key.serviceVersion,
      selectionPath: key.selectionPath,
      frontendName: key.frontendName,
      serviceIndex,
      serviceHash,
      resources,
    }).pipe(
      mapParseError({
        code: 'replica-state-invalid',
        prefix: 'Invalid frontend snapshot',
      }),
    );
  },
);
