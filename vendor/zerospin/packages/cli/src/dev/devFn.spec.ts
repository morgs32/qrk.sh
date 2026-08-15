import path from 'node:path';

import {
  Command,
  CommandExecutor,
  FileSystem,
  Path,
  Terminal,
} from '@effect/platform';
import * as NodePath from '@effect/platform-node/NodePath';
import { it } from '@effect/vitest';
import type { Async } from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import {
  Deferred,
  Effect,
  Fiber,
  Inspectable,
  Layer,
  Queue,
  Sink,
  Stream,
  TestClock,
} from 'effect';
import { beforeEach, describe, expect, vi } from 'vitest';

import { devFn } from './devFn.js';

const {
  disposeGatewayMock,
  getDeployMock,
  getDevDeployApiMock,
  loadEnvMock,
  loadWranglerConfigMock,
  loadZerospinConfigMock,
  newSyncRpcSessionMock,
  startDeployMock,
  resolveMock,
} = vi.hoisted(() => ({
  disposeGatewayMock: vi.fn(),
  getDeployMock: vi.fn(),
  getDevDeployApiMock: vi.fn(),
  loadEnvMock: vi.fn(),
  loadWranglerConfigMock: vi.fn(),
  loadZerospinConfigMock: vi.fn(),
  newSyncRpcSessionMock: vi.fn(),
  startDeployMock: vi.fn(),
  resolveMock: vi.fn(),
}));

vi.mock('@zerospin/core/utils/newSyncRpcSession', () => ({
  newSyncRpcSession: newSyncRpcSessionMock,
}));

vi.mock('node:module', () => ({
  createRequire: () => ({
    resolve: resolveMock,
  }),
}));

vi.mock('dotenv', () => ({
  config: loadEnvMock,
}));

vi.mock('c12', () => ({
  loadConfig: loadWranglerConfigMock,
}));

vi.mock('../deploy/loadZerospinConfigFn.js', () => ({
  loadZerospinConfigFn: loadZerospinConfigMock,
}));

const fileSystemRemoveMock = vi.fn();
const fileSystemWriteMock = vi.fn();
const killMock = vi.fn();
const terminalDisplayMock = vi.fn();

let commandStarted: Deferred.Deferred<Command.Command>;
let exitCode: Deferred.Deferred<CommandExecutor.ExitCode>;
let stdout: Queue.Queue<string>;
let wranglerProcess: CommandExecutor.Process;

const commandExecutor = CommandExecutor.makeExecutor(command =>
  Effect.gen(function* () {
    yield* Deferred.succeed(commandStarted, command);
    return yield* Effect.acquireRelease(
      Effect.succeed(wranglerProcess),
      process =>
        process.isRunning.pipe(
          Effect.flatMap(running =>
            running ? process.kill('SIGTERM') : Effect.void,
          ),
          Effect.ignore,
        ),
    );
  }),
);

const testLayer: Layer.Layer<
  | Async
  | CommandExecutor.CommandExecutor
  | FileSystem.FileSystem
  | Path.Path
  | Terminal.Terminal
> = Layer.mergeAll(
  AsyncLive,
  NodePath.layer,
  FileSystem.layerNoop({
    remove: (filePath, options) =>
      Effect.sync(() => fileSystemRemoveMock(filePath, options)),
    writeFileString: (filePath, data, options) =>
      Effect.sync(() => fileSystemWriteMock(filePath, data, options)),
  }),
  Layer.succeed(Terminal.Terminal, {
    columns: Effect.succeed(80),
    display: text => Effect.sync(() => terminalDisplayMock(text)),
    isTTY: Effect.succeed(false),
    readInput: Effect.die('Terminal.readInput is not used by devFn'),
    readLine: Effect.die('Terminal.readLine is not used by devFn'),
    rows: Effect.succeed(24),
  }),
  Layer.succeed(CommandExecutor.CommandExecutor, commandExecutor),
);

