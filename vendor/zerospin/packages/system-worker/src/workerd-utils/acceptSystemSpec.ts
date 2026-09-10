import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { env } from 'cloudflare:test';
import { system } from 'system';
import { beforeEach, expect } from 'vitest';

// Production accepts the executing bundle before any child activation. Give
// each isolated runtime test the same prerequisite with disposable fixture data.
beforeEach(async () => {
  expect(
    await env.SYSTEM_REPO.getByName(env.ZEROSPIN_SYSTEM_ID).checkSystemSpec({
      spec: makeSystemSpec({ system }),
    }),
  ).toEqual({ _tag: 'Success', success: { workerVersionId: null } });
});
