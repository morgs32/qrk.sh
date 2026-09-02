import { fileURLToPath } from 'node:url';

import type { IRepoType, ISystemSpec } from '@zerospin/core/system/types';
import { newSyncRpcSession } from '@zerospin/core/utils/newSyncRpcSession';
import {
  makeTelemetryCollector,
  makeTelemetryLayer,
  makeTraceableApiTarget,
} from '@zerospin/logger';
import { Effect } from 'effect';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';
import { createServer } from 'vite';

/*
 * 1. Create request-local telemetry for administrative API calls.
 * 2. Resolve the concrete SystemApi capability without exposing its secret.
 * 3. Route repository-list requests explicitly through a traced caller root.
 * 4. Route table-row requests explicitly through a traced caller root.
 * 5. Return only decoded repository data to the browser.
 * 6. Discard the caller telemetry batch after every handled response.
 */
export const startStudio = Effect.fn('startStudio')(function* (props: {
  port: number;
  open: boolean;
  systemSpec: ISystemSpec;
  zerospinApiUrl: string;
  zerospinSecretKey: string;
}) {
  const { open, port, systemSpec, zerospinApiUrl, zerospinSecretKey } = props;
  const host = '127.0.0.1';
  const root = fileURLToPath(new URL('../', import.meta.url));

  yield* Effect.promise(async () => {
    const server = await createServer({
      define: {
        'import.meta.env.ZEROSPIN_SYSTEM_SPEC': JSON.stringify(
          JSON.stringify(systemSpec),
        ),
      },
      root,
      plugins: [
        {
          name: 'zerospin-studio-repo-api',
          configureServer(viteServer) {
            viteServer.middlewares.use(async (request, response, next) => {
              const url = new URL(request.url ?? '/', 'http://studio.local');
              if (
                request.method !== 'GET' ||
                !url.pathname.startsWith('/api/repos/')
              ) {
                next();
                return;
              }

              const segments = url.pathname
                .split('/')
                .filter(segment => segment.length > 0)
                .map(segment => decodeURIComponent(segment));
              const repoType = segments[2] as IRepoType | undefined;

              // 1 — isolate every administrative request in its own disposable telemetry batch
              const collector = makeTelemetryCollector();

              try {
                // 2 — keep the concrete capability and secret-key exchange inside this request
                using gatewayApi =
                  newSyncRpcSession<GatewayApi>(zerospinApiUrl);
                const systemApi = makeTraceableApiTarget(
                  gatewayApi.getSystemApi({
                    zerospinSecretKey,
                  }),
                );
                let data: unknown;

                if (segments.length === 3) {
                  // 3 — preserve explicit repository-list routing under one caller root
                  switch (repoType) {
                    case 'SystemRepo':
                      data = await Effect.runPromise(
                        systemApi.getSystemRepos().pipe(
                          Effect.withSpan('Studio.getSystemRepos', {
                            root: true,
                          }),
                          Effect.provide(makeTelemetryLayer(collector)),
                        ),
                      );
                      break;
                    case 'MaterializedAggregateRepo':
                      data = await Effect.runPromise(
                        systemApi
                          .getMaterializedAggregateRepos()
                          .pipe(
                            Effect.withSpan(
                              'Studio.getMaterializedAggregateRepos',
                              { root: true },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'MaterializedAggregateFrontendRepo':
                      data = await Effect.runPromise(
                        systemApi
                          .getMaterializedAggregateFrontendRepos()
                          .pipe(
                            Effect.withSpan(
                              'Studio.getMaterializedAggregateFrontendRepos',
                              { root: true },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'MaterializedServiceFrontendRepo':
                      data = await Effect.runPromise(
                        systemApi
                          .getMaterializedServiceFrontendRepos()
                          .pipe(
                            Effect.withSpan(
                              'Studio.getMaterializedServiceFrontendRepos',
                              { root: true },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'MaterializedServiceRepo':
                      data = await Effect.runPromise(
                        systemApi
                          .getMaterializedServiceRepos()
                          .pipe(
                            Effect.withSpan(
                              'Studio.getMaterializedServiceRepos',
                              { root: true },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'AggregateCommandChain':
                      data = await Effect.runPromise(
                        systemApi.getAggregateCommandChains().pipe(
                          Effect.withSpan('Studio.getAggregateCommandChains', {
                            root: true,
                          }),
                          Effect.provide(makeTelemetryLayer(collector)),
                        ),
                      );
                      break;
                    case 'AggregateFrontendPushedCommandChain':
                      data = await Effect.runPromise(
                        systemApi
                          .getAggregateFrontendPushedCommandChains()
                          .pipe(
                            Effect.withSpan(
                              'Studio.getAggregateFrontendPushedCommandChains',
                              { root: true },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'AggregateFrontendFinalizedCommandChain':
                      data = await Effect.runPromise(
                        systemApi
                          .getAggregateFrontendFinalizedCommandChains()
                          .pipe(
                            Effect.withSpan(
                              'Studio.getAggregateFrontendFinalizedCommandChains',
                              {
                                root: true,
                              },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'ServiceFrontendFinalizedCommandChain':
                      data = await Effect.runPromise(
                        systemApi
                          .getServiceFrontendFinalizedCommandChains()
                          .pipe(
                            Effect.withSpan(
                              'Studio.getServiceFrontendFinalizedCommandChains',
                              { root: true },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'ServiceCommandChain':
                      data = await Effect.runPromise(
                        systemApi.getServiceCommandChains().pipe(
                          Effect.withSpan('Studio.getServiceCommandChains', {
                            root: true,
                          }),
                          Effect.provide(makeTelemetryLayer(collector)),
                        ),
                      );
                      break;
                    case 'SystemLogRepo':
                      data = await Effect.runPromise(
                        systemApi.getSystemLogRepos().pipe(
                          Effect.withSpan('Studio.getSystemLogRepos', {
                            root: true,
                          }),
                          Effect.provide(makeTelemetryLayer(collector)),
                        ),
                      );
                      break;
                    default:
                      response.statusCode = 404;
                      response.end(
                        JSON.stringify({ error: 'Repo type not found' }),
                      );
                      return;
                  }
                } else if (segments.length === 5) {
                  const repoName = segments[3]!;
                  const tableName = segments[4]!;

                  // 4 — preserve explicit table-row routing under one caller root
                  switch (repoType) {
                    case 'SystemRepo':
                      data = await Effect.runPromise(
                        systemApi
                          .getSystemRepoTableRows({
                            repoName,
                            tableName,
                          })
                          .pipe(
                            Effect.withSpan('Studio.getSystemRepoTableRows', {
                              root: true,
                            }),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'MaterializedAggregateRepo':
                      data = await Effect.runPromise(
                        systemApi
                          .getMaterializedAggregateRepoTableRows({
                            repoName,
                            tableName,
                          })
                          .pipe(
                            Effect.withSpan(
                              'Studio.getMaterializedAggregateRepoTableRows',
                              { root: true },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'MaterializedAggregateFrontendRepo':
                      data = await Effect.runPromise(
                        systemApi
                          .getMaterializedAggregateFrontendRepoTableRows({
                            repoName,
                            tableName,
                          })
                          .pipe(
                            Effect.withSpan(
                              'Studio.getMaterializedAggregateFrontendRepoTableRows',
                              {
                                root: true,
                              },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'MaterializedServiceFrontendRepo':
                      data = await Effect.runPromise(
                        systemApi
                          .getMaterializedServiceFrontendRepoTableRows({
                            repoName,
                            tableName,
                          })
                          .pipe(
                            Effect.withSpan(
                              'Studio.getMaterializedServiceFrontendRepoTableRows',
                              { root: true },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'MaterializedServiceRepo':
                      data = await Effect.runPromise(
                        systemApi
                          .getMaterializedServiceRepoTableRows({
                            repoName,
                            tableName,
                          })
                          .pipe(
                            Effect.withSpan(
                              'Studio.getMaterializedServiceRepoTableRows',
                              { root: true },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'AggregateCommandChain':
                      data = await Effect.runPromise(
                        systemApi
                          .getAggregateCommandChainTableRows({
                            repoName,
                            tableName,
                          })
                          .pipe(
                            Effect.withSpan(
                              'Studio.getAggregateCommandChainTableRows',
                              { root: true },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'AggregateFrontendPushedCommandChain':
                      data = await Effect.runPromise(
                        systemApi
                          .getAggregateFrontendPushedCommandChainTableRows({
                            repoName,
                            tableName,
                          })
                          .pipe(
                            Effect.withSpan(
                              'Studio.getAggregateFrontendPushedCommandChainTableRows',
                              { root: true },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'AggregateFrontendFinalizedCommandChain':
                      data = await Effect.runPromise(
                        systemApi
                          .getAggregateFrontendFinalizedCommandChainTableRows({
                            repoName,
                            tableName,
                          })
                          .pipe(
                            Effect.withSpan(
                              'Studio.getAggregateFrontendFinalizedCommandChainTableRows',
                              { root: true },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'ServiceFrontendFinalizedCommandChain':
                      data = await Effect.runPromise(
                        systemApi
                          .getServiceFrontendFinalizedCommandChainTableRows({
                            repoName,
                            tableName,
                          })
                          .pipe(
                            Effect.withSpan(
                              'Studio.getServiceFrontendFinalizedCommandChainTableRows',
                              { root: true },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'ServiceCommandChain':
                      data = await Effect.runPromise(
                        systemApi
                          .getServiceCommandChainTableRows({
                            repoName,
                            tableName,
                          })
                          .pipe(
                            Effect.withSpan(
                              'Studio.getServiceCommandChainTableRows',
                              { root: true },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'SystemLogRepo':
                      data = await Effect.runPromise(
                        systemApi
                          .getSystemLogRepoTableRows({
                            repoName,
                            tableName,
                          })
                          .pipe(
                            Effect.withSpan(
                              'Studio.getSystemLogRepoTableRows',
                              { root: true },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    default:
                      response.statusCode = 404;
                      response.end(
                        JSON.stringify({ error: 'Repo type not found' }),
                      );
                      return;
                  }
                } else {
                  response.statusCode = 404;
                  response.end(
                    JSON.stringify({ error: 'Studio API route not found' }),
                  );
                  return;
                }

                // 5 — return only decoded repo data; credentials and links stay server-side
                response.setHeader('Content-Type', 'application/json');
                response.end(JSON.stringify(data));
              } catch (error) {
                response.statusCode = 500;
                response.setHeader('Content-Type', 'application/json');
                response.end(
                  JSON.stringify({
                    error:
                      error instanceof Error
                        ? error.message
                        : 'Failed to call SystemApi',
                  }),
                );
              } finally {
                // 6 — discard the completed caller batch; Studio owns no telemetry store
                collector.flush();
              }
            });
          },
        },
      ],
      server: {
        host,
        open,
        port,
        strictPort: true,
      },
    });

    try {
      await server.listen();
    } catch (error) {
      await server.close();
      throw error;
    }
  });

  return `http://${host}:${port}`;
});
