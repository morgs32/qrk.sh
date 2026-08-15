declare namespace Cloudflare {
  interface Env {
    FIXTURE_REPO: DurableObjectNamespace<
      import('./src/TestWorker').FixtureRepo
    >;
    BOUND_DO_REPO_FIXTURE: DurableObjectNamespace<
      import('./src/TestWorker').BoundDORepoFixture
    >;
    ZEROSPIN_TEST_INTERRUPT_SYSTEM_WRITE_CAPTURE: boolean;
  }
}
