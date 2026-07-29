import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { eq, isNull } from 'drizzle-orm';
import { Effect } from 'effect';

import { serviceFrontendRepoDrizzleSchemas } from '../ServiceFrontendRepo.js';

export const getProjectionReadiness = Effect.fn(
  'ServiceFrontendRepo.getProjectionReadiness',
)(function* (props: {
  db: IDb;
  key: {
    generationId: string;
    serviceName: string;
    actorName: string;
    actorId: string;
    frontendName: string;
  };
}): Effect.fn.Return<
  Readonly<{
    generationId: string;
    systemWorkerName: string;
    lastServiceCursor: string | null;
    serviceIndex: number | null;
    frontendIndex: number;
    segmentKind: 'root' | 'inherited' | 'no-local-segment';
    predecessorGenerationId: string | null;
    predecessorRepoName: string | null;
    predecessorTerminalFrontendIndex: number | null;
  }>,
  IAnyError
> {
  const { db, key } = props;
  const state = db
    .select()
    .from(serviceFrontendRepoDrizzleSchemas.projectionState)
    .where(eq(serviceFrontendRepoDrizzleSchemas.projectionState.id, 'state'))
    .get();
  if (
    state === undefined ||
    state.status !== 'ready' ||
    state.generationId !== key.generationId ||
    state.serviceName !== key.serviceName ||
    state.actorName !== key.actorName ||
    state.actorId !== key.actorId ||
    state.frontendName !== key.frontendName
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-projection-state-required',
      message:
        'ServiceFrontendRepo is not ready for this exact frontend target',
    });
  }
  const pending = db
    .select({
      frontendIndex:
        serviceFrontendRepoDrizzleSchemas.serviceFrontendBlockOutbox
          .frontendIndex,
    })
    .from(serviceFrontendRepoDrizzleSchemas.serviceFrontendBlockOutbox)
    .where(
      isNull(
        serviceFrontendRepoDrizzleSchemas.serviceFrontendBlockOutbox
          .publishedAt,
      ),
    )
    .get();
  if (pending !== undefined) {
    return yield* new ZerospinError({
      code: 'service-frontend-projection-archive-pending',
      message: `ServiceFrontendRepo archive is pending at index ${pending.frontendIndex}`,
    });
  }
  return {
    generationId: state.generationId,
    systemWorkerName: state.systemWorkerName,
    lastServiceCursor: state.lastServiceCursor,
    serviceIndex: state.serviceIndex,
    frontendIndex: state.frontendIndex,
    segmentKind: state.segmentKind,
    predecessorGenerationId: state.predecessorGenerationId,
    predecessorRepoName: state.predecessorRepoName,
    predecessorTerminalFrontendIndex: state.predecessorTerminalFrontendIndex,
  };
});
