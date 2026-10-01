import { fixture } from '@zerospin/core/fixtures/nodeFixture';
import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import { makeZerospinError } from '@zerospin/error';
import { RpcStub } from 'capnweb';
import { expect, it, vi } from 'vitest';

import { BrowserSessionApi } from '../BrowserSessionApi/BrowserSessionApi';

import { SharedWorkerApi } from './SharedWorkerApi';

it.each([
  'node-attachment-identity-mismatch',
  'node-authentication-cancelled',
  'node-tab-detached',
  'node-storage-unavailable',
])('preserves %s through the attachment RPC envelope', async code => {
  const failure = makeZerospinError({
    code,
    message: 'Classified attachment failure',
    status: 409,
    extra: { reason: 'test' },
    cause: 'Private local diagnostic',
  });
  const api = new SharedWorkerApi({
    ready: async () => ({ version: 'test' }),
    attach: async () => {
      throw failure;
    },
  });
  const released = vi.fn();
  const target = new RpcStub(
    Object.assign(async (): Promise<IAdmissionRequest> => ({ claims: {} }), {
      [Symbol.dispose]: released,
    }),
  );
  try {
    const result = await api.attach({}, target);
    expect(result).toEqual({
      _tag: 'Failure',
      failure: {
        _tag: 'ZerospinError',
        code,
        message: failure.message,
        status: failure.status,
        extra: failure.extra,
      },
    });
    expect(api.connections.size).toBe(0);
    expect(released).not.toHaveBeenCalled();
    target[Symbol.dispose]();
    expect(released).toHaveBeenCalledTimes(1);
  } finally {
    api[Symbol.dispose]();
    target[Symbol.dispose]();
  }
});

it('uses the attachment fallback for an unexpected worker exception', async () => {
  const api = new SharedWorkerApi({
    ready: async () => ({ version: 'test' }),
    attach: async () => {
      throw new TypeError('Unexpected worker exception');
    },
  });
  const target = new RpcStub<() => Promise<IAdmissionRequest>>(async () => ({
    claims: {},
  }));
  try {
    expect(await api.attach({}, target)).toEqual({
      _tag: 'Failure',
      failure: {
        _tag: 'ZerospinError',
        code: 'node-attachment-failed',
        message: 'Unexpected worker exception',
        status: null,
        extra: null,
      },
    });
    expect(api.connections.size).toBe(0);
  } finally {
    api[Symbol.dispose]();
    target[Symbol.dispose]();
  }
});

it('releases a successful attachment once when its owning port is disposed', async () => {
  const { node, sqlite } = await fixture();
  const detach = vi.fn();
  const attached = new BrowserSessionApi(node, undefined, undefined, detach);
  const api = new SharedWorkerApi({
    ready: async () => ({ version: 'test' }),
    attach: async () => attached,
  });
  const target = new RpcStub<() => Promise<IAdmissionRequest>>(async () => ({
    claims: {},
  }));
  try {
    const result = await api.attach({}, target);
    if (result._tag === 'Failure') throw new Error(result.failure.message);
    expect(api.connections.size).toBe(1);
    api[Symbol.dispose]();
    api[Symbol.dispose]();
    expect(detach).toHaveBeenCalledTimes(1);
    expect(attached.detached).toBe(true);
    expect(api.connections.size).toBe(0);
    result.success[Symbol.dispose]();
  } finally {
    api[Symbol.dispose]();
    target[Symbol.dispose]();
    sqlite.close();
  }
});

it('preserves detachment when a port closes during attachment and releases the capability', async () => {
  const { node, sqlite } = await fixture();
  const attached = new BrowserSessionApi(node);
  const pending = Promise.withResolvers<BrowserSessionApi>();
  const api = new SharedWorkerApi({
    ready: async () => ({ version: 'test' }),
    attach: () => pending.promise,
  });
  const target = new RpcStub<() => Promise<IAdmissionRequest>>(async () => ({
    claims: {},
  }));
  try {
    const result = api.attach({}, target);
    api[Symbol.dispose]();
    pending.resolve(attached);
    expect(await result).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'node-tab-detached' },
    });
    expect(attached.detached).toBe(true);
    expect(api.connections.size).toBe(0);
  } finally {
    api[Symbol.dispose]();
    target[Symbol.dispose]();
    sqlite.close();
  }
});
