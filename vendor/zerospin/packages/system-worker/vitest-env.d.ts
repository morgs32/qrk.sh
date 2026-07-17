declare namespace Cloudflare {
  interface Env {
    FIXTURE_REPO: DurableObjectNamespace<
      import('./src/TestWorker').FixtureRepo
    >;
  }
}
