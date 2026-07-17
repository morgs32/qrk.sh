import { getFrontendController } from '@zerospin/core/accountController/getFrontendController';
import type { Async } from '@zerospin/core/async/Async';
import { applyFrontendMutationTx } from '@zerospin/core/contracts/applyFrontendMutationTx';
import { PushedBlockSchema } from '@zerospin/core/contracts/CommandSchema';
import { encodeAppliedMutation } from '@zerospin/core/contracts/encodeAppliedMutation';
import { encodeCommand } from '@zerospin/core/contracts/encodeCommand';
import { makeMutations } from '@zerospin/core/contracts/makeMutations';
import type {
  IEncodedCommand,
  IFailedStagedCommand,
  IPushedCommand,
  IStagedCommand,
} from '@zerospin/core/contracts/types';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { withSavepoint } from '@zerospin/core/drizzle/withSavepoint';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { dutils } from '@zerospin/core/utils/dutils';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { makeCursor } from '@zerospin/core/utils/makeCursor';
import { makeIdFromAbbreviation } from '@zerospin/core/utils/makeIdFromAbbreviation';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { and, eq } from 'drizzle-orm';
import { Effect, Either, Schema } from 'effect';
import { system } from 'system';

import { getLastAccountCursor } from '../../getLastAccountCursor/getLastAccountCursor.js';
import { bootstrap } from '../bootstrap/bootstrap.js';
import { frontendRepoDrizzleSchemas } from '../FrontendRepo.js';

const LAST_REBASED_PUSHED_CURSOR_KV_KEY = 'lastRebasedPushedCursor';

/*
 * 1. Validate and order one session's staged command request.
 * 2. Bootstrap the projection and capture its authoritative account frontier.
 * 3. Classify pending, terminal, processed, and newly admissible commands.
 * 4. Guard and apply each new optimistic command in its own savepoint.
 * 5. Persist successful commands in one immutable cursor-stamped pushed block.
 */
