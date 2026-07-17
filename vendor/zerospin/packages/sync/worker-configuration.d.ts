declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import('./e2e/worker');
    durableNamespaces: 'FixtureStateRepo' | 'FixtureSyncAgent';
  }
  interface Env {
    FIXTURE_STATE_REPO: DurableObjectNamespace<
      import('./e2e/worker').FixtureStateRepo
    >;
    FIXTURE_SYNC_AGENT: DurableObjectNamespace<
      import('./e2e/worker').FixtureSyncAgent
    >;
    SYNC_USER_NAMESPACE: DispatchNamespace;
  }
}
interface Env extends Cloudflare.Env {}
