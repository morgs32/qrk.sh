declare namespace Cloudflare {
  interface Env {
    FIXTURE_REPO: DurableObjectNamespace<
      import('./src/TestWorker').FixtureRepo
    >;
    FIXED_DO_REPO_FIXTURE: DurableObjectNamespace<
      import('./src/TestWorker').FixedDORepoFixture
    >;
    E_PLURIBUS_MACHINA_FIXTURE: DurableObjectNamespace<
      import('./src/TestWorker').EPluribusMachinaFixture
    >;
  }
}
