import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { ServiceFrontendBlockSchema } from '@zerospin/core/serviceSession/ServiceFrontendBlockSchema';
import type { IServiceFrontendBlock } from '@zerospin/core/serviceSession/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import type { IRpcEitherEncoded } from '@zerospin/core/utils/types';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Either, Schema } from 'effect';
import type { Connection, WSMessage } from 'partyserver';

import { getArchivedBlocks } from '../getArchivedBlocks/getArchivedBlocks.js';
import { getPredecessor } from '../getPredecessor/getPredecessor.js';

export const onMessage = Effect.fn('ServiceFrontendBlockRepo.onMessage')(
  function* (props: {
    connection: Connection<{
      phase: 'awaiting-resume' | 'replaying' | 'live';
      serviceName: string;
      userId: string;
      frontendName: string;
      serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
    }>;
    message: WSMessage;
    db: IDb;
    key: {
      generationId: string;
      serviceName: string;
      userId: string;
      frontendName: string;
    };
    parseRepoName: (repoName: string) => Effect.Effect<
      {
        generationId: string;
        serviceName: string;
        userId: string;
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
          userId: string;
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
        serviceFrontendLock: Schema.Schema.Type<
          typeof ServiceFrontendLockSchema
        >;
      }): IRpcEitherEncoded<readonly IServiceFrontendBlock[]>;
    };
  }): Effect.fn.Return<void, IAnyError, Async> {
    const { connection, db, key } = props;
    const targetDescriptor = yield* getPredecessor({ db, key });
    const state = connection.state;
    const stateRequired = () => {
      connection.send(JSON.stringify({ type: 'state-required' }));
      connection.close(4003, 'state-required');
    };
    if (
      state === null ||
      state === undefined ||
      state.serviceName !== key.serviceName ||
      state.userId !== key.userId ||
      state.frontendName !== key.frontendName
    ) {
      stateRequired();
      return;
    }
    if (
      state.phase !== 'awaiting-resume' ||
      typeof props.message !== 'string'
    ) {
      stateRequired();
      return;
    }
    const decodedResume = yield* Schema.decodeUnknown(
      Schema.parseJson(
        Schema.Struct({
          frontendIndex: Schema.Number,
        }),
      ),
    )(props.message, { onExcessProperty: 'error' }).pipe(Effect.either);
    if (
      Either.isLeft(decodedResume) ||
      !Number.isInteger(decodedResume.right.frontendIndex) ||
      decodedResume.right.frontendIndex < 0 ||
      decodedResume.right.frontendIndex > targetDescriptor.terminalFrontendIndex
    ) {
      stateRequired();
      return;
    }
    connection.setState({ ...state, phase: 'replaying' });

    const segments: Array<{
      descriptor: Readonly<{
        systemId: ISystemId;
        generationId: string;
        serviceName: string;
        userId: string;
        frontendName: string;
        terminalFrontendIndex: number;
        predecessor: Readonly<{
          generationId: string;
          repoName: string;
          terminalFrontendIndex: number;
        }> | null;
      }>;
      repo: null | ReturnType<typeof props.getPredecessorRepo>;
    }> = [{ descriptor: targetDescriptor, repo: null }];
    const visitedGenerationIds = new Set<string>([key.generationId]);
    const visitedRepoNames = new Set<string>();
    let currentDescriptor = targetDescriptor;
    while (currentDescriptor.predecessor !== null) {
      const predecessor = currentDescriptor.predecessor;
      if (
        visitedGenerationIds.has(predecessor.generationId) ||
        visitedRepoNames.has(predecessor.repoName)
      ) {
        stateRequired();
        return;
      }
      visitedGenerationIds.add(predecessor.generationId);
      visitedRepoNames.add(predecessor.repoName);
      const predecessorKeyResult = yield* props
        .parseRepoName(predecessor.repoName)
        .pipe(Effect.either);
      if (
        Either.isLeft(predecessorKeyResult) ||
        predecessorKeyResult.right.generationId !== predecessor.generationId ||
        predecessorKeyResult.right.serviceName !== key.serviceName ||
        predecessorKeyResult.right.userId !== key.userId ||
        predecessorKeyResult.right.frontendName !== key.frontendName
      ) {
        stateRequired();
        return;
      }
      const predecessorRepo = props.getPredecessorRepo(predecessor.repoName);
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
        predecessorDescriptor.generationId !== predecessor.generationId ||
        predecessorDescriptor.terminalFrontendIndex !==
          predecessor.terminalFrontendIndex
      ) {
        stateRequired();
        return;
      }
      segments.push({
        descriptor: predecessorDescriptor,
        repo: predecessorRepo,
      });
      currentDescriptor = predecessorDescriptor;
    }
    segments.reverse();

    let replayedThroughFrontendIndex = decodedResume.right.frontendIndex;
    let pendingBlocks: IServiceFrontendBlock[] = [];
    for (const segment of segments) {
      const firstSegmentIndex =
        (segment.descriptor.predecessor?.terminalFrontendIndex ?? 0) + 1;
      if (
        replayedThroughFrontendIndex >= segment.descriptor.terminalFrontendIndex
      ) {
        continue;
      }
      if (replayedThroughFrontendIndex + 1 < firstSegmentIndex) {
        stateRequired();
        return;
      }
      const afterFrontendIndex = Math.max(
        replayedThroughFrontendIndex,
        firstSegmentIndex - 1,
      );
      const segmentRepo = segment.repo;
      const archivedResult =
        segmentRepo === null
          ? yield* getArchivedBlocks({
              afterFrontendIndex,
              throughFrontendIndex: segment.descriptor.terminalFrontendIndex,
              serviceFrontendLock: state.serviceFrontendLock,
              db,
              key,
            }).pipe(Effect.either)
          : yield* makeAsync(() =>
              segmentRepo.getArchivedBlocks({
                afterFrontendIndex,
                throughFrontendIndex: segment.descriptor.terminalFrontendIndex,
                serviceFrontendLock: state.serviceFrontendLock,
              }),
            ).pipe(Effect.flatMap(decodeRpc), Effect.either);
      if (Either.isLeft(archivedResult)) {
        stateRequired();
        return;
      }
      for (const block of archivedResult.right) {
        if (block.frontendIndex !== replayedThroughFrontendIndex + 1) {
          stateRequired();
          return;
        }
        pendingBlocks.push(block);
        replayedThroughFrontendIndex = block.frontendIndex;
      }
      if (
        replayedThroughFrontendIndex !==
        segment.descriptor.terminalFrontendIndex
      ) {
        stateRequired();
        return;
      }
    }

    let deliveredThroughFrontendIndex = decodedResume.right.frontendIndex;
    while (true) {
      for (const pending of pendingBlocks) {
        if (
          pending.frontendIndex !== deliveredThroughFrontendIndex + 1 ||
          pending.frontendName !== key.frontendName
        ) {
          stateRequired();
          return;
        }
        const encodedBlock = yield* Schema.encode(ServiceFrontendBlockSchema)(
          pending,
        ).pipe(
          mapParseError({
            code: 'service-frontend-delivery-block-encode-failed',
            prefix: 'Failed to encode a connection-specific frontend block',
          }),
        );
        yield* Effect.try({
          try: () =>
            connection.send(
              JSON.stringify({
                type: 'serviceFrontendBlock',
                sync: encodedBlock,
              }),
            ),
          catch: ZerospinError.catch({
            code: 'service-frontend-delivery-block-send-failed',
            message: 'Failed to send a connection-specific frontend block',
          }),
        });
        deliveredThroughFrontendIndex = pending.frontendIndex;
      }

      const stableTargetDescriptor = yield* getPredecessor({ db, key });
      if (
        stableTargetDescriptor.systemId !== targetDescriptor.systemId ||
        stableTargetDescriptor.generationId !== key.generationId ||
        stableTargetDescriptor.terminalFrontendIndex <
          deliveredThroughFrontendIndex
      ) {
        stateRequired();
        return;
      }
      if (
        stableTargetDescriptor.terminalFrontendIndex ===
        deliveredThroughFrontendIndex
      ) {
        break;
      }
      const suffixResult = yield* getArchivedBlocks({
        afterFrontendIndex: deliveredThroughFrontendIndex,
        throughFrontendIndex: stableTargetDescriptor.terminalFrontendIndex,
        serviceFrontendLock: state.serviceFrontendLock,
        db,
        key,
      }).pipe(Effect.either);
      if (Either.isLeft(suffixResult)) {
        stateRequired();
        return;
      }
      pendingBlocks = [...suffixResult.right];
    }

    connection.send(
      JSON.stringify({
        type: 'replay-complete',
        frontendIndex: deliveredThroughFrontendIndex,
      }),
    );
    connection.setState({ ...state, phase: 'live' });
  },
);
