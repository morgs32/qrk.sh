import { makeZerospinError } from '@zerospin/error';
import { definition } from '@zerospin/fixtures/browser/nodeFixture';
import { beforeEach, expect, it, vi } from 'vitest';

import type { INodeRequest } from './nodeRequest.ts';
import { resolveNode } from './resolveNode.ts';

const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), find: vi.fn() }));
vi.mock('./nodeNetwork.ts', () => ({
  nodeNetwork: () => ({ snapshot: mocks.snapshot }),
}));
vi.mock('./sessionDiscovery.ts', () => ({
  sessionDiscovery: { find: mocks.find },
}));
const request: INodeRequest = {
  kind: 'aggregate',
  apiUrl: definition.identity.apiUrl,
  publishableKey: definition.identity.publishableKey,
  systemName: 'test',
  targetName: 'account',
  targetVersion: 'v1',
  sessionName: 'editor',
  lock: { ...definition.lock, contracts: {} },
};
const props = {
  request,
  revision: 4,
  expectedClaims: { userId: 'one' },
  getAdmission: async () => ({ credentials: { token: 'token' } }),
};
beforeEach(() => {
  mocks.snapshot.mockReset().mockResolvedValue({
    claims: { userId: 'one' },
    aggregateId: 'acct_one',
    executedIndex: 0,
    executedHash: '0'.repeat(64),
    resources: [],
    aggregateIndex: 0,
  });
  mocks.find
    .mockReset()
    .mockResolvedValue({ claims: { userId: 'one' }, targetId: 'acct_one' });
});
it('verifies online before lookup and derives one exact persistent identity', async () => {
  const result = await resolveNode(props);
  expect(result.definition.identity).toMatchObject({
    targetId: 'acct_one',
    claims: props.expectedClaims,
  });
  expect(result.attachment.online).toBe(true);
  expect(mocks.find).not.toHaveBeenCalled();
});
it('uses an exact offline lookup only after classified network unavailability', async () => {
  mocks.snapshot.mockRejectedValue(
    makeZerospinError({ code: 'node-network-unavailable' }),
  );
  const result = await resolveNode(props);
  expect(result.attachment.online).toBe(false);
  expect(mocks.find).toHaveBeenCalledWith(request, props.expectedClaims);
  await expect(
    resolveNode({ ...props, expectedClaims: undefined }),
  ).rejects.toMatchObject({ code: 'node-offline-claims-required' });
});
it('does not fall back on authentication rejection, claims mismatch, or arbitrary errors', async () => {
  for (const error of [
    makeZerospinError({ code: 'credentials-rejected' }),
    makeZerospinError({ code: 'system-deploy-failed' }),
    makeZerospinError({ code: 'gateway-infrastructure-failure' }),
    makeZerospinError({ code: 'async-failed' }),
    new Error('bug'),
  ]) {
    mocks.snapshot.mockRejectedValue(error);
    await expect(resolveNode(props)).rejects.toBe(error);
  }
  mocks.snapshot.mockResolvedValue({
    claims: { userId: 'other' },
    aggregateId: 'acct_other',
  });
  await expect(resolveNode(props)).rejects.toMatchObject({
    code: 'session-claims-mismatch',
  });
  expect(mocks.find).not.toHaveBeenCalled();
});

it('resolves a service identity and its initial service checkpoint', async () => {
  const serviceRequest: INodeRequest = {
    ...request,
    kind: 'service',
    targetName: 'catalog',
    lock: {
      sessionName: request.lock.sessionName,
      actorName: request.lock.actorName,
      actorVersion: request.lock.actorVersion,
      claims: request.lock.claims,
      models: request.lock.models,
    },
  };
  mocks.snapshot.mockResolvedValue({
    claims: props.expectedClaims,
    serviceName: 'catalog',
    serviceIndex: 7,
    serviceHash: 'a'.repeat(64),
    resources: [],
  });
  const result = await resolveNode({ ...props, request: serviceRequest });
  expect(result.definition.identity).toMatchObject({
    kind: 'service',
    targetId: 'catalog',
  });
  expect(result.attachment.baseline).toEqual({
    executedIndex: 7,
    executedHash: 'a'.repeat(64),
    aggregateIndex: 0,
    resolvedThrough: 0,
    resources: [],
  });
});
