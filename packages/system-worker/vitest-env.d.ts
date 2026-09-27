declare namespace Cloudflare {
  interface DORepoNamespaces {
    FIXTURE_REPO: DurableObjectNamespace<
      import('@zerospin/fixtures/system-worker/TestWorker').FixtureRepo
    >;
    FIXED_DO_REPO_FIXTURE: DurableObjectNamespace<
      import('@zerospin/fixtures/system-worker/TestWorker').FixedDORepoFixture
    >;
    VERSIONED_DO_REPO_FIXTURE: DurableObjectNamespace<
      import('@zerospin/fixtures/system-worker/TestWorker').MigratableDORepoFixture
    >;
  }
}
