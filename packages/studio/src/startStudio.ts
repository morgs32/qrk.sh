import { fileURLToPath } from 'node:url';

import type { IRepoType } from '@zerospin/core/system/types';
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
  zerospinApiUrl: string;
  zerospinSecretKey: string;
}) {
  const { open, port, zerospinApiUrl, zerospinSecretKey } = props;
  const host = '127.0.0.1';
  const root = fileURLToPath(new URL('../', import.meta.url));

  yield* Effect.promise(async () => {
    const server = await createServer({
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

                // 3 — preserve explicit repository-list routing under one caller root
                if (segments.length === 3) {
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
                    case 'AggregateRepo':
                      data = await Effect.runPromise(
                        systemApi.getAggregateRepos().pipe(
                          Effect.withSpan('Studio.getAggregateRepos', {
                            root: true,
                          }),
                          Effect.provide(makeTelemetryLayer(collector)),
                        ),
                      );
                      break;
                    case 'AggregateFrontendRepo':
                      data = await Effect.runPromise(
                        systemApi.getAggregateFrontendRepos().pipe(
                          Effect.withSpan('Studio.getAggregateFrontendRepos', {
                            root: true,
                          }),
                          Effect.provide(makeTelemetryLayer(collector)),
                        ),
                      );
                      break;
                    case 'ServiceFrontendRepo':
                      data = await Effect.runPromise(
                        systemApi.getServiceFrontendRepos().pipe(
                          Effect.withSpan('Studio.getServiceFrontendRepos', {
                            root: true,
                          }),
                          Effect.provide(makeTelemetryLayer(collector)),
                        ),
                      );
                      break;
                    case 'ServiceRepo':
                      data = await Effect.runPromise(
                        systemApi.getServiceRepos().pipe(
                          Effect.withSpan('Studio.getServiceRepos', {
                            root: true,
                          }),
                          Effect.provide(makeTelemetryLayer(collector)),
                        ),
                      );
                      break;
                    case 'AggregateBlockRepo':
                      data = await Effect.runPromise(
                        systemApi.getAggregateBlockRepos().pipe(
                          Effect.withSpan('Studio.getAggregateBlockRepos', {
                            root: true,
                          }),
                          Effect.provide(makeTelemetryLayer(collector)),
                        ),
                      );
                      break;
                    case 'AggregateFrontendBlockRepo':
                      data = await Effect.runPromise(
                        systemApi.getAggregateFrontendBlockRepos().pipe(
                          Effect.withSpan(
                            'Studio.getAggregateFrontendBlockRepos',
                            {
                              root: true,
                            },
                          ),
                          Effect.provide(makeTelemetryLayer(collector)),
                        ),
                      );
                      break;
                    case 'ServiceFrontendBlockRepo':
                      data = await Effect.runPromise(
                        systemApi
                          .getServiceFrontendBlockRepos()
                          .pipe(
                            Effect.withSpan(
                              'Studio.getServiceFrontendBlockRepos',
                              { root: true },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'ServiceBlockRepo':
                      data = await Effect.runPromise(
                        systemApi.getServiceBlockRepos().pipe(
                          Effect.withSpan('Studio.getServiceBlockRepos', {
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
                    case 'AggregateRepo':
                      data = await Effect.runPromise(
                        systemApi
                          .getAggregateRepoTableRows({
                            repoName,
                            tableName,
                          })
                          .pipe(
                            Effect.withSpan(
                              'Studio.getAggregateRepoTableRows',
                              { root: true },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'AggregateFrontendRepo':
                      data = await Effect.runPromise(
                        systemApi
                          .getAggregateFrontendRepoTableRows({
                            repoName,
                            tableName,
                          })
                          .pipe(
                            Effect.withSpan(
                              'Studio.getAggregateFrontendRepoTableRows',
                              {
                                root: true,
                              },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'ServiceFrontendRepo':
                      data = await Effect.runPromise(
                        systemApi
                          .getServiceFrontendRepoTableRows({
                            repoName,
                            tableName,
                          })
                          .pipe(
                            Effect.withSpan(
                              'Studio.getServiceFrontendRepoTableRows',
                              { root: true },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'ServiceRepo':
                      data = await Effect.runPromise(
                        systemApi
                          .getServiceRepoTableRows({
                            repoName,
                            tableName,
                          })
                          .pipe(
                            Effect.withSpan('Studio.getServiceRepoTableRows', {
                              root: true,
                            }),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'AggregateBlockRepo':
                      data = await Effect.runPromise(
                        systemApi
                          .getAggregateBlockRepoTableRows({
                            repoName,
                            tableName,
                          })
                          .pipe(
                            Effect.withSpan(
                              'Studio.getAggregateBlockRepoTableRows',
                              { root: true },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'AggregateFrontendBlockRepo':
                      data = await Effect.runPromise(
                        systemApi
                          .getAggregateFrontendBlockRepoTableRows({
                            repoName,
                            tableName,
                          })
                          .pipe(
                            Effect.withSpan(
                              'Studio.getAggregateFrontendBlockRepoTableRows',
                              { root: true },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'ServiceFrontendBlockRepo':
                      data = await Effect.runPromise(
                        systemApi
                          .getServiceFrontendBlockRepoTableRows({
                            repoName,
                            tableName,
                          })
                          .pipe(
                            Effect.withSpan(
                              'Studio.getServiceFrontendBlockRepoTableRows',
                              { root: true },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'ServiceBlockRepo':
                      data = await Effect.runPromise(
                        systemApi
                          .getServiceBlockRepoTableRows({
                            repoName,
                            tableName,
                          })
                          .pipe(
                            Effect.withSpan(
                              'Studio.getServiceBlockRepoTableRows',
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
