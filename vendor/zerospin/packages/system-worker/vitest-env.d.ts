declare namespace Cloudflare {
  interface DORepoNamespaces {
    FIXTURE_REPO: DurableObjectNamespace<
      import('./src/TestWorker').FixtureRepo
    >;
    FIXED_DO_REPO_FIXTURE: DurableObjectNamespace<
      import('./src/TestWorker').FixedDORepoFixture
    >;
    VERSIONED_DO_REPO_FIXTURE: DurableObjectNamespace<
      import('./src/TestWorker').VersionedDORepoFixture
    >;
  }
}