describe('devFn', () => {
  beforeEach(() => {
    commandStarted = Effect.runSync(Deferred.make<Command.Command>());
    exitCode = Effect.runSync(Deferred.make<CommandExecutor.ExitCode>());
    stdout = Effect.runSync(Queue.unbounded<string>());

    killMock.mockReset();
    terminalDisplayMock.mockReset();
    wranglerProcess = {
      [CommandExecutor.ProcessTypeId]: CommandExecutor.ProcessTypeId,
      [Inspectable.NodeInspectSymbol]() {
        return this.toJSON();
      },
      exitCode: Deferred.await(exitCode),
      isRunning: Deferred.isDone(exitCode).pipe(Effect.map(done => !done)),
      kill: signal =>
        Effect.sync(() => killMock(signal)).pipe(
          Effect.zipRight(
            Deferred.succeed(exitCode, CommandExecutor.ExitCode(143)),
          ),
          Effect.asVoid,
        ),
      pid: CommandExecutor.ProcessId(123),
      stderr: Stream.empty,
      stdin: Sink.drain,
      stdout: Stream.fromQueue(stdout).pipe(Stream.encodeText),
      toJSON() {
        return { pid: this.pid };
      },
      toString() {
        return 'FakeWranglerProcess';
      },
    };

    disposeGatewayMock.mockReset();
    getDeployMock.mockReset();
    getDevDeployApiMock.mockReset();
    getDevDeployApiMock.mockReturnValue({
      getDeploy: getDeployMock,
      startDeploy: startDeployMock,
    });
    newSyncRpcSessionMock.mockReset();
    newSyncRpcSessionMock.mockReturnValue({
      getDevDeployApi: getDevDeployApiMock,
      [Symbol.dispose]: disposeGatewayMock,
    });
    startDeployMock.mockReset();
    startDeployMock.mockResolvedValue({
      _tag: 'Right',
      right: {
        activationCheckpoint: 'generation-prepared',
        clean: false,
        deployId: 'deploy-1',
        failure: null,
        generationId: 'generation-1',
        status: 'succeeded',
        workerVersionId: 'version-1',
      },
    });
    fileSystemRemoveMock.mockReset();
    fileSystemWriteMock.mockReset();
    loadEnvMock.mockReset();
    loadWranglerConfigMock.mockReset();
    loadWranglerConfigMock.mockResolvedValue({
      config: {
        alias: { authored: './src/authored.ts' },
        compatibility_date: '2026-01-20',
        name: 'authored-dev-worker',
        preserved_null: null,
        vars: {
          AUTHORED_VAR: 'preserved',
          ZEROSPIN_ENVIRONMENT: 'production',
        },
      },
    });
    loadZerospinConfigMock.mockReset();
    loadZerospinConfigMock.mockReturnValue(
      Effect.succeed({
        entry: 'src/system.ts',
        environmentId: 'dev',
        env: null,
        seeds: {
          dev: 'src/seeds.ts',
          production: null,
        },
      }),
    );
    resolveMock.mockReset();
    resolveMock.mockImplementation((specifier: string) => {
      if (specifier === 'wrangler/package.json') {
        return '/project/node_modules/wrangler/package.json';
      }
      if (specifier === '@zerospin/dev-worker/DevWorker') {
        return '/project/node_modules/@zerospin/dev-worker/dist/DevWorker.js';
      }
      return specifier;
    });
    delete process.env['ZEROSPIN_PORT'];
  });

  it.layer(testLayer)(it => {
    it.effect('loads project dotenv files before zerospin.config', () =>
      Effect.gen(function* () {
        loadEnvMock.mockImplementation(({ path: envPath }) => {
          if (envPath.endsWith('.env.local')) {
            process.env['ZEROSPIN_DEV_CONFIG_TEST'] = 'local';
          }
          return {};
        });
        loadZerospinConfigMock.mockImplementation(() => {
          expect(process.env['ZEROSPIN_DEV_CONFIG_TEST']).toBe('local');
          return Effect.succeed({
            entry: 'src/system.ts',
            environmentId: 'dev',
            env: null,
            seeds: { dev: 'src/seeds.ts', production: null },
          });
        });

        const fiber = yield* devFn({
          clean: false,
          port: 3005,
          systemId: 'sys_test',
        }).pipe(Effect.fork);
        yield* Deferred.await(commandStarted);
        yield* Deferred.succeed(exitCode, CommandExecutor.ExitCode(0));
        yield* Fiber.join(fiber);

        expect(loadEnvMock.mock.calls).toEqual([
          [{ path: path.join(process.cwd(), '.env.local') }],
          [{ path: path.join(process.cwd(), '.env') }],
        ]);
        delete process.env['ZEROSPIN_DEV_CONFIG_TEST'];
      }),
    );

    it.effect(
      'starts Wrangler from a derived config with forced dev environment variables',
      () =>
        Effect.gen(function* () {
          const fiber = yield* devFn({
            clean: false,
            port: 3005,
            systemId: 'sys_test',
          }).pipe(Effect.fork);
          const command = yield* Deferred.await(commandStarted);
          const standardCommand = Command.flatten(command)[0];

          expect(standardCommand.command).toBe(process.execPath);
          expect(standardCommand.args).toEqual([
            '/project/node_modules/wrangler/bin/wrangler.js',
            'dev',
            '/project/node_modules/@zerospin/dev-worker/dist/DevWorker.js',
            '-c',
            `./wrangler.zerospin-dev.${process.pid}.local.json`,
            '--ip',
            '127.0.0.1',
            '--port',
            '3005',
            '--persist-to',
            path.join(
              process.cwd(),
              '.wrangler',
              'zerospin',
              'dev-worker',
              'sys_test',
            ),
          ]);

          expect(standardCommand.args).not.toContain('--alias');
          expect(fileSystemWriteMock).toHaveBeenCalledWith(
            path.join(
              process.cwd(),
              `wrangler.zerospin-dev.${process.pid}.local.json`,
            ),
            `${JSON.stringify(
              {
                alias: {
                  authored: './src/authored.ts',
                  system: path.join(process.cwd(), 'src/system.ts'),
                  seeds: path.join(process.cwd(), 'src/seeds.ts'),
                },
                compatibility_date: '2026-01-20',
                name: 'authored-dev-worker',
                preserved_null: null,
                vars: {
                  AUTHORED_VAR: 'preserved',
                  ZEROSPIN_ENVIRONMENT: 'dev',
                },
              },
              null,
              2,
            )}\n`,
            { mode: 0o600 },
          );

          yield* Deferred.succeed(exitCode, CommandExecutor.ExitCode(0));
          expect(yield* Fiber.join(fiber)).toEqual({ port: 3005 });
          expect(fileSystemRemoveMock).toHaveBeenCalledWith(
            path.join(
              process.cwd(),
              `wrangler.zerospin-dev.${process.pid}.local.json`,
            ),
            { force: true },
          );
        }),
    );

    it.effect('rejects non-object authored Wrangler vars', () =>
      Effect.gen(function* () {
        loadWranglerConfigMock.mockResolvedValueOnce({
          config: { vars: 'invalid' },
        });

        const error = yield* devFn({
          clean: false,
          port: 3005,
          systemId: 'sys_test',
        }).pipe(Effect.flip);

        expect(error).toMatchObject({
          code: 'zerospin-dev-wrangler-config-invalid',
        });
      }),
    );

    it.effect(
      'aliases seeds to the built-in empty module when configured',
      () =>
        Effect.gen(function* () {
          loadZerospinConfigMock.mockReturnValue(
            Effect.succeed({
              entry: 'src/system.ts',
              environmentId: 'dev',
              env: null,
              seeds: { dev: null, production: null },
            }),
          );

          const fiber = yield* devFn({
            clean: false,
            port: 3005,
            systemId: 'sys_test',
          }).pipe(Effect.fork);
          yield* Deferred.await(commandStarted);

          const generatedConfig = JSON.parse(
            String(fileSystemWriteMock.mock.calls[0]?.[1]),
          );
          expect(generatedConfig.alias.seeds).toBe(
            '/project/node_modules/@zerospin/dev-worker/dist/emptySeeds.js',
          );

          yield* Deferred.succeed(exitCode, CommandExecutor.ExitCode(0));
          yield* Fiber.join(fiber);
        }),
    );

    it.effect(
      'does not put clean request identity in the Wrangler command',
      () =>
        Effect.gen(function* () {
          const fiber = yield* devFn({
            clean: true,
            port: 3005,
            systemId: 'sys_test',
          }).pipe(Effect.fork);
          const command = yield* Deferred.await(commandStarted);

          expect(Command.flatten(command)[0].args).not.toContain('--var');
          expect(Command.flatten(command)[0].args.join(' ')).not.toContain(
            'ZEROSPIN_CLEAN_REQUEST_ID',
          );
          yield* Deferred.succeed(exitCode, CommandExecutor.ExitCode(0));
          yield* Fiber.join(fiber);
        }),
    );

    it.effect('uses the validated ZEROSPIN_PORT when --port is omitted', () =>
      Effect.gen(function* () {
        process.env['ZEROSPIN_PORT'] = '4001';
        const fiber = yield* devFn({
          clean: false,
          port: undefined,
          systemId: 'sys_test',
        }).pipe(Effect.fork);
        const command = yield* Deferred.await(commandStarted);

        expect(Command.flatten(command)[0].args).toContain('4001');
        yield* Deferred.succeed(exitCode, CommandExecutor.ExitCode(0));
        expect(yield* Fiber.join(fiber)).toEqual({ port: 4001 });
      }),
    );

    it.effect('rejects an invalid ZEROSPIN_PORT', () =>
      Effect.gen(function* () {
        process.env['ZEROSPIN_PORT'] = '70000';
        const error = yield* devFn({
          clean: false,
          port: undefined,
          systemId: 'sys_test',
        }).pipe(Effect.flip);

        expect(error).toMatchObject({ code: 'zerospin-dev-invalid-port' });
      }),
    );

    it.effect(
      'starts and polls complete deploy snapshots through fresh Gateway sessions',
      () =>
        Effect.gen(function* () {
          startDeployMock.mockResolvedValueOnce({
            _tag: 'Right',
            right: {
              activationCheckpoint: 'allocated',
              clean: false,
              deployId: 'deploy-1',
              failure: null,
              generationId: 'generation-1',
              status: 'activating',
              workerVersionId: 'version-1',
            },
          });
          getDeployMock.mockResolvedValueOnce({
            _tag: 'Right',
            right: {
              activationCheckpoint: 'generation-prepared',
              clean: false,
              deployId: 'deploy-1',
              failure: null,
              generationId: 'generation-1',
              status: 'succeeded',
              workerVersionId: 'version-1',
            },
          });

          const fiber = yield* devFn({
            clean: false,
            port: 3005,
            systemId: 'sys_test',
          }).pipe(Effect.fork);
          yield* Deferred.await(commandStarted);
          yield* Queue.offer(stdout, 'Wrangler output\nReady on http://127.0.');
          yield* Queue.offer(stdout, '0.1:3005\n');
          yield* Effect.promise(() =>
            vi.waitFor(() => expect(startDeployMock).toHaveBeenCalledOnce()),
          );
          yield* TestClock.adjust(250);
          yield* Effect.promise(() =>
            vi.waitFor(() => expect(getDeployMock).toHaveBeenCalledOnce()),
          );

          expect(newSyncRpcSessionMock).toHaveBeenNthCalledWith(
            1,
            'http://127.0.0.1:3005',
          );
          expect(newSyncRpcSessionMock).toHaveBeenNthCalledWith(
            2,
            'http://127.0.0.1:3005',
          );
          expect(getDevDeployApiMock).toHaveBeenCalledTimes(2);
          expect(startDeployMock).toHaveBeenCalledWith({ clean: false });
          expect(getDeployMock).toHaveBeenCalledWith({ deployId: 'deploy-1' });
          expect(disposeGatewayMock).toHaveBeenCalledTimes(2);
          expect(terminalDisplayMock.mock.calls).toEqual([
            ['Wrangler output\nReady on http://127.0.'],
            ['0.1:3005\n'],
          ]);

          yield* Deferred.succeed(exitCode, CommandExecutor.ExitCode(0));
          yield* Fiber.join(fiber);
        }),
    );

    it.effect(
      'ignores reload completion before readiness and matches it across chunks later',
      () =>
        Effect.gen(function* () {
          startDeployMock
            .mockResolvedValueOnce({
              _tag: 'Right',
              right: {
                activationCheckpoint: 'generation-prepared',
                clean: false,
                deployId: 'deploy-1',
                failure: null,
                generationId: 'generation-1',
                status: 'succeeded',
                workerVersionId: 'version-1',
              },
            })
            .mockResolvedValueOnce({
              _tag: 'Right',
              right: {
                activationCheckpoint: 'generation-prepared',
                clean: false,
                deployId: 'deploy-2',
                failure: null,
                generationId: 'generation-1',
                status: 'succeeded',
                workerVersionId: 'version-2',
              },
            });

          const fiber = yield* devFn({
            clean: false,
            port: 3005,
            systemId: 'sys_test',
          }).pipe(Effect.fork);
          yield* Deferred.await(commandStarted);
          yield* Queue.offer(stdout, '⎔ Local server up');
          yield* Queue.offer(stdout, 'dated and ready\n');
          yield* Queue.offer(stdout, 'Ready on http://127.0.0.1:3005\n');
          yield* Effect.promise(() =>
            vi.waitFor(() => expect(startDeployMock).toHaveBeenCalledTimes(1)),
          );

          yield* Queue.offer(stdout, '⎔ Local server updated');
          yield* Queue.offer(stdout, ' and ready\n');
          yield* Effect.promise(() =>
            vi.waitFor(() => expect(startDeployMock).toHaveBeenCalledTimes(2)),
          );

          expect(startDeployMock).toHaveBeenNthCalledWith(2, { clean: false });
          expect(newSyncRpcSessionMock).toHaveBeenCalledTimes(2);
          yield* Deferred.succeed(exitCode, CommandExecutor.ExitCode(0));
          yield* Fiber.join(fiber);
        }),
    );

    it.effect('retries getDeploy with the same deploy id', () =>
      Effect.gen(function* () {
        startDeployMock.mockResolvedValueOnce({
          _tag: 'Right',
          right: {
            activationCheckpoint: 'allocated',
            clean: false,
            deployId: 'deploy-1',
            failure: null,
            generationId: 'generation-1',
            status: 'activating',
            workerVersionId: 'version-1',
          },
        });
        getDeployMock
          .mockResolvedValueOnce({
            _tag: 'Left',
            left: {
              cause: 'transient SystemRepo transport rejection',
              code: 'failed-to-get-deploy-rpc',
              extra: null,
              message: 'Failed to get deploy over SystemRepo RPC.',
              status: null,
            },
          })
          .mockResolvedValueOnce({
            _tag: 'Right',
            right: {
              activationCheckpoint: 'generation-prepared',
              clean: false,
              deployId: 'deploy-1',
              failure: null,
              generationId: 'generation-1',
              status: 'succeeded',
              workerVersionId: 'version-1',
            },
          });

        const fiber = yield* devFn({
          clean: false,
          port: 3005,
          systemId: 'sys_test',
        }).pipe(Effect.fork);
        yield* Deferred.await(commandStarted);
        yield* Queue.offer(stdout, 'Ready on http://127.0.0.1:3005\n');
        yield* Effect.promise(() =>
          vi.waitFor(() => expect(startDeployMock).toHaveBeenCalledOnce()),
        );
        yield* TestClock.adjust(250);
        yield* Effect.promise(() =>
          vi.waitFor(() => expect(getDeployMock).toHaveBeenCalledTimes(1)),
        );
        yield* TestClock.adjust(2_000);
        yield* Effect.promise(() =>
          vi.waitFor(() => expect(getDeployMock).toHaveBeenCalledTimes(2)),
        );

        expect(getDeployMock.mock.calls).toEqual([
          [{ deployId: 'deploy-1' }],
          [{ deployId: 'deploy-1' }],
        ]);
        expect(startDeployMock).toHaveBeenCalledTimes(1);
        expect(newSyncRpcSessionMock).toHaveBeenCalledTimes(3);
        yield* Deferred.succeed(exitCode, CommandExecutor.ExitCode(0));
        yield* Fiber.join(fiber);
      }),
    );

    it.effect(
      'coalesces reload completions into one new idempotent deploy start',
      () =>
        Effect.gen(function* () {
          let resolvePoll: ((value: unknown) => void) | undefined;
          startDeployMock
            .mockResolvedValueOnce({
              _tag: 'Right',
              right: {
                activationCheckpoint: 'allocated',
                clean: false,
                deployId: 'deploy-1',
                failure: null,
                generationId: 'generation-1',
                status: 'activating',
                workerVersionId: 'version-1',
              },
            })
            .mockResolvedValueOnce({
              _tag: 'Right',
              right: {
                activationCheckpoint: 'generation-prepared',
                clean: false,
                deployId: 'deploy-2',
                failure: null,
                generationId: 'generation-2',
                status: 'succeeded',
                workerVersionId: 'version-2',
              },
            });
          getDeployMock.mockImplementationOnce(
            () =>
              new Promise(resolve => {
                resolvePoll = resolve;
              }),
          );

          const fiber = yield* devFn({
            clean: false,
            port: 3005,
            systemId: 'sys_test',
          }).pipe(Effect.fork);
          yield* Deferred.await(commandStarted);
          yield* Queue.offer(stdout, 'Ready on http://127.0.0.1:3005\n');
          yield* Effect.promise(() =>
            vi.waitFor(() => expect(startDeployMock).toHaveBeenCalledTimes(1)),
          );
          yield* TestClock.adjust(250);
          yield* Effect.promise(() =>
            vi.waitFor(() => expect(getDeployMock).toHaveBeenCalledOnce()),
          );
          yield* Queue.offer(
            stdout,
            '⎔ Local server updated and ready\n⎔ Local server updated and ready\n⎔ Local server updated and ready\n',
          );
          yield* Effect.sync(() => {
            resolvePoll?.({
              _tag: 'Right',
              right: {
                activationCheckpoint: 'allocated',
                clean: false,
                deployId: 'deploy-1',
                failure: null,
                generationId: 'generation-1',
                status: 'activating',
                workerVersionId: 'version-1',
              },
            });
          });
          yield* Effect.promise(() =>
            vi.waitFor(() => expect(startDeployMock).toHaveBeenCalledTimes(2)),
          );

          expect(startDeployMock.mock.calls).toEqual([
            [{ clean: false }],
            [{ clean: false }],
          ]);
          expect(getDeployMock).toHaveBeenCalledOnce();
          expect(newSyncRpcSessionMock).toHaveBeenCalledTimes(3);
          yield* Deferred.succeed(exitCode, CommandExecutor.ExitCode(0));
          yield* Fiber.join(fiber);
        }),
    );

    it.effect(
      'keeps clean true through transport and boundary retries, then acknowledges it once',
      () =>
        Effect.gen(function* () {
          startDeployMock
            .mockRejectedValueOnce(new TypeError('connection reset'))
            .mockResolvedValueOnce({
              _tag: 'Left',
              left: {
                cause: 'transient SystemRepo transport rejection',
                code: 'failed-to-start-deploy-rpc',
                extra: null,
                message: 'Failed to start deploy over SystemRepo RPC.',
                status: null,
              },
            })
            .mockResolvedValueOnce({
              _tag: 'Right',
              right: {
                activationCheckpoint: 'allocated',
                clean: true,
                deployId: 'deploy-1',
                failure: null,
                generationId: 'generation-1',
                status: 'activating',
                workerVersionId: 'version-1',
              },
            })
            .mockResolvedValueOnce({
              _tag: 'Right',
              right: {
                activationCheckpoint: 'generation-prepared',
                clean: false,
                deployId: 'deploy-2',
                failure: null,
                generationId: 'generation-2',
                status: 'succeeded',
                workerVersionId: 'version-2',
              },
            });
          getDeployMock.mockResolvedValueOnce({
            _tag: 'Right',
            right: {
              activationCheckpoint: 'generation-prepared',
              clean: true,
              deployId: 'deploy-1',
              failure: null,
              generationId: 'generation-1',
              status: 'succeeded',
              workerVersionId: 'version-1',
            },
          });

          const fiber = yield* devFn({
            clean: true,
            port: 3005,
            systemId: 'sys_test',
          }).pipe(Effect.fork);
          yield* Deferred.await(commandStarted);
          yield* Queue.offer(stdout, 'Ready on http://127.0.0.1:3005\n');
          yield* Effect.promise(() =>
            vi.waitFor(() => expect(startDeployMock).toHaveBeenCalledTimes(1)),
          );
          yield* TestClock.adjust(2_000);
          yield* Effect.promise(() =>
            vi.waitFor(() => expect(startDeployMock).toHaveBeenCalledTimes(3)),
          );
          yield* TestClock.adjust(250);
          yield* Effect.promise(() =>
            vi.waitFor(() => expect(getDeployMock).toHaveBeenCalledOnce()),
          );

          yield* Queue.offer(stdout, '⎔ Local server updated and ready\n');
          yield* Effect.promise(() =>
            vi.waitFor(() => expect(startDeployMock).toHaveBeenCalledTimes(4)),
          );

          for (const callNumber of [1, 2, 3]) {
            expect(startDeployMock).toHaveBeenNthCalledWith(callNumber, {
              clean: true,
            });
          }
          expect(startDeployMock).toHaveBeenNthCalledWith(4, { clean: false });
          expect(getDeployMock).toHaveBeenCalledWith({ deployId: 'deploy-1' });
          expect(newSyncRpcSessionMock).toHaveBeenCalledTimes(5);
          expect(disposeGatewayMock).toHaveBeenCalledTimes(5);
          yield* Deferred.succeed(exitCode, CommandExecutor.ExitCode(0));
          yield* Fiber.join(fiber);
        }),
    );

    it.effect('bounds retries for transient Gateway transport failures', () =>
      Effect.gen(function* () {
        startDeployMock
          .mockRejectedValueOnce(new TypeError('connection reset'))
          .mockRejectedValueOnce(new TypeError('service unavailable'))
          .mockRejectedValueOnce(new TypeError('gateway timeout'));
        const fiber = yield* devFn({
          clean: false,
          port: 3005,
          systemId: 'sys_test',
        }).pipe(Effect.fork);
        yield* Deferred.await(commandStarted);
        yield* Queue.offer(stdout, 'Ready on http://127.0.0.1:3005\n');
        yield* Effect.promise(() =>
          vi.waitFor(() => expect(startDeployMock).toHaveBeenCalledTimes(1)),
        );
        yield* TestClock.adjust(2_000);

        const error = yield* Fiber.join(fiber).pipe(Effect.flip);
        expect(error).toMatchObject({
          code: 'zerospin-dev-start-deploy-failed',
        });
        expect(startDeployMock).toHaveBeenCalledTimes(3);
        expect(newSyncRpcSessionMock).toHaveBeenCalledTimes(3);
        expect(disposeGatewayMock).toHaveBeenCalledTimes(3);
        expect(killMock).toHaveBeenCalledWith('SIGTERM');
      }),
    );

    it.effect('does not retry a nontransient control failure', () =>
      Effect.gen(function* () {
        startDeployMock.mockResolvedValueOnce({
          _tag: 'Left',
          left: {
            cause: 'missing executing metadata',
            code: 'dev-version-metadata-missing',
            extra: null,
            message: 'The executing version metadata is missing.',
            status: 500,
          },
        });
        const fiber = yield* devFn({
          clean: false,
          port: 3005,
          systemId: 'sys_test',
        }).pipe(Effect.fork);
        yield* Deferred.await(commandStarted);
        yield* Queue.offer(stdout, 'Ready on http://127.0.0.1:3005\n');

        const error = yield* Fiber.join(fiber).pipe(Effect.flip);
        expect(error).toMatchObject({
          code: 'dev-version-metadata-missing',
          status: 500,
        });
        expect(startDeployMock).toHaveBeenCalledTimes(1);
        expect(newSyncRpcSessionMock).toHaveBeenCalledTimes(1);
        expect(killMock).toHaveBeenCalledWith('SIGTERM');
      }),
    );

    it.effect('rejects an incomplete deploy snapshot without retrying', () =>
      Effect.gen(function* () {
        startDeployMock.mockResolvedValueOnce({
          _tag: 'Right',
          right: {
            activationCheckpoint: 'generation-prepared',
            clean: false,
            deployId: 'deploy-1',
            failure: null,
            generationId: 'generation-1',
            status: 'succeeded',
          },
        });
        const fiber = yield* devFn({
          clean: false,
          port: 3005,
          systemId: 'sys_test',
        }).pipe(Effect.fork);
        yield* Deferred.await(commandStarted);
        yield* Queue.offer(stdout, 'Ready on http://127.0.0.1:3005\n');

        const error = yield* Fiber.join(fiber).pipe(Effect.flip);
        expect(error).toMatchObject({
          code: 'zerospin-dev-deploy-response-invalid',
        });
        expect(startDeployMock).toHaveBeenCalledTimes(1);
        expect(newSyncRpcSessionMock).toHaveBeenCalledTimes(1);
        expect(killMock).toHaveBeenCalledWith('SIGTERM');
      }),
    );

    it.effect('stops Wrangler on the persisted deploy failure', () =>
      Effect.gen(function* () {
        startDeployMock.mockResolvedValueOnce({
          _tag: 'Right',
          right: {
            activationCheckpoint: 'allocated',
            clean: false,
            deployId: 'deploy-1',
            failure: {
              cause: 'schema changed after remote mutation',
              code: 'dev-activation-conflict',
              extra: null,
              message: 'The activation cannot be resumed safely.',
              status: 409,
            },
            generationId: 'generation-1',
            status: 'failed',
            workerVersionId: 'version-1',
          },
        });
        const fiber = yield* devFn({
          clean: false,
          port: 3005,
          systemId: 'sys_test',
        }).pipe(Effect.fork);
        yield* Deferred.await(commandStarted);
        yield* Queue.offer(stdout, 'Ready on http://127.0.0.1:3005\n');

        const error = yield* Fiber.join(fiber).pipe(Effect.flip);
        expect(error).toMatchObject({
          cause: 'schema changed after remote mutation',
          code: 'dev-activation-conflict',
          status: 409,
        });
        expect(startDeployMock).toHaveBeenCalledTimes(1);
        expect(killMock).toHaveBeenCalledWith('SIGTERM');
      }),
    );

    it.effect('reports a nonzero Wrangler exit', () =>
      Effect.gen(function* () {
        const fiber = yield* devFn({
          clean: false,
          port: 3005,
          systemId: 'sys_test',
        }).pipe(Effect.fork);
        yield* Deferred.await(commandStarted);
        yield* Deferred.succeed(exitCode, CommandExecutor.ExitCode(2));

        const error = yield* Fiber.join(fiber).pipe(Effect.flip);
        expect(error).toMatchObject({
          code: 'zerospin-dev-wrangler-exited',
        });
      }),
    );

    it.effect('terminates Wrangler when the dev Effect is interrupted', () =>
      Effect.gen(function* () {
        const fiber = yield* devFn({
          clean: false,
          port: 3005,
          systemId: 'sys_test',
        }).pipe(Effect.fork);
        yield* Deferred.await(commandStarted);
        yield* Fiber.interrupt(fiber);

        expect(killMock).toHaveBeenCalledWith('SIGTERM');
      }),
    );
  });
});
