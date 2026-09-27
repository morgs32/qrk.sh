declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import('@zerospin/fixtures/sync/worker');
    durableNamespaces: 'FixtureStateRepo' | 'FixtureSyncAgent';
  }
  interface Env {
    FIXTURE_STATE_REPO: DurableObjectNamespace<
      import('@zerospin/fixtures/sync/worker').FixtureStateRepo
    >;
    FIXTURE_SYNC_AGENT: DurableObjectNamespace<
      import('@zerospin/fixtures/sync/worker').FixtureSyncAgent
    >;
    SYNC_USER_NAMESPACE: DispatchNamespace;
  }
}
interface Env extends Cloudflare.Env {}
