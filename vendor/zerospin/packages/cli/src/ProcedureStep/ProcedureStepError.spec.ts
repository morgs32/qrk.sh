import { createElement } from 'react';

import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { Effect, Result } from 'effect';
import { render } from 'ink';
import { expect, it, vi } from 'vitest';

import { assertAcceptedSpec } from '../../../system-worker/src/SystemRepo/assertAcceptedSpec/assertAcceptedSpec.js';

import { ProcedureStepContext } from './ProcedureStepContext.js';
import { ProcedureStepError } from './ProcedureStepError.js';

it('renders RPC mismatch details inline without creating an error report', async () => {
  const changes = [
    { op: 'replace', path: '/services/directory', value: '2.0.0' },
  ];
  const envelope = await Effect.runPromise(
    assertAcceptedSpec({
      kind: 'aggregate',
      name: 'cart',
      version: '1.0.0',
      accepted: { services: { directory: '1.0.0' } },
      incoming: { services: { directory: '2.0.0' } },
    }).pipe(encodeRpc),
  );
  const result = await Effect.runPromise(
    decodeRpc(structuredClone(envelope)).pipe(Effect.result),
  );
  if (!Result.isFailure(result)) throw new Error('Expected mismatch');
  const directory = mkdtempSync(join(tmpdir(), 'spec-mismatch-'));
  const cwd = vi.spyOn(process, 'cwd').mockReturnValue(directory);
  const stdout = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation((_chunk, encoding, callback) => {
      if (typeof encoding === 'function') encoding();
      else callback?.();
      return true;
    });
  const exitCode = process.exitCode;
  const app = render(
    createElement(
      ProcedureStepContext.Provider,
      { value: 'error' },
      createElement(ProcedureStepError, {
        description: 'Spec rejected',
        error: result.failure,
      }),
    ),
    { debug: true, patchConsole: false, exitOnCtrlC: false },
  );
  try {
    await app.waitUntilRenderFlush();
    await vi.waitFor(() => expect(process.exitCode).toBe(1));
    await app.waitUntilRenderFlush();
    const output = stdout.mock.calls.map(call => String(call[0])).join('');
    expect(output).toContain('/services/directory');
    expect(output).toContain('2.0.0');
    expect(output).toContain('Spec rejected.');
    expect(output.replace(/\s/g, '')).toContain(JSON.stringify(changes));
    expect(output).toContain('"changes": [');
    expect(output).toContain('"cause":');
    expect(output).toContain(`"code": "${result.failure.code}"`);
    expect(output).toContain('"extra": {');
    expect(output).toContain('"status":');
    expect(readdirSync(directory)).toEqual([]);
  } finally {
    app.unmount();
    await app.waitUntilExit();
    stdout.mockRestore();
    cwd.mockRestore();
    process.exitCode = exitCode;
    rmSync(directory, { recursive: true, force: true });
  }
});
