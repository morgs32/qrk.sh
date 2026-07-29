import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDb } from '@zerospin/core/drizzle/types';
import type {
  IFrontendGenerationBoundaryBlock,
  IFrontendLineageBlock,
} from '@zerospin/core/session/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import type { IRpcEitherEncoded } from '@zerospin/core/utils/types';
import type { IAnyError } from '@zerospin/error';
import { Effect, Either, Schema } from 'effect';
import type { Connection, WSMessage } from 'partyserver';

import { getArchivedBlocks } from '../getArchivedBlocks/getArchivedBlocks.js';
import { getPredecessor } from '../getPredecessor/getPredecessor.js';

/*
 * The first and only client-authored frame selects an immutable resume point.
 * Target replay becomes live only after its captured suffix and replay receipt.
 * Ancestor replay stops immediately after the first successor boundary.
 */
export const onMessage = Effect.fn('FrontendBlockRepo.onMessage')(
  function* (props: {
    connection: Connection<{
      phase: 'awaiting-resume' | 'replaying' | 'live';
      frontendVersion: string;
    }>;
    message: WSMessage;
    db: IDb;
    key: {
      generationId: string;
      accountId: string;
      accountName: string;
      actorName: string;
      actorId: string;
      frontendName: string;
    };
    parseRepoName: (repoName: string) => Effect.Effect<
      {
        generationId: string;
        accountId: string;
        accountName: string;
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
      }): IRpcEitherEncoded<readonly IFrontendLineageBlock[]>;
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
          accountId: key.accountId,
          accountName: key.accountName,
          actorId: key.actorId,
          actorName: key.actorName,
          frontendName: key.frontendName,
          frontendVersion,
          frontendIndex: targetDescriptor.terminalFrontendIndex,
        }),
      );
      connection.close(4003, 'state-required');
    };

    // 1 — a socket gets exactly one resume frame before it can receive blocks.
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

    // 2 — target-generation resume is one exact local suffix, then live mode.
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
            JSON.stringify({ type: 'frontendBlock', sync: block }),
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

    // 3 — walk only immutable predecessor descriptors, retaining each child
    // archive needed to fetch the canonical boundary back toward the target.
    const childSegments: Array<{
      descriptor: Readonly<{
        systemId: string;
        generationId: string;
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
        }): IRpcEitherEncoded<readonly IFrontendLineageBlock[]>;
      };
    }> = [];
    let currentDescriptor = targetDescriptor;
    let currentRepo: null | {
      getArchivedBlocks(props: {
        afterFrontendIndex: number;
        throughFrontendIndex: number;
      }): IRpcEitherEncoded<readonly IFrontendLineageBlock[]>;
    } = null;
    let sourceDescriptor: typeof targetDescriptor | null = null;
    let sourceRepo: ReturnType<typeof props.getPredecessorRepo> | null = null;
    const visitedGenerationIds = new Set<string>([key.generationId]);
    const visitedRepoNames = new Set<string>();

    while (currentDescriptor.predecessor !== null) {
      childSegments.push({
        descriptor: currentDescriptor,
        repo: currentRepo,
      });
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
        predecessorKeyResult.right.accountId !== key.accountId ||
        predecessorKeyResult.right.accountName !== key.accountName ||
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

    // 4 — send the source's exact suffix, then exactly its first successor
    // boundary. No ordinary block from a later generation enters this stream.
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
      connection.send(JSON.stringify({ type: 'frontendBlock', sync: block }));
    }

    const boundaries: IFrontendGenerationBoundaryBlock[] = [];
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
        boundaryResult.right[0].accountId !== key.accountId ||
        boundaryResult.right[0].accountName !== key.accountName ||
        boundaryResult.right[0].actorId !== key.actorId ||
        boundaryResult.right[0].actorName !== key.actorName ||
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
      JSON.stringify({ type: 'frontendBlock', sync: firstBoundary }),
    );
    connection.send(
      JSON.stringify({
        type: 'lineage-transition-required',
        kind: 'lineage-transition-required',
        systemId: targetDescriptor.systemId,
        generationId: key.generationId,
        accountId: key.accountId,
        accountName: key.accountName,
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
