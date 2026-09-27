const transient = new Set([
  'async-failed',
  'user-authentication-transport-failed',
  'gateway-infrastructure-failure',
  'system-deploy-activating',
  'system-deploy-failed',
  'system-not-ready',
  'node-signature-unavailable',
  'node-network-unavailable',
]);
export const isNodeNetworkUnavailable = (error: unknown) =>
  error instanceof Error &&
  ('code' in error
    ? typeof error.code === 'string' && transient.has(error.code)
    : false);