export const pushCommands = Effect.fn('FrontendRepo.pushCommands')(
  function* (props: {
    accountId: string;
    accountName: string;
    actorId: string;
    actorName: string;
    frontendName: string;
    commands: readonly IEncodedCommand<IStagedCommand>[];
    key: {
      generationId: string;
      accountId: string;
      accountName: string;
      actorId: string;
      actorName: string;
      frontendName: string;
    };
    name: string;
    db: IDb;
    storage: DurableObjectStorage;
  }): Effect.fn.Return<
    {
      pendingCommands: readonly IEncodedCommand<IPushedCommand>[];
      pushedCommands: readonly IEncodedCommand<IPushedCommand>[];
      failedCommands: readonly IEncodedCommand<IFailedStagedCommand>[];
    },
    IAnyError,
    Async | CuidFactory | MonotonicFactory
  > {
    const { commands, db, key, name, storage } = props;
    const pendingCommands: IEncodedCommand<IPushedCommand>[] = [];
    const pushedCommands: IEncodedCommand<IPushedCommand>[] = [];
    const failedCommands: IEncodedCommand<IFailedStagedCommand>[] = [];

    // 1 — reject request, command-scope, session, and system mismatches before touching repo state
    if (
      props.accountId !== key.accountId ||
      props.accountName !== key.accountName ||
      props.actorId !== key.actorId ||
      props.actorName !== key.actorName ||
      props.frontendName !== key.frontendName
    ) {
      return yield* new ZerospinError({
        code: 'frontend-push-request-key-mismatch',
        message: 'pushCommands request scope does not match this FrontendRepo',
      });
    }
    if (commands.length === 0) {
      return { pendingCommands, pushedCommands, failedCommands };
    }

    const sortedCommands = [...commands].sort((left, right) =>
      left.stagedCursor.localeCompare(right.stagedCursor),
    );
    const firstCommand = sortedCommands[0];
    if (firstCommand === undefined) {
      return { pendingCommands, pushedCommands, failedCommands };
    }
    for (const stagedCommand of sortedCommands) {
      if (
        stagedCommand.accountId !== key.accountId ||
        stagedCommand.accountName !== key.accountName ||
        stagedCommand.actorId !== key.actorId ||
        stagedCommand.actorName !== key.actorName ||
        stagedCommand.frontendName !== key.frontendName
      ) {
        return yield* new ZerospinError({
          code: 'frontend-push-command-key-mismatch',
          message: `Staged command "${stagedCommand.id}" does not match this FrontendRepo key`,
        });
      }
      if (stagedCommand.sessionId !== firstCommand.sessionId) {
        return yield* new ZerospinError({
          code: 'frontend-push-session-mismatch',
          message:
            'One pushCommands call cannot contain commands from multiple sessions',
        });
      }
    }

    // 2 — bootstrap before reading the exact account cursor represented by the guard database
    yield* bootstrap({ key, name, db, storage });
    const frontendController = yield* getFrontendController({
      system,
      accountName: key.accountName,
      actorName: key.actorName,
      frontendName: key.frontendName,
    });
    for (const stagedCommand of sortedCommands) {
      if (stagedCommand.systemName !== frontendController.systemName) {
        return yield* new ZerospinError({
          code: 'frontend-push-command-system-mismatch',
          message: `Staged command "${stagedCommand.id}" targets system "${stagedCommand.systemName}", not "${frontendController.systemName}"`,
        });
      }
    }

    yield* makeTx({
      db,
      program: Effect.fn('FrontendRepo.pushCommands.transaction')(function* ({
        tx,
      }) {
        const admissionLastAccountCursor =
          (yield* getLastAccountCursor({ storage })) ?? null;

        // 3 — recover exact pending retries and reject cursors already covered by durable watermarks
        for (const stagedCommand of sortedCommands) {
          const existing = tx
            .select()
            .from(frontendRepoDrizzleSchemas.pushedCommands)
            .where(
              and(
                eq(
                  frontendRepoDrizzleSchemas.pushedCommands.sessionId,
                  stagedCommand.sessionId,
                ),
                eq(
                  frontendRepoDrizzleSchemas.pushedCommands.stagedCursor,
                  stagedCommand.stagedCursor,
                ),
              ),
            )
            .get();

          if (existing !== undefined) {
            let originalPushedCommand:
              | IEncodedCommand<IPushedCommand>
              | undefined;
            for (const pushedBlockRow of tx
              .select()
              .from(frontendRepoDrizzleSchemas.pushedBlockOutbox)
              .all()) {
              const pushedBlock = yield* Schema.decodeUnknown(
                Schema.parseJson(PushedBlockSchema),
              )(pushedBlockRow.block).pipe(
                mapParseError({
                  code: 'frontend-pushed-block-outbox-decode-failed',
                  prefix: `Failed to decode pushed block outbox row "${pushedBlockRow.id}"`,
                }),
              );
              originalPushedCommand = pushedBlock.commands.find(
                command => command.id === existing.id,
              );
              if (originalPushedCommand !== undefined) {
                break;
              }
            }
            if (originalPushedCommand === undefined) {
              return yield* new ZerospinError({
                code: 'frontend-push-command-missing-open-block',
                message: `Pending pushed command "${existing.id}" has no open pushed block`,
              });
            }
            if (
              originalPushedCommand.id === stagedCommand.id &&
              originalPushedCommand.commandName === stagedCommand.commandName &&
              originalPushedCommand.payload === stagedCommand.payload &&
              originalPushedCommand.systemName === stagedCommand.systemName &&
              originalPushedCommand.version === stagedCommand.version &&
              originalPushedCommand.commandType === stagedCommand.commandType &&
              originalPushedCommand.accountId === stagedCommand.accountId &&
              originalPushedCommand.accountName === stagedCommand.accountName &&
              originalPushedCommand.frontendName ===
                stagedCommand.frontendName &&
              originalPushedCommand.actorId === stagedCommand.actorId &&
              originalPushedCommand.actorName === stagedCommand.actorName &&
              originalPushedCommand.sessionId === stagedCommand.sessionId &&
              originalPushedCommand.stagedCursor ===
                stagedCommand.stagedCursor &&
              originalPushedCommand.stagedAt.getTime() ===
                stagedCommand.stagedAt.getTime() &&
              stagedCommand.pushedCursor === null
            ) {
              if (
                pushedCommands.every(
                  command => command.id !== originalPushedCommand.id,
                )
              ) {
                pendingCommands.push(originalPushedCommand);
              }
              continue;
            }

            const failedAt = yield* dutils.date();
            failedCommands.push({
              ...stagedCommand,
              failedAt,
              failure: ZerospinError.stringify(
                new ZerospinError({
                  code: 'frontend-push-staged-cursor-conflict',
                  message: `Staged cursor "${stagedCommand.stagedCursor}" was already used by another command`,
                }),
              ),
              status: 'failed',
            });
            continue;
          }

          const terminalStagedCursor = storage.kv.get(
            `terminalStagedCursor:${stagedCommand.sessionId}`,
          );
          if (
            terminalStagedCursor !== undefined &&
            typeof terminalStagedCursor !== 'string'
          ) {
            return yield* new ZerospinError({
              code: 'frontend-push-invalid-terminal-staged-cursor',
              message: `Terminal staged cursor for session "${stagedCommand.sessionId}" must be a string`,
            });
          }
          if (
            terminalStagedCursor !== undefined &&
            stagedCommand.stagedCursor <= terminalStagedCursor
          ) {
            const failedAt = yield* dutils.date();
            failedCommands.push({
              ...stagedCommand,
              failedAt,
              failure: ZerospinError.stringify(
                new ZerospinError({
                  code: 'frontend-push-command-already-terminal',
                  message: `Staged command "${stagedCommand.id}" is at or below its session terminal watermark`,
                }),
              ),
              status: 'failed',
            });
            continue;
          }

          const processedStagedCursor = storage.kv.get(
            `processedStagedCursor:${stagedCommand.sessionId}`,
          );
          if (
            processedStagedCursor !== undefined &&
            typeof processedStagedCursor !== 'string'
          ) {
            return yield* new ZerospinError({
              code: 'frontend-push-invalid-processed-staged-cursor',
              message: `Processed staged cursor for session "${stagedCommand.sessionId}" must be a string`,
            });
          }
          if (
            processedStagedCursor !== undefined &&
            stagedCommand.stagedCursor <= processedStagedCursor
          ) {
            const failedAt = yield* dutils.date();
            failedCommands.push({
              ...stagedCommand,
              failedAt,
              failure: ZerospinError.stringify(
                new ZerospinError({
                  code: 'frontend-push-command-already-processed',
                  message: `Staged command "${stagedCommand.id}" is at or below its session processed watermark`,
                }),
              ),
              status: 'failed',
            });
            continue;
          }

          // 4 — validate, guard, and optimistically apply this command without rolling back siblings
          const admitted = yield* withSavepoint({
            tx,
            program: Effect.fn('FrontendRepo.pushCommands.admit')(function* ({
              tx: savepointTx,
            }) {
              if (stagedCommand.pushedCursor !== null) {
                return yield* new ZerospinError({
                  code: 'frontend-push-staged-command-has-pushed-cursor',
                  message: `Staged command "${stagedCommand.id}" already has a pushed cursor`,
                });
              }

              const contract = yield* getByKeyOrThrow({
                record: frontendController.contracts,
                key: stagedCommand.commandName,
                recordKind: 'frontend contracts',
              });
              if (stagedCommand.version !== contract.version) {
                return yield* new ZerospinError({
                  code: 'frontend-push-command-version-mismatch',
                  message: `Command "${stagedCommand.commandName}" has version "${stagedCommand.version}" but frontend contract version is "${contract.version}"`,
                });
              }

              const decodedPayload = yield* contract.decodePayload({
                command: stagedCommand,
              });
              const payload = yield* contract.validatePayload({
                payload: decodedPayload,
              });
              const guards = yield* getByKeyOrThrow({
                record: frontendController.guards,
                key: stagedCommand.commandName,
                recordKind: 'frontend guards',
              });
              for (const guard of guards) {
                yield* guard({
                  actorId: key.actorId,
                  db: savepointTx,
                  payload,
                });
              }
              const { mutations, payload: validatedPayload } =
                yield* makeMutations({
                  contract,
                  models: frontendController.models,
                  owner: { kind: 'account' },
                  command: {
                    ...stagedCommand,
                    payload,
                  },
                });
              const pushedAt = yield* dutils.date();
              const pushedCursor = yield* makeCursor({
                abbreviation: coreAbbreviations.pushedCursor,
              });
              const pushedCommand = {
                ...stagedCommand,
                payload: validatedPayload,
                pushedAt,
                pushedCursor,
                status: 'pushed',
              } satisfies IPushedCommand;
              const encodedPushedCommand = yield* encodeCommand({
                contract,
                command: pushedCommand,
              });

              savepointTx
                .insert(frontendRepoDrizzleSchemas.pushedCommands)
                .values(encodedPushedCommand)
                .run();
              for (const [mutationIndex, mutation] of mutations.entries()) {
                const appliedMutation = yield* applyFrontendMutationTx({
                  tx: savepointTx,
                  mutation,
                  commandId: stagedCommand.id,
                  mutationIndex,
                  appliedAt: pushedAt,
                });
                const encodedMutation = yield* encodeAppliedMutation({
                  mutation: appliedMutation,
                });
                savepointTx
                  .insert(frontendRepoDrizzleSchemas.pushedMutations)
                  .values(encodedMutation)
                  .run();
              }

              return encodedPushedCommand;
            }),
          }).pipe(Effect.either);

          storage.kv.put(
            `processedStagedCursor:${stagedCommand.sessionId}`,
            stagedCommand.stagedCursor,
          );
          if (Either.isLeft(admitted)) {
            const failedAt = yield* dutils.date();
            failedCommands.push({
              ...stagedCommand,
              failedAt,
              failure: ZerospinError.stringify(admitted.left),
              status: 'failed',
            });
            if (
              terminalStagedCursor === undefined ||
              stagedCommand.stagedCursor > terminalStagedCursor
            ) {
              storage.kv.put(
                `terminalStagedCursor:${stagedCommand.sessionId}`,
                stagedCommand.stagedCursor,
              );
            }
            continue;
          }

          pushedCommands.push(admitted.right);
        }

        if (pushedCommands.length === 0) {
          return;
        }

        // 5 — bind every newly pushed sibling to the one account frontier used by this transaction
        const pushedBlock = {
          id: yield* makeIdFromAbbreviation({ abbreviation: 'pblk' }),
          sessionId: firstCommand.sessionId,
          admissionLastAccountCursor,
          commands: pushedCommands,
        };
        const encodedPushedBlock = yield* Schema.encode(
          Schema.parseJson(PushedBlockSchema),
        )(pushedBlock).pipe(
          mapParseError({
            code: 'frontend-pushed-block-encode-failed',
            prefix: 'Failed to encode FrontendRepo pushed block',
          }),
        );
        const firstPushedCommand = pushedCommands[0];
        const lastPushedCommand = pushedCommands[pushedCommands.length - 1];
        if (
          firstPushedCommand === undefined ||
          lastPushedCommand === undefined
        ) {
          return yield* new ZerospinError({
            code: 'frontend-pushed-block-has-no-commands',
            message: 'Cannot store a pushed block without commands',
          });
        }
        tx.insert(frontendRepoDrizzleSchemas.pushedBlockOutbox)
          .values({
            id: pushedBlock.id,
            sessionId: pushedBlock.sessionId,
            firstPushedCursor: firstPushedCommand.pushedCursor,
            block: encodedPushedBlock,
            finalizedAt: null,
            failure: null,
          })
          .run();
        storage.kv.put(
          LAST_REBASED_PUSHED_CURSOR_KV_KEY,
          lastPushedCommand.pushedCursor,
        );
      }),
    });

    return { pendingCommands, pushedCommands, failedCommands };
  },
);
