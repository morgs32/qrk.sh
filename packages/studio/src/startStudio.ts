import { fileURLToPath } from 'node:url';

import type { IRepoType, ISystemSpec } from '@zerospin/core/system/types';
import { getApi } from '@zerospin/core/utils/getApi/getApi';
import { makeTelemetryCollector, makeTelemetryLayer } from '@zerospin/logger';
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
                const systemApi = await Effect.runPromise(
                  getApi<GatewayApi>(zerospinApiUrl)(gatewayApi =>
                    gatewayApi.getSystemApi({ zerospinSecretKey }),
                  ),
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
                    case 'AggregateVersionRepo':
                      data = await Effect.runPromise(
                        systemApi.getAggregateVersionRepos().pipe(
                          Effect.withSpan('Studio.getAggregateVersionRepos', {
                            root: true,
                          }),
                          Effect.provide(makeTelemetryLayer(collector)),
                        ),
                      );
                      break;
                    case 'AggregateActorVersionRepo':
                      data = await Effect.runPromise(
                        systemApi
                          .getAggregateActorVersionRepos()
                          .pipe(
                            Effect.withSpan(
                              'Studio.getAggregateActorVersionRepos',
                              { root: true },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'ServiceActorVersionRepo':
                      data = await Effect.runPromise(
                        systemApi
                          .getServiceActorVersionRepos()
                          .pipe(
                            Effect.withSpan(
                              'Studio.getServiceActorVersionRepos',
                              { root: true },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'ServiceVersionRepo':
                      data = await Effect.runPromise(
                        systemApi.getServiceVersionRepos().pipe(
                          Effect.withSpan('Studio.getServiceVersionRepos', {
                            root: true,
                          }),
                          Effect.provide(makeTelemetryLayer(collector)),
                        ),
                      );
                      break;
                    case 'AggregateChain':
                      data = await Effect.runPromise(
                        systemApi.getAggregateChains().pipe(
                          Effect.withSpan('Studio.getAggregateChains', {
                            root: true,
                          }),
                          Effect.provide(makeTelemetryLayer(collector)),
                        ),
                      );
                      break;
                    case 'AggregateVersionChain':
                      data = await Effect.runPromise(
                        systemApi
                          .getAggregateVersionChains()
                          .pipe(
                            Effect.withSpan(
                              'Studio.getAggregateVersionChains',
                              { root: true },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'ServiceVersionChain':
                      data = await Effect.runPromise(
                        systemApi.getServiceVersionChains().pipe(
                          Effect.withSpan('Studio.getServiceVersionChains', {
                            root: true,
                          }),
                          Effect.provide(makeTelemetryLayer(collector)),
                        ),
                      );
                      break;
                    case 'AggregateActorVersionChain':
                      data = await Effect.runPromise(
                        systemApi.getAggregateActorVersionChains().pipe(
                          Effect.withSpan(
                            'Studio.getAggregateActorVersionChains',
                            {
                              root: true,
                            },
                          ),
                          Effect.provide(makeTelemetryLayer(collector)),
                        ),
                      );
                      break;
                    case 'ServiceActorVersionChain':
                      data = await Effect.runPromise(
                        systemApi.getServiceActorVersionChains().pipe(
                          Effect.withSpan(
                            'Studio.getServiceActorVersionChains',
                            {
                              root: true,
                            },
                          ),
                          Effect.provide(makeTelemetryLayer(collector)),
                        ),
                      );
                      break;
                    case 'ServiceChain':
                      data = await Effect.runPromise(
                        systemApi.getServiceChains().pipe(
                          Effect.withSpan('Studio.getServiceChains', {
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
                    case 'AggregateVersionRepo':
                      data = await Effect.runPromise(
                        systemApi
                          .getAggregateVersionRepoTableRows({
                            repoName,
                            tableName,
                          })
                          .pipe(
                            Effect.withSpan(
                              'Studio.getAggregateVersionRepoTableRows',
                              { root: true },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'AggregateActorVersionRepo':
                      data = await Effect.runPromise(
                        systemApi
                          .getAggregateActorVersionRepoTableRows({
                            repoName,
                            tableName,
                          })
                          .pipe(
                            Effect.withSpan(
                              'Studio.getAggregateActorVersionRepoTableRows',
                              {
                                root: true,
                              },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'ServiceActorVersionRepo':
                      data = await Effect.runPromise(
                        systemApi
                          .getServiceActorVersionRepoTableRows({
                            repoName,
                            tableName,
                          })
                          .pipe(
                            Effect.withSpan(
                              'Studio.getServiceActorVersionRepoTableRows',
                              { root: true },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'ServiceVersionRepo':
                      data = await Effect.runPromise(
                        systemApi
                          .getServiceVersionRepoTableRows({
                            repoName,
                            tableName,
                          })
                          .pipe(
                            Effect.withSpan(
                              'Studio.getServiceVersionRepoTableRows',
                              { root: true },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'AggregateChain':
                      data = await Effect.runPromise(
                        systemApi
                          .getAggregateChainTableRows({
                            repoName,
                            tableName,
                          })
                          .pipe(
                            Effect.withSpan(
                              'Studio.getAggregateChainTableRows',
                              { root: true },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'AggregateVersionChain':
                      data = await Effect.runPromise(
                        systemApi
                          .getAggregateVersionChainTableRows({
                            repoName,
                            tableName,
                          })
                          .pipe(
                            Effect.withSpan(
                              'Studio.getAggregateVersionChainTableRows',
                              { root: true },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'ServiceVersionChain':
                      data = await Effect.runPromise(
                        systemApi
                          .getServiceVersionChainTableRows({
                            repoName,
                            tableName,
                          })
                          .pipe(
                            Effect.withSpan(
                              'Studio.getServiceVersionChainTableRows',
                              { root: true },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'AggregateActorVersionChain':
                      data = await Effect.runPromise(
                        systemApi
                          .getAggregateActorVersionChainTableRows({
                            repoName,
                            tableName,
                          })
                          .pipe(
                            Effect.withSpan(
                              'Studio.getAggregateActorVersionChainTableRows',
                              { root: true },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'ServiceActorVersionChain':
                      data = await Effect.runPromise(
                        systemApi
                          .getServiceActorVersionChainTableRows({
                            repoName,
                            tableName,
                          })
                          .pipe(
                            Effect.withSpan(
                              'Studio.getServiceActorVersionChainTableRows',
                              { root: true },
                            ),
                            Effect.provide(makeTelemetryLayer(collector)),
                          ),
                      );
                      break;
                    case 'ServiceChain':
                      data = await Effect.runPromise(
                        systemApi
                          .getServiceChainTableRows({
                            repoName,
                            tableName,
                          })
                          .pipe(
                            Effect.withSpan('Studio.getServiceChainTableRows', {
                              root: true,
                            }),
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
