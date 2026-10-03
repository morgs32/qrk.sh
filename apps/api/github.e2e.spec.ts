import { env } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BackendRepo } from "./BackendRepo";
import { LibraryApi } from "./modules/LibraryApi";

beforeEach(async () => {
  vi.restoreAllMocks();
  const stub = env.BACKEND_REPO.getByName("global");
  expect((await stub.ready()).result._tag).toBe("Success");
  await runInDurableObject(stub, (_instance, state) => {
    state.storage.sql.exec("DELETE FROM responses");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LibraryApi GitHub response retention", () => {
  it("rejects non-JSON storage payloads without changing the once-encoded retained row", async () => {
    const stub = env.BACKEND_REPO.getByName("global");
    const payload = { values: [true, null, 3, { nested: "retained" }] };
    const stored = await stub.storeResponse({ key: "generic-response", payload });
    expect(stored.result._tag).toBe("Success");

    const invalid = await stub.storeResponse({
      key: "generic-response",
      payload: { values: [undefined] },
    });
    expect(invalid.result).toMatchObject({
      _tag: "Failure",
      failure: { code: "backend-response-store-failed" },
    });
    const rows = await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql
        .exec<{ key: string; payload: string }>("SELECT key, payload FROM responses")
        .toArray(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe("generic-response");
    expect(JSON.parse(rows[0].payload)).toEqual(payload);
  });

  it("fetches each profile request and retains its extra fields and contributions", async () => {
    const api = new LibraryApi({ ...env, GITHUB_TOKEN: "github-test-token" });
    const firstProfile = {
      login: "morgs32",
      name: "Morgan",
      bio: "First response",
      custom: { nested: [true, null, 3] },
    };
    const secondProfile = { ...firstProfile, bio: "Second response" };
    const contributionResponse = {
      data: {
        user: {
          login: "morgs32",
          contributionsCollection: {
            contributionCalendar: {
              weeks: [
                {
                  contributionDays: [
                    {
                      date: "2026-10-02",
                      contributionCount: 7,
                      contributionLevel: "THIRD_QUARTILE",
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(firstProfile))
      .mockResolvedValueOnce(Response.json(contributionResponse))
      .mockResolvedValueOnce(Response.json(secondProfile))
      .mockResolvedValueOnce(Response.json(contributionResponse));

    const first = await api.getGitHubProfile("https://github.com/MORGS32/?tab=repositories");
    const second = await api.getGitHubProfile("https://github.com/morgs32");

    expect(first).toEqual({
      _tag: "Right",
      right: {
        ...firstProfile,
        contributions: [{ date: "2026-10-02", count: 7, level: 3 }],
      },
    });
    expect(second).toEqual({
      _tag: "Right",
      right: {
        ...secondProfile,
        contributions: [{ date: "2026-10-02", count: 7, level: 3 }],
      },
    });
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      "https://api.github.com/users/morgs32",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer github-test-token" }),
      }),
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      "https://api.github.com/graphql",
      expect.objectContaining({ method: "POST" }),
    );
    const rows = await runInDurableObject(
      env.BACKEND_REPO.getByName("global"),
      (_instance, state) =>
        state.storage.sql
          .exec<{ key: string; payload: string }>("SELECT key, payload FROM responses")
          .toArray()
          .map((row) => ({ key: row.key, payload: JSON.parse(row.payload) })),
    );
    expect(rows).toEqual([
      {
        key: "github-profile:https://github.com/morgs32",
        payload: {
          ...secondProfile,
          contributions: [{ date: "2026-10-02", count: 7, level: 3 }],
        },
      },
    ]);
  });

  it("fetches each repository request and replaces only that response key", async () => {
    const api = new LibraryApi({ ...env, GITHUB_TOKEN: "github-test-token" });
    const firstRepo = {
      name: "qrk.sh",
      description: null,
      stargazers_count: 4,
      forks_count: 1,
      language: "TypeScript",
    };
    const secondRepo = { ...firstRepo, stargazers_count: 8 };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ ...firstRepo, provider_extra: "discard" }))
      .mockResolvedValueOnce(Response.json(secondRepo));

    expect(await api.getGitHubRepo("https://github.com/morgs32/qrk.sh.git?tab=readme")).toEqual({
      _tag: "Right",
      right: firstRepo,
    });
    expect(await api.getGitHubRepo("https://github.com/morgs32/qrk.sh")).toEqual({
      _tag: "Right",
      right: secondRepo,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      "https://api.github.com/repos/morgs32/qrk.sh",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer github-test-token" }),
      }),
    );
    const rows = await runInDurableObject(
      env.BACKEND_REPO.getByName("global"),
      (_instance, state) => state.storage.sql.exec("SELECT key, payload FROM responses").toArray(),
    );
    expect(rows).toEqual([
      { key: "github-repo:https://github.com/morgs32/qrk.sh", payload: JSON.stringify(secondRepo) },
    ]);
  });

  it("retains profile and repository responses under separate keys", async () => {
    const api = new LibraryApi({ ...env, GITHUB_TOKEN: "github-test-token" });
    const profile = { login: "morgs32", name: "Morgan" };
    const repo = {
      name: "qrk.sh",
      description: "QRK",
      stargazers_count: 8,
      forks_count: 1,
      language: "TypeScript",
    };
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(profile))
      .mockResolvedValueOnce(
        Response.json({
          data: {
            user: {
              login: "morgs32",
              contributionsCollection: { contributionCalendar: { weeks: [] } },
            },
          },
        }),
      )
      .mockResolvedValueOnce(Response.json(repo));

    expect(await api.getGitHubProfile("https://github.com/morgs32")).toEqual({
      _tag: "Right",
      right: { ...profile, contributions: [] },
    });
    expect(await api.getGitHubRepo("https://github.com/morgs32/qrk.sh")).toEqual({
      _tag: "Right",
      right: repo,
    });
    const rows = await runInDurableObject(
      env.BACKEND_REPO.getByName("global"),
      (_instance, state) =>
        state.storage.sql
          .exec<{ key: string; payload: string }>("SELECT key, payload FROM responses ORDER BY key")
          .toArray()
          .map((row) => ({ key: row.key, payload: JSON.parse(row.payload) })),
    );
    expect(rows).toEqual([
      {
        key: "github-profile:https://github.com/morgs32",
        payload: { ...profile, contributions: [] },
      },
      { key: "github-repo:https://github.com/morgs32/qrk.sh", payload: repo },
    ]);
  });

  it("returns contribution failures without replacing a previously retained profile", async () => {
    const api = new LibraryApi({ ...env, GITHUB_TOKEN: "github-test-token" });
    const previousProfile = { login: "morgs32", name: "Previous profile", contributions: [] };
    const stub = env.BACKEND_REPO.getByName("global");
    const stored = await stub.storeResponse({
      key: "github-profile:https://github.com/morgs32",
      payload: previousProfile,
    });
    expect(stored.result._tag).toBe("Success");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ login: "morgs32", name: "Fresh profile" }))
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));

    expect(await api.getGitHubProfile("https://github.com/morgs32")).toEqual({
      _tag: "Left",
      left: {
        code: "scrape-transient-failure",
        message: "GitHub contributions returned HTTP 503",
      },
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const rows = await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql
        .exec<{ key: string; payload: string }>("SELECT key, payload FROM responses")
        .toArray()
        .map((row) => ({ key: row.key, payload: JSON.parse(row.payload) })),
    );
    expect(rows).toEqual([
      {
        key: "github-profile:https://github.com/morgs32",
        payload: previousProfile,
      },
    ]);
  });

  /**
   * 1. Retain a successfully fetched response.
   * 2. Evict the object and check that its SQL row survives the new activation.
   * 3. Fetch again and prove that retained data does not serve the request.
   */
  it("preserves retained responses across eviction while still fetching upstream", async () => {
    const api = new LibraryApi({ ...env, GITHUB_TOKEN: "github-test-token" });
    const repo = {
      name: "qrk.sh",
      description: null,
      stargazers_count: 8,
      forks_count: 1,
      language: "TypeScript",
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(repo));
    const stub = env.BACKEND_REPO.getByName("global");

    // 1. Retain a successfully fetched response.
    expect(await api.getGitHubRepo("https://github.com/morgs32/qrk.sh")).toEqual({
      _tag: "Right",
      right: repo,
    });

    // 2. Evict the object and check storage after the new activation.
    await evictDurableObject(stub);
    expect((await stub.ready()).result._tag).toBe("Success");
    const rows = await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql.exec("SELECT key, payload FROM responses").toArray(),
    );
    expect(rows).toEqual([
      { key: "github-repo:https://github.com/morgs32/qrk.sh", payload: JSON.stringify(repo) },
    ]);

    // 3. Fetch again, receiving the provider failure instead of the retained row.
    fetchSpy.mockResolvedValueOnce(new Response("Not found", { status: 404 }));
    expect(await api.getGitHubRepo("https://github.com/morgs32/qrk.sh")).toEqual({
      _tag: "Left",
      left: { code: "repo-unavailable", message: "GitHub repository was not found" },
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const remainingRows = await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql.exec("SELECT key, payload FROM responses").toArray(),
    );
    expect(remainingRows).toEqual(rows);
  });

  it("returns fetched data and logs a typed retention failure", async () => {
    const api = new LibraryApi({ ...env, GITHUB_TOKEN: "github-test-token" });
    const repo = {
      name: "qrk.sh",
      description: null,
      stargazers_count: 8,
      forks_count: 1,
      language: "TypeScript",
    };
    const stub = env.BACKEND_REPO.getByName("global");
    const failure = await stub.storeResponse({ key: "invalid-json", payload: undefined });
    expect(failure.result._tag).toBe("Failure");
    vi.spyOn(BackendRepo.prototype, "storeResponse").mockResolvedValueOnce(failure);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(repo));
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await api.getGitHubRepo("https://github.com/morgs32/qrk.sh")).toEqual({
      _tag: "Right",
      right: repo,
    });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("backend-response-retention-failed"),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("backend-response-store-failed"));
    const rows = await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql.exec("SELECT key, payload FROM responses").toArray(),
    );
    expect(rows).toEqual([]);
  });

  it("returns fetched data and logs a rejected retention transport", async () => {
    const api = new LibraryApi({ ...env, GITHUB_TOKEN: "github-test-token" });
    const repo = {
      name: "qrk.sh",
      description: null,
      stargazers_count: 8,
      forks_count: 1,
      language: "TypeScript",
    };
    const stub = env.BACKEND_REPO.getByName("global");
    vi.spyOn(BackendRepo, "getRepo").mockReturnValueOnce(
      Effect.succeed(
        new Proxy(stub, {
          get(target, property, receiver) {
            if (property === "storeResponse") {
              return () => Promise.reject(new Error("transport unavailable"));
            }
            return Reflect.get(target, property, receiver);
          },
        }),
      ),
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(repo));
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await api.getGitHubRepo("https://github.com/morgs32/qrk.sh")).toEqual({
      _tag: "Right",
      right: repo,
    });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("backend-response-retention-failed"),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("transport unavailable"));
    const rows = await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql.exec("SELECT key, payload FROM responses").toArray(),
    );
    expect(rows).toEqual([]);
  });

  /**
   * 1. Pause the retention RPC after the successful provider fetch.
   * 2. Check that the API result is still pending.
   * 3. Complete retention and receive the fetched response.
   */
  it("waits for the retention attempt before returning fetched data", async () => {
    const api = new LibraryApi({ ...env, GITHUB_TOKEN: "github-test-token" });
    const repo = {
      name: "qrk.sh",
      description: null,
      stargazers_count: 8,
      forks_count: 1,
      language: "TypeScript",
    };
    const stub = env.BACKEND_REPO.getByName("global");
    const enteredRetention = Promise.withResolvers<void>();
    const finishRetention = Promise.withResolvers<void>();
    vi.spyOn(BackendRepo, "getRepo").mockReturnValueOnce(
      Effect.succeed(
        new Proxy(stub, {
          get(target, property, receiver) {
            if (property === "storeResponse") {
              return async (props: Parameters<BackendRepo["storeResponse"]>[0]) => {
                const { key, payload } = props;
                enteredRetention.resolve();
                await finishRetention.promise;
                return target.storeResponse({ key, payload });
              };
            }
            return Reflect.get(target, property, receiver);
          },
        }),
      ),
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(repo));

    // 1. Pause the retention RPC after fetching upstream.
    let settled = false;
    const request = api.getGitHubRepo("https://github.com/morgs32/qrk.sh").then((result) => {
      settled = true;
      return result;
    });
    await enteredRetention.promise;

    // 2. The provider succeeded, but retention still owns completion.
    expect(settled).toBe(false);

    // 3. Complete retention before returning the provider response.
    finishRetention.resolve();
    expect(await request).toEqual({ _tag: "Right", right: repo });
    const rows = await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql.exec("SELECT key, payload FROM responses").toArray(),
    );
    expect(rows).toEqual([
      { key: "github-repo:https://github.com/morgs32/qrk.sh", payload: JSON.stringify(repo) },
    ]);
  });

  /**
   * 1. Start two requests for the same key, holding both provider responses.
   * 2. Finish the second request first and check its committed response.
   * 3. Finish the first request last and check that the final write wins.
   */
  it("uses completion order for overlapping requests to the same response key", async () => {
    const api = new LibraryApi({ ...env, GITHUB_TOKEN: "github-test-token" });
    const firstRepo = {
      name: "qrk.sh",
      description: "First request",
      stargazers_count: 4,
      forks_count: 1,
      language: "TypeScript",
    };
    const secondRepo = { ...firstRepo, description: "Second request", stargazers_count: 8 };
    const firstFetch = Promise.withResolvers<Response>();
    const secondFetch = Promise.withResolvers<Response>();
    const firstStarted = Promise.withResolvers<void>();
    const secondStarted = Promise.withResolvers<void>();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(() => {
        firstStarted.resolve();
        return firstFetch.promise;
      })
      .mockImplementationOnce(() => {
        secondStarted.resolve();
        return secondFetch.promise;
      });
    const stub = env.BACKEND_REPO.getByName("global");

    // 1. Hold both provider requests with deterministic barriers.
    const first = api.getGitHubRepo("https://github.com/morgs32/qrk.sh");
    await firstStarted.promise;
    const second = api.getGitHubRepo("https://github.com/morgs32/qrk.sh");
    await secondStarted.promise;
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // 2. Complete the second request first.
    secondFetch.resolve(Response.json(secondRepo));
    expect(await second).toEqual({ _tag: "Right", right: secondRepo });
    const intermediateRows = await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql.exec("SELECT key, payload FROM responses").toArray(),
    );
    expect(intermediateRows).toEqual([
      { key: "github-repo:https://github.com/morgs32/qrk.sh", payload: JSON.stringify(secondRepo) },
    ]);

    // 3. The first request completes and writes last.
    firstFetch.resolve(Response.json(firstRepo));
    expect(await first).toEqual({ _tag: "Right", right: firstRepo });
    const finalRows = await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql.exec("SELECT key, payload FROM responses").toArray(),
    );
    expect(finalRows).toEqual([
      { key: "github-repo:https://github.com/morgs32/qrk.sh", payload: JSON.stringify(firstRepo) },
    ]);
  });
});
