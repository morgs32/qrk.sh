import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import type { ISystemSpec } from '@zerospin/core/system/types';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { ZerospinError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect, Schema } from 'effect';
import { system } from 'system';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { checkSystemSpec as acceptSystemSpec } from '../../SystemRepo/checkSystemSpec/checkSystemSpec.js';
import { systemRepoDbConfig } from '../../SystemRepo/systemRepoDbConfig.js';
import {
  makeApiHandler,
  SystemApiAuthResults,
} from '../makeApiHandler/makeApiHandler.js';
import { makeSystemSpec as inspectSystemSpec } from '../makeSystemSpec/makeSystemSpec.js';
import { checkSystemSpec as rejectedCheckSystemSpec } from '../SystemApiFailure/checkSystemSpec/checkSystemSpec.js';

import { checkSystemSpec } from './checkSystemSpec.js';

const { getRepo, submitSpec, appendTelemetryBatch } = vi.hoisted(() => ({
  getRepo: vi.fn(),
  submitSpec: vi.fn(),
  appendTelemetryBatch: vi.fn(),
}));
vi.mock('../../SystemRepo/SystemRepo.js', () => ({ SystemRepo: { getRepo } }));
vi.mock('../../appendTelemetryBatch/appendTelemetryBatch.js', () => ({
  appendTelemetryBatch,
}));
vi.mock('system', async importOriginal => {
  const incumbent = await importOriginal<typeof import('system')>();
  return {
    ...incumbent,
    system: {
      ...incumbent.system,
      name: 'candidate-b',
      aggregates: {
        candidate: {
          '1.0.0': {
            ...incumbent.system.aggregates.user['1.0.0'],
            name: 'candidate',
          },
        },
      },
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  delete env.ZEROSPIN_VERSION_METADATA;
  getRepo.mockReturnValue(Effect.succeed({ checkSystemSpec: submitSpec }));
  appendTelemetryBatch.mockReturnValue(Effect.die('child Repo not accepted'));
});

describe('SystemApi.checkSystemSpec', () => {
  it('submits Worker B definitions to the A-assigned SystemRepo with an empty argument tuple', async () => {
    env.ZEROSPIN_VERSION_METADATA = { id: 'incumbent-a' };
    const incumbent = await vi.importActual<typeof import('system')>('system');
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({ dbConfig: systemRepoDbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );
    await Effect.runPromise(
      acceptSystemSpec({
        db,
        spec: makeSystemSpec({ system: incumbent.system }),
      }),
    );
    submitSpec.mockImplementation((props: { spec: ISystemSpec }) =>
      Effect.runPromise(
        acceptSystemSpec({ db, spec: props.spec }).pipe(encodeRpc),
      ),
    );
    const result = await Effect.runPromise(
      checkSystemSpec({
        request: { args: [], traceContext: null },
        authResults: { systemId: 'sys_test' },
      }).pipe(Effect.provide(AsyncLive)),
    );
    expect(result).toEqual({
      result: { _tag: 'Success', success: { workerVersionId: 'incumbent-a' } },
      link: null,
    });
    expect(getRepo).toHaveBeenCalledWith({ key: { systemId: 'sys_test' } });
    expect(submitSpec).toHaveBeenCalledWith({
      spec: makeSystemSpec({ system }),
    });
    const locks = db
      .select()
      .from(systemRepoDbConfig.schema.aggregateSpecLocks)
      .all();
    expect(locks.some(lock => lock.name === 'candidate')).toBe(true);
    expect(locks.some(lock => lock.name === 'user')).toBe(true);
    expect(appendTelemetryBatch).not.toHaveBeenCalled();
  });

  it('rejects a caller-supplied spec before executing the candidate check', async () => {
    const result = await Effect.runPromise(
      checkSystemSpec({
        request: JSON.parse(
          JSON.stringify({
            args: [{ spec: makeSystemSpec({ system }) }],
            traceContext: null,
          }),
        ),
        authResults: { systemId: 'sys_test' },
      }).pipe(Effect.provide(AsyncLive)),
    );
    expect(result).toMatchObject({
      result: {
        _tag: 'Failure',
        failure: { code: 'system-api-arguments-invalid' },
      },
      link: null,
    });
    expect(submitSpec).not.toHaveBeenCalled();
    expect(getRepo).not.toHaveBeenCalled();
  });

  it('returns admission failures without executing acceptance', async () => {
    const result = await Effect.runPromise(
      rejectedCheckSystemSpec({
        request: { args: [], traceContext: null },
        error: new ZerospinError({
          code: 'secret-key-invalid',
          message: 'Rejected',
        }),
      }),
    );
    expect(result).toMatchObject({
      result: { _tag: 'Failure', failure: { code: 'secret-key-invalid' } },
      link: null,
    });
    expect(submitSpec).not.toHaveBeenCalled();
  });

  it('allows spec inspection before any child Repo can accept telemetry', async () => {
    const result = await Effect.runPromise(
      inspectSystemSpec({
        request: { args: [], traceContext: null },
        authResults: { systemId: 'sys_test' },
      }).pipe(Effect.provide(AsyncLive)),
    );
    expect(result).toMatchObject({
      result: { _tag: 'Success', success: { systemName: 'candidate-b' } },
      link: null,
    });
    expect(appendTelemetryBatch).not.toHaveBeenCalled();
  });

  it('preserves settled domain failures when telemetry persistence defects', async () => {
    const result = await Effect.runPromise(
      makeApiHandler({
        name: 'SystemApi.test',
        argsSchema: Schema.mutable(Schema.Tuple([])),
        handler: () =>
          Effect.fail(
            new ZerospinError({ code: 'domain-rejected', message: 'Rejected' }),
          ),
      })({ args: [], traceContext: null }).pipe(
        Effect.provideService(SystemApiAuthResults, { systemId: 'sys_test' }),
        Effect.provide(AsyncLive),
      ),
    );
    expect(result).toMatchObject({
      result: { _tag: 'Failure', failure: { code: 'domain-rejected' } },
      link: null,
    });
    expect(appendTelemetryBatch).toHaveBeenCalledTimes(1);
  });
});
