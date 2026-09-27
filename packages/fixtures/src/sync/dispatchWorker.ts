const SYNC_FIXTURE_SCRIPT = 'sync-fixture';

// oxlint-disable-next-line import/no-default-export -- Cloudflare Worker entrypoint
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.SYNC_USER_NAMESPACE.get(SYNC_FIXTURE_SCRIPT).fetch(request);
  },
};
