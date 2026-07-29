/*
 * System-worker annotation:
 * Implements the SystemRepo migrate System Repo operation.
 * Keep the domain effect named after the operation and leave async Promise glue at the Durable Object boundary.
 */

import { migrateDb } from '@zerospin/core/drizzle/migrateDb';
import type {
  IDb,
  IDbConfig,
  IDbConfigSchema,
} from '@zerospin/core/drizzle/types';
import { ZerospinError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import { Effect } from 'effect';

export const migrateSystemRepo = Effect.fn('SystemRepo.migrate')(function* <
  CONFIG extends IDbConfig,
>(props: {
  storage: DurableObjectStorage;
  db: IDb<CONFIG>;
  schema: IDbConfigSchema<CONFIG>;
}) {
  const { storage, db, schema } = props;

  // Schema DDL must always run before any current table descriptor can query
  // a persisted row. Individual data rewrites have their own durable markers.
  yield* migrateDb({ db, schema });

  // Existing SystemRepo databases predate the finite-drain freeze receipt.
  // `migrateDb` creates missing tables and indexes, but authored table evolution
  // remains an explicit one-time ALTER so the required steady-state column is
  // never represented as optional compatibility state.
  yield* Effect.try({
    try: () => {
      const generationStateColumns = db.all<{ name: string }>(
        sql.raw('PRAGMA table_info(generationState)'),
      );
      if (
        generationStateColumns.find(
          column => column.name === 'drainFrozenAt',
        ) === undefined
      ) {
        db.run(
          sql.raw(
            'ALTER TABLE generationState ADD COLUMN drainFrozenAt INTEGER',
          ),
        );
      }
      if (
        generationStateColumns.find(
          column => column.name === 'successorGenerationId',
        ) === undefined
      ) {
        db.run(
          sql.raw(
            'ALTER TABLE generationState ADD COLUMN successorGenerationId TEXT',
          ),
        );
      }

      const drainBoundColumns = db.all<{ name: string }>(
        sql.raw('PRAGMA table_info(drainBounds)'),
      );
      if (
        drainBoundColumns.find(column => column.name === 'systemWorkerName') ===
        undefined
      ) {
        db.run(
          sql.raw('ALTER TABLE drainBounds ADD COLUMN systemWorkerName TEXT'),
        );
      }
      if (
        drainBoundColumns.find(
          column => column.name === 'frontendBlockRepoName',
        ) === undefined
      ) {
        db.run(
          sql.raw(
            'ALTER TABLE drainBounds ADD COLUMN frontendBlockRepoName TEXT',
          ),
        );
      }
      if (
        drainBoundColumns.find(
          column => column.name === 'terminalFrontendIndex',
        ) === undefined
      ) {
        db.run(
          sql.raw(
            'ALTER TABLE drainBounds ADD COLUMN terminalFrontendIndex INTEGER',
          ),
        );
      }
      if (
        drainBoundColumns.find(column => column.name === 'segmentKind') ===
        undefined
      ) {
        db.run(sql.raw('ALTER TABLE drainBounds ADD COLUMN segmentKind TEXT'));
      }
      if (
        drainBoundColumns.find(
          column => column.name === 'predecessorGenerationId',
        ) === undefined
      ) {
        db.run(
          sql.raw(
            'ALTER TABLE drainBounds ADD COLUMN predecessorGenerationId TEXT',
          ),
        );
      }
      if (
        drainBoundColumns.find(
          column => column.name === 'predecessorRepoName',
        ) === undefined
      ) {
        db.run(
          sql.raw(
            'ALTER TABLE drainBounds ADD COLUMN predecessorRepoName TEXT',
          ),
        );
      }
      if (
        drainBoundColumns.find(
          column => column.name === 'predecessorTerminalFrontendIndex',
        ) === undefined
      ) {
        db.run(
          sql.raw(
            'ALTER TABLE drainBounds ADD COLUMN predecessorTerminalFrontendIndex INTEGER',
          ),
        );
      }
    },
    catch: ZerospinError.catch({
      code: 'system-repo-generation-control-migration-failed',
      message: 'Failed to migrate generation drain control storage',
      preferCauseMessage: true,
    }),
  });

  // WebSocket tickets are ephemeral capabilities, so rows minted before the
  // trusted frontend version became part of the ticket cannot be upgraded.
  // Delete only those pre-column rows, then install the required steady-state
  // columns in the same SQLite transaction. A partially completed migration
  // independently repairs whichever ticket table still has the legacy shape.
  yield* Effect.try({
    try: () => {
      const frontendWebSocketTicketColumns = db.all<{ name: string }>(
        sql.raw('PRAGMA table_info(frontendWebSocketTickets)'),
      );
      const serviceFrontendWebSocketTicketColumns = db.all<{ name: string }>(
        sql.raw('PRAGMA table_info(serviceFrontendWebSocketTickets)'),
      );

      db.transaction(tx => {
        if (
          frontendWebSocketTicketColumns.find(
            column => column.name === 'frontendVersion',
          ) === undefined
        ) {
          tx.run(sql.raw('DELETE FROM frontendWebSocketTickets'));
          tx.run(
            sql.raw(
              'ALTER TABLE frontendWebSocketTickets ADD COLUMN frontendVersion TEXT NOT NULL',
            ),
          );
        }

        if (
          serviceFrontendWebSocketTicketColumns.find(
            column => column.name === 'frontendVersion',
          ) === undefined
        ) {
          tx.run(sql.raw('DELETE FROM serviceFrontendWebSocketTickets'));
          tx.run(
            sql.raw(
              'ALTER TABLE serviceFrontendWebSocketTickets ADD COLUMN frontendVersion TEXT NOT NULL',
            ),
          );
        }
      });
    },
    catch: ZerospinError.catch({
      code: 'system-repo-websocket-ticket-version-migration-failed',
      message: 'Failed to bind WebSocket tickets to frontend versions',
      preferCauseMessage: true,
    }),
  });

  if (
    storage.kv.get('isMigratedServiceActorControllersSystemSpec') === 'true'
  ) {
    return;
  }

  yield* Effect.try({
    try: () => {
      db.transaction(tx => {
        // Read raw SQLite text. The current generationState descriptor already
        // requires actorControllers, so using it here would decode too early.
        const rows = tx.all<{
          generationId: string;
          activeSystemSpec: string | null;
          preparingSystemSpec: string | null;
        }>(
          sql.raw(
            'SELECT generationId, activeSystemSpec, preparingSystemSpec FROM generationState',
          ),
        );

        for (const row of rows) {
          let activeSystemSpec = row.activeSystemSpec;
          let preparingSystemSpec = row.preparingSystemSpec;

          if (activeSystemSpec !== null) {
            const parsed: unknown = JSON.parse(activeSystemSpec);
            if (
              typeof parsed !== 'object' ||
              parsed === null ||
              Array.isArray(parsed)
            ) {
              throw new ZerospinError({
                code: 'stored-system-spec-migration-invalid',
                message: 'Stored active SystemSpec is not an object',
                extra: { generationId: row.generationId },
              });
            }
            const serviceControllers = Reflect.get(
              parsed,
              'serviceControllers',
            );
            if (
              typeof serviceControllers !== 'object' ||
              serviceControllers === null ||
              Array.isArray(serviceControllers)
            ) {
              throw new ZerospinError({
                code: 'stored-system-spec-migration-invalid',
                message:
                  'Stored active SystemSpec serviceControllers is not an object',
                extra: { generationId: row.generationId },
              });
            }

            const accountControllers = Reflect.get(
              parsed,
              'accountControllers',
            );
            if (
              typeof accountControllers !== 'object' ||
              accountControllers === null ||
              Array.isArray(accountControllers)
            ) {
              throw new ZerospinError({
                code: 'stored-system-spec-migration-invalid',
                message:
                  'Stored active SystemSpec accountControllers is not an object',
                extra: { generationId: row.generationId },
              });
            }
            for (const accountName of Object.keys(accountControllers)) {
              const accountController = Reflect.get(
                accountControllers,
                accountName,
              );
              if (
                typeof accountController !== 'object' ||
                accountController === null ||
                Array.isArray(accountController)
              ) {
                throw new ZerospinError({
                  code: 'stored-system-spec-migration-invalid',
                  message:
                    'Stored active SystemSpec contains an invalid account controller',
                  extra: { generationId: row.generationId, accountName },
                });
              }
              const accountContracts = Reflect.get(
                accountController,
                'contracts',
              );
              if (
                typeof accountContracts !== 'object' ||
                accountContracts === null ||
                Array.isArray(accountContracts)
              ) {
                throw new ZerospinError({
                  code: 'stored-system-spec-migration-invalid',
                  message:
                    'Stored active account controller contracts is not an object',
                  extra: { generationId: row.generationId, accountName },
                });
              }
              for (const contractName of Object.keys(accountContracts)) {
                const contract = Reflect.get(accountContracts, contractName);
                if (
                  typeof contract !== 'object' ||
                  contract === null ||
                  Array.isArray(contract)
                ) {
                  throw new ZerospinError({
                    code: 'stored-system-spec-migration-invalid',
                    message:
                      'Stored active account controller contains an invalid contract',
                    extra: {
                      generationId: row.generationId,
                      accountName,
                      contractName,
                    },
                  });
                }
                if (!('historicalDefinitions' in contract)) {
                  Reflect.set(contract, 'historicalDefinitions', []);
                }
              }
              const actorControllers = Reflect.get(
                accountController,
                'actorControllers',
              );
              if (
                typeof actorControllers !== 'object' ||
                actorControllers === null ||
                Array.isArray(actorControllers)
              ) {
                throw new ZerospinError({
                  code: 'stored-system-spec-migration-invalid',
                  message:
                    'Stored active account actorControllers is not an object',
                  extra: { generationId: row.generationId, accountName },
                });
              }
              for (const actorName of Object.keys(actorControllers)) {
                const actorController = Reflect.get(
                  actorControllers,
                  actorName,
                );
                if (
                  typeof actorController !== 'object' ||
                  actorController === null ||
                  Array.isArray(actorController)
                ) {
                  throw new ZerospinError({
                    code: 'stored-system-spec-migration-invalid',
                    message:
                      'Stored active account contains an invalid actor controller',
                    extra: {
                      generationId: row.generationId,
                      accountName,
                      actorName,
                    },
                  });
                }
                const frontends = Reflect.get(actorController, 'frontends');
                if (
                  typeof frontends !== 'object' ||
                  frontends === null ||
                  Array.isArray(frontends)
                ) {
                  throw new ZerospinError({
                    code: 'stored-system-spec-migration-invalid',
                    message:
                      'Stored active account actor frontends is not an object',
                    extra: {
                      generationId: row.generationId,
                      accountName,
                      actorName,
                    },
                  });
                }
                for (const frontendName of Object.keys(frontends)) {
                  const binding = Reflect.get(frontends, frontendName);
                  const frontendController =
                    typeof binding === 'object' &&
                    binding !== null &&
                    !Array.isArray(binding)
                      ? Reflect.get(binding, 'frontendController')
                      : undefined;
                  const frontendContracts =
                    typeof frontendController === 'object' &&
                    frontendController !== null &&
                    !Array.isArray(frontendController)
                      ? Reflect.get(frontendController, 'contracts')
                      : undefined;
                  if (
                    typeof frontendContracts !== 'object' ||
                    frontendContracts === null ||
                    Array.isArray(frontendContracts)
                  ) {
                    throw new ZerospinError({
                      code: 'stored-system-spec-migration-invalid',
                      message:
                        'Stored active account frontend contracts is not an object',
                      extra: {
                        generationId: row.generationId,
                        accountName,
                        actorName,
                        frontendName,
                      },
                    });
                  }
                  for (const contractName of Object.keys(frontendContracts)) {
                    const contract = Reflect.get(
                      frontendContracts,
                      contractName,
                    );
                    if (
                      typeof contract !== 'object' ||
                      contract === null ||
                      Array.isArray(contract)
                    ) {
                      throw new ZerospinError({
                        code: 'stored-system-spec-migration-invalid',
                        message:
                          'Stored active account frontend contains an invalid contract',
                        extra: {
                          generationId: row.generationId,
                          accountName,
                          actorName,
                          frontendName,
                          contractName,
                        },
                      });
                    }
                    if (!('historicalDefinitions' in contract)) {
                      Reflect.set(contract, 'historicalDefinitions', []);
                    }
                  }
                }
              }
            }

            const migratedServiceControllers: Record<string, unknown> = {};
            for (const serviceName of Object.keys(serviceControllers)) {
              const serviceController = Reflect.get(
                serviceControllers,
                serviceName,
              );
              if (
                typeof serviceController !== 'object' ||
                serviceController === null ||
                Array.isArray(serviceController)
              ) {
                throw new ZerospinError({
                  code: 'stored-system-spec-migration-invalid',
                  message:
                    'Stored active SystemSpec contains an invalid service controller',
                  extra: { generationId: row.generationId, serviceName },
                });
              }
              const serviceContracts = Reflect.get(
                serviceController,
                'contracts',
              );
              if (
                typeof serviceContracts !== 'object' ||
                serviceContracts === null ||
                Array.isArray(serviceContracts)
              ) {
                throw new ZerospinError({
                  code: 'stored-system-spec-migration-invalid',
                  message:
                    'Stored active service controller contracts is not an object',
                  extra: { generationId: row.generationId, serviceName },
                });
              }
              for (const contractName of Object.keys(serviceContracts)) {
                const contract = Reflect.get(serviceContracts, contractName);
                if (
                  typeof contract !== 'object' ||
                  contract === null ||
                  Array.isArray(contract)
                ) {
                  throw new ZerospinError({
                    code: 'stored-system-spec-migration-invalid',
                    message:
                      'Stored active service controller contains an invalid contract',
                    extra: {
                      generationId: row.generationId,
                      serviceName,
                      contractName,
                    },
                  });
                }
                if (!('historicalDefinitions' in contract)) {
                  Reflect.set(contract, 'historicalDefinitions', []);
                }
              }
              migratedServiceControllers[serviceName] =
                'actorControllers' in serviceController
                  ? serviceController
                  : { ...serviceController, actorControllers: {} };
            }
            activeSystemSpec = JSON.stringify({
              ...parsed,
              serviceControllers: migratedServiceControllers,
            });
          }

          if (preparingSystemSpec !== null) {
            const parsed: unknown = JSON.parse(preparingSystemSpec);
            if (
              typeof parsed !== 'object' ||
              parsed === null ||
              Array.isArray(parsed)
            ) {
              throw new ZerospinError({
                code: 'stored-system-spec-migration-invalid',
                message: 'Stored preparing SystemSpec is not an object',
                extra: { generationId: row.generationId },
              });
            }
            const serviceControllers = Reflect.get(
              parsed,
              'serviceControllers',
            );
            if (
              typeof serviceControllers !== 'object' ||
              serviceControllers === null ||
              Array.isArray(serviceControllers)
            ) {
              throw new ZerospinError({
                code: 'stored-system-spec-migration-invalid',
                message:
                  'Stored preparing SystemSpec serviceControllers is not an object',
                extra: { generationId: row.generationId },
              });
            }

            const accountControllers = Reflect.get(
              parsed,
              'accountControllers',
            );
            if (
              typeof accountControllers !== 'object' ||
              accountControllers === null ||
              Array.isArray(accountControllers)
            ) {
              throw new ZerospinError({
                code: 'stored-system-spec-migration-invalid',
                message:
                  'Stored preparing SystemSpec accountControllers is not an object',
                extra: { generationId: row.generationId },
              });
            }
            for (const accountName of Object.keys(accountControllers)) {
              const accountController = Reflect.get(
                accountControllers,
                accountName,
              );
              if (
                typeof accountController !== 'object' ||
                accountController === null ||
                Array.isArray(accountController)
              ) {
                throw new ZerospinError({
                  code: 'stored-system-spec-migration-invalid',
                  message:
                    'Stored preparing SystemSpec contains an invalid account controller',
                  extra: { generationId: row.generationId, accountName },
                });
              }
              const accountContracts = Reflect.get(
                accountController,
                'contracts',
              );
              if (
                typeof accountContracts !== 'object' ||
                accountContracts === null ||
                Array.isArray(accountContracts)
              ) {
                throw new ZerospinError({
                  code: 'stored-system-spec-migration-invalid',
                  message:
                    'Stored preparing account controller contracts is not an object',
                  extra: { generationId: row.generationId, accountName },
                });
              }
              for (const contractName of Object.keys(accountContracts)) {
                const contract = Reflect.get(accountContracts, contractName);
                if (
                  typeof contract !== 'object' ||
                  contract === null ||
                  Array.isArray(contract)
                ) {
                  throw new ZerospinError({
                    code: 'stored-system-spec-migration-invalid',
                    message:
                      'Stored preparing account controller contains an invalid contract',
                    extra: {
                      generationId: row.generationId,
                      accountName,
                      contractName,
                    },
                  });
                }
                if (!('historicalDefinitions' in contract)) {
                  Reflect.set(contract, 'historicalDefinitions', []);
                }
              }
              const actorControllers = Reflect.get(
                accountController,
                'actorControllers',
              );
              if (
                typeof actorControllers !== 'object' ||
                actorControllers === null ||
                Array.isArray(actorControllers)
              ) {
                throw new ZerospinError({
                  code: 'stored-system-spec-migration-invalid',
                  message:
                    'Stored preparing account actorControllers is not an object',
                  extra: { generationId: row.generationId, accountName },
                });
              }
              for (const actorName of Object.keys(actorControllers)) {
                const actorController = Reflect.get(
                  actorControllers,
                  actorName,
                );
                if (
                  typeof actorController !== 'object' ||
                  actorController === null ||
                  Array.isArray(actorController)
                ) {
                  throw new ZerospinError({
                    code: 'stored-system-spec-migration-invalid',
                    message:
                      'Stored preparing account contains an invalid actor controller',
                    extra: {
                      generationId: row.generationId,
                      accountName,
                      actorName,
                    },
                  });
                }
                const frontends = Reflect.get(actorController, 'frontends');
                if (
                  typeof frontends !== 'object' ||
                  frontends === null ||
                  Array.isArray(frontends)
                ) {
                  throw new ZerospinError({
                    code: 'stored-system-spec-migration-invalid',
                    message:
                      'Stored preparing account actor frontends is not an object',
                    extra: {
                      generationId: row.generationId,
                      accountName,
                      actorName,
                    },
                  });
                }
                for (const frontendName of Object.keys(frontends)) {
                  const binding = Reflect.get(frontends, frontendName);
                  const frontendController =
                    typeof binding === 'object' &&
                    binding !== null &&
                    !Array.isArray(binding)
                      ? Reflect.get(binding, 'frontendController')
                      : undefined;
                  const frontendContracts =
                    typeof frontendController === 'object' &&
                    frontendController !== null &&
                    !Array.isArray(frontendController)
                      ? Reflect.get(frontendController, 'contracts')
                      : undefined;
                  if (
                    typeof frontendContracts !== 'object' ||
                    frontendContracts === null ||
                    Array.isArray(frontendContracts)
                  ) {
                    throw new ZerospinError({
                      code: 'stored-system-spec-migration-invalid',
                      message:
                        'Stored preparing account frontend contracts is not an object',
                      extra: {
                        generationId: row.generationId,
                        accountName,
                        actorName,
                        frontendName,
                      },
                    });
                  }
                  for (const contractName of Object.keys(frontendContracts)) {
                    const contract = Reflect.get(
                      frontendContracts,
                      contractName,
                    );
                    if (
                      typeof contract !== 'object' ||
                      contract === null ||
                      Array.isArray(contract)
                    ) {
                      throw new ZerospinError({
                        code: 'stored-system-spec-migration-invalid',
                        message:
                          'Stored preparing account frontend contains an invalid contract',
                        extra: {
                          generationId: row.generationId,
                          accountName,
                          actorName,
                          frontendName,
                          contractName,
                        },
                      });
                    }
                    if (!('historicalDefinitions' in contract)) {
                      Reflect.set(contract, 'historicalDefinitions', []);
                    }
                  }
                }
              }
            }

            const migratedServiceControllers: Record<string, unknown> = {};
            for (const serviceName of Object.keys(serviceControllers)) {
              const serviceController = Reflect.get(
                serviceControllers,
                serviceName,
              );
              if (
                typeof serviceController !== 'object' ||
                serviceController === null ||
                Array.isArray(serviceController)
              ) {
                throw new ZerospinError({
                  code: 'stored-system-spec-migration-invalid',
                  message:
                    'Stored preparing SystemSpec contains an invalid service controller',
                  extra: { generationId: row.generationId, serviceName },
                });
              }
              const serviceContracts = Reflect.get(
                serviceController,
                'contracts',
              );
              if (
                typeof serviceContracts !== 'object' ||
                serviceContracts === null ||
                Array.isArray(serviceContracts)
              ) {
                throw new ZerospinError({
                  code: 'stored-system-spec-migration-invalid',
                  message:
                    'Stored preparing service controller contracts is not an object',
                  extra: { generationId: row.generationId, serviceName },
                });
              }
              for (const contractName of Object.keys(serviceContracts)) {
                const contract = Reflect.get(serviceContracts, contractName);
                if (
                  typeof contract !== 'object' ||
                  contract === null ||
                  Array.isArray(contract)
                ) {
                  throw new ZerospinError({
                    code: 'stored-system-spec-migration-invalid',
                    message:
                      'Stored preparing service controller contains an invalid contract',
                    extra: {
                      generationId: row.generationId,
                      serviceName,
                      contractName,
                    },
                  });
                }
                if (!('historicalDefinitions' in contract)) {
                  Reflect.set(contract, 'historicalDefinitions', []);
                }
              }
              migratedServiceControllers[serviceName] =
                'actorControllers' in serviceController
                  ? serviceController
                  : { ...serviceController, actorControllers: {} };
            }
            preparingSystemSpec = JSON.stringify({
              ...parsed,
              serviceControllers: migratedServiceControllers,
            });
          }

          tx.run(
            sql`UPDATE generationState
                SET activeSystemSpec = ${activeSystemSpec},
                    preparingSystemSpec = ${preparingSystemSpec}
                WHERE generationId = ${row.generationId}`,
          );
        }
      });
    },
    catch: ZerospinError.catch({
      code: 'stored-system-spec-migration-failed',
      message: 'Failed to add service actorControllers to stored SystemSpecs',
      preferCauseMessage: true,
    }),
  });

  storage.kv.put('isMigratedServiceActorControllersSystemSpec', 'true');
  storage.kv.put('isMigratedRepoExplorer', 'true');
});
