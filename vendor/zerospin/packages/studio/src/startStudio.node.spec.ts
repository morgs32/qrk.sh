import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { startStudio } from './startStudio.ts';

const {
  closeMock,
  createServerMock,
  listenMock,
  makeTelemetryCollectorMock,
  middlewareUseMock,
  newSyncRpcSessionMock,
} = vi.hoisted(() => ({
  closeMock: vi.fn(),
  createServerMock: vi.fn(),
  listenMock: vi.fn(),
  makeTelemetryCollectorMock: vi.fn(),
  middlewareUseMock: vi.fn(),
  newSyncRpcSessionMock: vi.fn(),
}));

vi.mock('@zerospin/core/utils/newSyncRpcSession', () => ({
  newSyncRpcSession: newSyncRpcSessionMock,
}));

vi.mock('vite', () => ({
  createServer: createServerMock,
}));

vi.mock('@zerospin/logger', async importOriginal => {
  const logger = await importOriginal<typeof import('@zerospin/logger')>();
  makeTelemetryCollectorMock.mockImplementation(logger.makeTelemetryCollector);

  return {
    ...logger,
    makeTelemetryCollector: makeTelemetryCollectorMock,
  };
});

describe('startStudio', () => {
  beforeEach(() => {
    createServerMock.mockReset();
    newSyncRpcSessionMock.mockReset();
    middlewareUseMock.mockReset();
    listenMock.mockReset();
    closeMock.mockReset();
    makeTelemetryCollectorMock.mockClear();

    listenMock.mockResolvedValue(undefined);
    closeMock.mockResolvedValue(undefined);
    createServerMock.mockImplementation(async options => {
      const studioPlugin = options.plugins?.[0];

      if (
        studioPlugin === null ||
        studioPlugin === undefined ||
        studioPlugin === false ||
        typeof studioPlugin === 'function' ||
        studioPlugin instanceof Promise ||
        Array.isArray(studioPlugin) ||
        studioPlugin.configureServer === undefined
      ) {
        throw new Error('Expected the Studio Vite middleware plugin');
      }

      studioPlugin.configureServer(
        {
          middlewares: {
            use: middlewareUseMock,
          },
        },
      );

      return {
        listen: listenMock,
        close: closeMock,
      };
    });
  });

  it('runs a repository-list request through the concrete traced SystemApi target', async () => {
    const getSystemReposMock = vi.fn().mockResolvedValue({
      result: {
        _tag: 'Right',
        right: [{ repoName: 'system-repo', tableNames: ['systems'] }],
      },
      link: {
        linkId: 'lnk_studio-system-repos',
        traceId: 'trc_server-system-repos',
        spanId: 'spn_server-system-repos',
        priorTraceId: 'trc_client-system-repos',
        priorSpanId: 'spn_client-system-repos',
        kind: 'causedBy',
      },
    });
    const getSystemApiMock = vi.fn().mockReturnValue({
      getSystemRepos: getSystemReposMock,
    });
    const disposeMock = vi.fn();
    newSyncRpcSessionMock.mockReturnValue({
      getSystemApi: getSystemApiMock,
      [Symbol.dispose]: disposeMock,
    });

    await Effect.runPromise(
      startStudio({
        port: 5555,
        open: false,
        zerospinApiUrl: 'http://apis.test',
        zerospinSecretKey: 'secret-studio-key',
      }),
    );

    const middleware = middlewareUseMock.mock.calls[0]![0];
    const response = {
      statusCode: 200,
      setHeader: vi.fn(),
      end: vi.fn(),
    };
    const next = vi.fn();

    await middleware(
      { method: 'GET', url: '/api/repos/SystemRepo' },
      response,
      next,
    );

    expect(getSystemApiMock).toHaveBeenCalledOnce();
    expect(getSystemApiMock).toHaveBeenCalledWith({
      zerospinSecretKey: 'secret-studio-key',
    });
    expect(getSystemReposMock).toHaveBeenCalledTimes(1);
    expect(getSystemReposMock.mock.calls[0]![0]).toMatchObject({
      args: [],
      traceContext: {
        traceId: expect.stringMatching(/^trc_/),
        parentSpanId: expect.stringMatching(/^spn_/),
      },
    });
    expect(response.setHeader).toHaveBeenCalledOnce();
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/json',
    );
    expect(response.end).toHaveBeenCalledOnce();
    expect(response.end).toHaveBeenCalledWith(
      JSON.stringify([
        { repoName: 'system-repo', tableNames: ['systems'] },
      ]),
    );
    expect(response.end.mock.calls[0]![0]).not.toContain('secret-studio-key');
    expect(response.end.mock.calls[0]![0]).not.toContain(
      'lnk_studio-system-repos',
    );
    expect(next).not.toHaveBeenCalled();
    expect(disposeMock).toHaveBeenCalledTimes(1);
    expect(makeTelemetryCollectorMock).toHaveBeenCalledOnce();
    expect(makeTelemetryCollectorMock.mock.results[0]!.value.flush()).toEqual({
      spans: [],
      logs: [],
      links: [],
    });
  });

  it('runs a table-row request with the decoded route arguments', async () => {
    const getAccountRepoTableRowsMock = vi.fn().mockResolvedValue({
      result: {
        _tag: 'Right',
        right: {
          columns: [{ name: 'id', type: 'text' }],
          rows: [{ id: 'account-1' }],
        },
      },
      link: null,
    });
    newSyncRpcSessionMock.mockReturnValue({
      getSystemApi: vi.fn().mockReturnValue({
        getAccountRepoTableRows: getAccountRepoTableRowsMock,
      }),
      [Symbol.dispose]: vi.fn(),
    });

    await Effect.runPromise(
      startStudio({
        port: 5555,
        open: false,
        zerospinApiUrl: 'http://apis.test',
        zerospinSecretKey: 'secret-studio-key',
      }),
    );

    const middleware = middlewareUseMock.mock.calls[0]![0];
    const response = {
      statusCode: 200,
      setHeader: vi.fn(),
      end: vi.fn(),
    };

    await middleware(
      {
        method: 'GET',
        url: '/api/repos/AccountRepo/account%2Frepo/accounts%20table',
      },
      response,
      vi.fn(),
    );

    expect(getAccountRepoTableRowsMock).toHaveBeenCalledTimes(1);
    expect(getAccountRepoTableRowsMock.mock.calls[0]![0]).toMatchObject({
      args: [
        {
          repoName: 'account/repo',
          tableName: 'accounts table',
        },
      ],
      traceContext: {
        traceId: expect.stringMatching(/^trc_/),
        parentSpanId: expect.stringMatching(/^spn_/),
      },
    });
    expect(response.end).toHaveBeenCalledOnce();
    expect(response.end).toHaveBeenCalledWith(
      JSON.stringify({
        columns: [{ name: 'id', type: 'text' }],
        rows: [{ id: 'account-1' }],
      }),
    );
  });

  it('returns a 500 response for an encoded SystemApi domain failure', async () => {
    const getSystemReposMock = vi.fn().mockResolvedValue({
      result: {
        _tag: 'Left',
        left: {
          code: 'repo-read-failed',
          message: 'System repo read failed',
        },
      },
      link: null,
    });
    newSyncRpcSessionMock.mockReturnValue({
      getSystemApi: vi.fn().mockReturnValue({
        getSystemRepos: getSystemReposMock,
      }),
      [Symbol.dispose]: vi.fn(),
    });

    await Effect.runPromise(
      startStudio({
        port: 5555,
        open: false,
        zerospinApiUrl: 'http://apis.test',
        zerospinSecretKey: 'secret-studio-key',
      }),
    );

    const middleware = middlewareUseMock.mock.calls[0]![0];
    const response = {
      statusCode: 200,
      setHeader: vi.fn(),
      end: vi.fn(),
    };

    await middleware(
      { method: 'GET', url: '/api/repos/SystemRepo' },
      response,
      vi.fn(),
    );

    expect(response.statusCode).toBe(500);
    expect(response.end).toHaveBeenCalledOnce();
    expect(response.end.mock.calls[0]![0]).toEqual(
      expect.stringContaining('"error":'),
    );
    expect(response.end.mock.calls[0]![0]).not.toContain('secret-studio-key');
  });

  it('creates isolated caller roots for concurrent middleware requests', async () => {
    const getSystemReposMock = vi.fn().mockResolvedValue({
      result: {
        _tag: 'Right',
        right: [{ repoName: 'system-repo', tableNames: ['systems'] }],
      },
      link: {
        linkId: 'lnk_concurrent-system-repos',
        traceId: 'trc_server-concurrent-system-repos',
        spanId: 'spn_server-concurrent-system-repos',
        priorTraceId: 'trc_client-concurrent-system-repos',
        priorSpanId: 'spn_client-concurrent-system-repos',
        kind: 'causedBy',
      },
    });
    newSyncRpcSessionMock.mockReturnValue({
      getSystemApi: vi.fn().mockReturnValue({
        getSystemRepos: getSystemReposMock,
      }),
      [Symbol.dispose]: vi.fn(),
    });

    await Effect.runPromise(
      startStudio({
        port: 5555,
        open: false,
        zerospinApiUrl: 'http://apis.test',
        zerospinSecretKey: 'secret-studio-key',
      }),
    );

    const middleware = middlewareUseMock.mock.calls[0]![0];
    const firstResponse = {
      statusCode: 200,
      setHeader: vi.fn(),
      end: vi.fn(),
    };
    const secondResponse = {
      statusCode: 200,
      setHeader: vi.fn(),
      end: vi.fn(),
    };

    await Promise.all([
      middleware(
        { method: 'GET', url: '/api/repos/SystemRepo' },
        firstResponse,
        vi.fn(),
      ),
      middleware(
        { method: 'GET', url: '/api/repos/SystemRepo' },
        secondResponse,
        vi.fn(),
      ),
    ]);

    expect(getSystemReposMock).toHaveBeenCalledTimes(2);
    expect(makeTelemetryCollectorMock).toHaveBeenCalledTimes(2);
    expect(makeTelemetryCollectorMock.mock.results[0]!.value).not.toBe(
      makeTelemetryCollectorMock.mock.results[1]!.value,
    );
    expect(getSystemReposMock.mock.calls[0]![0].traceContext.traceId).not.toBe(
      getSystemReposMock.mock.calls[1]![0].traceContext.traceId,
    );
    expect(
      getSystemReposMock.mock.calls[0]![0].traceContext.parentSpanId,
    ).not.toBe(
      getSystemReposMock.mock.calls[1]![0].traceContext.parentSpanId,
    );
    expect(firstResponse.end.mock.calls[0]![0]).not.toContain('lnk_concurrent');
    expect(secondResponse.end.mock.calls[0]![0]).not.toContain(
      'lnk_concurrent',
    );
    expect(firstResponse.end.mock.calls[0]![0]).not.toContain(
      'secret-studio-key',
    );
    expect(secondResponse.end.mock.calls[0]![0]).not.toContain(
      'secret-studio-key',
    );
    expect(makeTelemetryCollectorMock.mock.results[0]!.value.flush()).toEqual({
      spans: [],
      logs: [],
      links: [],
    });
    expect(makeTelemetryCollectorMock.mock.results[1]!.value.flush()).toEqual({
      spans: [],
      logs: [],
      links: [],
    });
  });

  it('preserves the explicit 404 response for an unknown repo type', async () => {
    const getSystemReposMock = vi.fn();
    newSyncRpcSessionMock.mockReturnValue({
      getSystemApi: vi.fn().mockReturnValue({
        getSystemRepos: getSystemReposMock,
      }),
      [Symbol.dispose]: vi.fn(),
    });

    await Effect.runPromise(
      startStudio({
        port: 5555,
        open: false,
        zerospinApiUrl: 'http://apis.test',
        zerospinSecretKey: 'secret-studio-key',
      }),
    );

    const middleware = middlewareUseMock.mock.calls[0]![0];
    const response = {
      statusCode: 200,
      setHeader: vi.fn(),
      end: vi.fn(),
    };
    const next = vi.fn();

    await middleware(
      { method: 'GET', url: '/api/repos/UnknownRepo' },
      response,
      next,
    );

    expect(response.statusCode).toBe(404);
    expect(response.end).toHaveBeenCalledOnce();
    expect(response.end).toHaveBeenCalledWith(
      JSON.stringify({ error: 'Repo type not found' }),
    );
    expect(getSystemReposMock).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
