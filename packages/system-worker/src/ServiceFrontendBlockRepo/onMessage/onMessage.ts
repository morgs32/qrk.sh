import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IActorId } from '@zerospin/core/models/types';
import type {
  IServiceFrontendGenerationBoundaryBlock,
  IServiceFrontendLineageBlock,
} from '@zerospin/core/serviceSession/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import type { IRpcEitherEncoded } from '@zerospin/core/utils/types';
import type { IAnyError } from '@zerospin/error';
import { Effect, Either, Schema } from 'effect';
import type { Connection, WSMessage } from 'partyserver';

import { getArchivedBlocks } from '../getArchivedBlocks/getArchivedBlocks.js';
import { getPredecessor } from '../getPredecessor/getPredecessor.js';

/* Service-owned replay is deliberately separate from account replay. */
export const onMessage = Effect.fn('ServiceFrontendBlockRepo.onMessage')(
  function* (props: {
    connection: Connection<{
      phase: 'awaiting-resume' | 'replaying' | 'live';
      frontendVersion: string;
    }>;
    message: WSMessage;
    db: IDb;
    key: {
      generationId: string;
      serviceName: string;
      actorName: string;
      actorId: string;
      frontendName: string;
    };
    parseRepoName: (repoName: string) => Effect.Effect<
      {
        generationId: string;
        serviceName: string;
        actorName: string;
        actorId: string;
        frontendName: string;
      },
      IAnyError
    >;
    getPredecessorRepo: (repoName: string) => {
      getPredecessor(): IRpcEitherEncoded<
        Readonly<{
          systemId: ISystemId;
          generationId: string;
          serviceName: string;
          actorName: string;
          actorId: IActorId;
          frontendName: string;
          terminalFrontendIndex: number;
          predecessor: Readonly<{
            generationId: string;
            repoName: string;
            terminalFrontendIndex: number;
          }> | null;
        }>
      >;
      getArchivedBlocks(props: {
        afterFrontendIndex: number;
        throughFrontendIndex: number;
      }): IRpcEitherEncoded<readonly IServiceFrontendLineageBlock[]>;
    };
  }): Effect.fn.Return<void, IAnyError, Async> {
    const { connection, db, key } = props;
    const targetDescriptor = yield* getPredecessor({ db, key });
    const frontendVersion = connection.state?.frontendVersion;
    if (frontendVersion === undefined) {
      connection.close(4004, 'frontend-version-required');
      return;
    }
    const stateRequired = () => {
      connection.send(
        JSON.stringify({
          type: 'state-required',
          systemId: targetDescriptor.systemId,
          generationId: key.generationId,
          serviceName: key.serviceName,
          actorId: key.actorId,
          actorName: key.actorName,
          frontendName: key.frontendName,
          frontendVersion,
          frontendIndex: targetDescriptor.terminalFrontendIndex,
        }),
      );
      connection.close(4003, 'state-required');
    };

    if (
      connection.state?.phase === 'replaying' ||
      connection.state?.phase === 'live'
    ) {
      stateRequired();
      return;
    }
    if (typeof props.message !== 'string') {
      stateRequired();
      return;
    }
    const decodedResume = yield* Schema.decodeUnknown(
      Schema.parseJson(
        Schema.Struct({
          replicaGenerationId: Schema.String,
          frontendIndex: Schema.Number,
        }),
      ),
    )(props.message).pipe(Effect.either);
    if (
      Either.isLeft(decodedResume) ||
      !Number.isInteger(decodedResume.right.frontendIndex) ||
      decodedResume.right.frontendIndex < 0
    ) {
      stateRequired();
      return;
    }
    connection.setState({ phase: 'replaying', frontendVersion });

    if (decodedResume.right.replicaGenerationId === key.generationId) {
      let replayedThroughFrontendIndex = decodedResume.right.frontendIndex;
      let targetReplayComplete = false;
      while (!targetReplayComplete) {
        const currentTargetDescriptor = yield* getPredecessor({ db, key });
        if (
          replayedThroughFrontendIndex >
          currentTargetDescriptor.terminalFrontendIndex
        ) {
          stateRequired();
          return;
        }
        const suffixResult = yield* getArchivedBlocks({
          afterFrontendIndex: replayedThroughFrontendIndex,
          throughFrontendIndex: currentTargetDescriptor.terminalFrontendIndex,
          db,
          key,
        }).pipe(Effect.either);
        if (Either.isLeft(suffixResult)) {
          stateRequired();
          return;
        }
        for (const block of suffixResult.right) {
          connection.send(
            JSON.stringify({ type: 'serviceFrontendBlock', sync: block }),
          );
        }
        replayedThroughFrontendIndex =
          currentTargetDescriptor.terminalFrontendIndex;
        const stableTargetDescriptor = yield* getPredecessor({ db, key });
        if (
          stableTargetDescriptor.terminalFrontendIndex ===
          replayedThroughFrontendIndex
        ) {
          connection.send(
            JSON.stringify({
              type: 'replay-complete',
              generationId: key.generationId,
              frontendIndex: replayedThroughFrontendIndex,
            }),
          );
          connection.setState({ phase: 'live', frontendVersion });
          targetReplayComplete = true;
        }
      }
      return;
    }

    const childSegments: Array<{
      descriptor: Readonly<{
        systemId: ISystemId;
        generationId: string;
        serviceName: string;
        actorName: string;
        actorId: IActorId;
        frontendName: string;
        terminalFrontendIndex: number;
        predecessor: Readonly<{
          generationId: string;
          repoName: string;
          terminalFrontendIndex: number;
        }> | null;
      }>;
      repo: null | {
        getArchivedBlocks(props: {
          afterFrontendIndex: number;
          throughFrontendIndex: number;
        }): IRpcEitherEncoded<readonly IServiceFrontendLineageBlock[]>;
      };
    }> = [];
    let currentDescriptor = targetDescriptor;
    let currentRepo: null | {
      getArchivedBlocks(props: {
        afterFrontendIndex: number;
        throughFrontendIndex: number;
      }): IRpcEitherEncoded<readonly IServiceFrontendLineageBlock[]>;
    } = null;
    let sourceDescriptor: typeof targetDescriptor | null = null;
    let sourceRepo: ReturnType<typeof props.getPredecessorRepo> | null = null;
    const visitedGenerationIds = new Set<string>([key.generationId]);
    const visitedRepoNames = new Set<string>();

    while (currentDescriptor.predecessor !== null) {
      childSegments.push({ descriptor: currentDescriptor, repo: currentRepo });
      const predecessorPointer = currentDescriptor.predecessor;
      if (
        visitedGenerationIds.has(predecessorPointer.generationId) ||
        visitedRepoNames.has(predecessorPointer.repoName)
      ) {
        stateRequired();
        return;
      }
      visitedGenerationIds.add(predecessorPointer.generationId);
      visitedRepoNames.add(predecessorPointer.repoName);
      const predecessorKeyResult = yield* props
        .parseRepoName(predecessorPointer.repoName)
        .pipe(Effect.either);
      if (
        Either.isLeft(predecessorKeyResult) ||
        predecessorKeyResult.right.generationId !==
          predecessorPointer.generationId ||
        predecessorKeyResult.right.serviceName !== key.serviceName ||
        predecessorKeyResult.right.actorName !== key.actorName ||
        predecessorKeyResult.right.actorId !== key.actorId ||
        predecessorKeyResult.right.frontendName !== key.frontendName
      ) {
        stateRequired();
        return;
      }
      const predecessorRepo = props.getPredecessorRepo(
        predecessorPointer.repoName,
      );
      const predecessorDescriptorResult = yield* makeAsync(() =>
        predecessorRepo.getPredecessor(),
      ).pipe(Effect.flatMap(decodeRpc), Effect.either);
      if (Either.isLeft(predecessorDescriptorResult)) {
        stateRequired();
        return;
      }
      const predecessorDescriptor = predecessorDescriptorResult.right;
      if (
        predecessorDescriptor.systemId !== targetDescriptor.systemId ||
        predecessorDescriptor.generationId !==
          predecessorPointer.generationId ||
        predecessorDescriptor.serviceName !== key.serviceName ||
        predecessorDescriptor.actorName !== key.actorName ||
        predecessorDescriptor.actorId !== key.actorId ||
        predecessorDescriptor.frontendName !== key.frontendName ||
        predecessorDescriptor.terminalFrontendIndex !==
          predecessorPointer.terminalFrontendIndex
      ) {
        stateRequired();
        return;
      }
      if (
        predecessorDescriptor.generationId ===
        decodedResume.right.replicaGenerationId
      ) {
        sourceDescriptor = predecessorDescriptor;
        sourceRepo = predecessorRepo;
        break;
      }
      currentDescriptor = predecessorDescriptor;
      currentRepo = predecessorRepo;
    }

    if (sourceDescriptor === null || sourceRepo === null) {
      stateRequired();
      return;
    }
    if (
      decodedResume.right.frontendIndex > sourceDescriptor.terminalFrontendIndex
    ) {
      stateRequired();
      return;
    }
    const sourceSuffixResult = yield* makeAsync(() =>
      sourceRepo.getArchivedBlocks({
        afterFrontendIndex: decodedResume.right.frontendIndex,
        throughFrontendIndex: sourceDescriptor.terminalFrontendIndex,
      }),
    ).pipe(Effect.flatMap(decodeRpc), Effect.either);
    if (Either.isLeft(sourceSuffixResult)) {
      stateRequired();
      return;
    }
    for (const block of sourceSuffixResult.right) {
      connection.send(
        JSON.stringify({ type: 'serviceFrontendBlock', sync: block }),
      );
    }

    const boundaries: IServiceFrontendGenerationBoundaryBlock[] = [];
    for (
      let childIndex = childSegments.length - 1;
      childIndex >= 0;
      childIndex -= 1
    ) {
      const child = childSegments[childIndex];
      if (child === undefined) {
        stateRequired();
        return;
      }
      const predecessor = child.descriptor.predecessor;
      if (predecessor === null) {
        stateRequired();
        return;
      }
      let boundaryResult;
      if (child.repo === null) {
        boundaryResult = yield* getArchivedBlocks({
          afterFrontendIndex: predecessor.terminalFrontendIndex,
          throughFrontendIndex: predecessor.terminalFrontendIndex + 1,
          db,
          key,
        }).pipe(Effect.either);
      } else {
        const childRepo = child.repo;
        boundaryResult = yield* makeAsync(() =>
          childRepo.getArchivedBlocks({
            afterFrontendIndex: predecessor.terminalFrontendIndex,
            throughFrontendIndex: predecessor.terminalFrontendIndex + 1,
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
      }
      if (
        Either.isLeft(boundaryResult) ||
        boundaryResult.right.length !== 1 ||
        boundaryResult.right[0]?.kind !== 'generation-boundary' ||
        boundaryResult.right[0].systemId !== targetDescriptor.systemId ||
        boundaryResult.right[0].prevGenerationId !== predecessor.generationId ||
        boundaryResult.right[0].generationId !==
          child.descriptor.generationId ||
        boundaryResult.right[0].serviceName !== key.serviceName ||
        boundaryResult.right[0].actorName !== key.actorName ||
        boundaryResult.right[0].actorId !== key.actorId ||
        boundaryResult.right[0].frontendName !== key.frontendName ||
        boundaryResult.right[0].frontendIndex !==
          predecessor.terminalFrontendIndex + 1
      ) {
        stateRequired();
        return;
      }
      boundaries.push(boundaryResult.right[0]);
    }
    const firstBoundary = boundaries[0];
    if (firstBoundary === undefined) {
      stateRequired();
      return;
    }
    connection.send(
      JSON.stringify({ type: 'serviceFrontendBlock', sync: firstBoundary }),
    );
    connection.send(
      JSON.stringify({
        type: 'lineage-transition-required',
        kind: 'lineage-transition-required',
        systemId: targetDescriptor.systemId,
        generationId: key.generationId,
        serviceName: key.serviceName,
        actorId: key.actorId,
        actorName: key.actorName,
        frontendName: key.frontendName,
        frontendVersion,
        appliedBoundaryIndex: firstBoundary.frontendIndex,
        remainingBoundaries: boundaries.slice(1),
      }),
    );
    connection.close(4002, 'lineage-transition-required');
  },
);
