/**
 * system-worker Vitest: Node unit tests and workerd tests in separate configs.
 *
 * @bad Run `cloudflareTest` in the default node vitest config.
 * @bad Use `*.spec.ts` for both node and workerd without suffix separation.
 */
export const vitestNodeConfig = {
  test: {
    include: ['src/**/*.node.spec.ts'],
  },
};

export const vitestWorkerdConfig = {
  plugins: ['cloudflareTest'],
  test: {
    include: ['src/**/*.workerd.spec.ts'],
  },
};
