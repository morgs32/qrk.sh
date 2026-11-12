import { Effect, Fiber } from "effect";

import { resolveSpotifyLink } from "./resolveSpotifyLink";

afterEach(() => vi.restoreAllMocks());

it("normalizes direct content links without a network request", () =>
  Effect.runPromise(Effect.gen(function* () {
    const fetch = vi.spyOn(globalThis, "fetch");
    for (const kind of ["track", "album", "playlist", "artist", "show", "episode"]) {
      expect(
        yield* resolveSpotifyLink({ url: `https://open.spotify.com/intl-us/${kind}/abc123?si=x` }),
      ).toBe(`https://open.spotify.com/${kind}/abc123`);
    }
    expect(fetch).not.toHaveBeenCalled();
  })),
);

it("resolves an allowed short link and refuses an unsafe redirect", () =>
  Effect.runPromise(Effect.gen(function* () {
    const fetch = vi.spyOn(globalThis, "fetch");
    fetch.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "https://spotify.app.link/next" } }),
    );
    fetch.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "https://open.spotify.com/playlist/abc123?si=x" },
      }),
    );
    expect(yield* resolveSpotifyLink({ url: "https://spotify.link/abc" })).toBe(
      "https://open.spotify.com/playlist/abc123",
    );
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
    expect(fetch.mock.calls[1]?.[0]).toBe("https://spotify.app.link/next");

    fetch.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "https://example.com/track/abc123" } }),
    );
    expect(
      yield* resolveSpotifyLink({ url: "https://spotify.link/unsafe" }).pipe(Effect.flip),
    ).toMatchObject({ code: "invalid-scrape-request" });
    expect(fetch).toHaveBeenCalledTimes(3);
  })),
);

it("rejects invalid input, failed lookups, and redirect loops", () =>
  Effect.runPromise(Effect.gen(function* () {
    const fetch = vi.spyOn(globalThis, "fetch");
    expect(
      yield* resolveSpotifyLink({ url: "https://user@spotify.link/abc" }).pipe(Effect.flip),
    ).toMatchObject({ code: "invalid-scrape-request" });
    for (const url of [
      "http://open.spotify.com/track/abc",
      "https://open.spotify.com.evil.example/track/abc",
      "https://user@open.spotify.com/track/abc",
      "https://open.spotify.com/track/abc/extra",
      "https://spotify.link/extra/abc",
    ]) {
      expect(yield* resolveSpotifyLink({ url }).pipe(Effect.flip)).toMatchObject({
        code: "invalid-scrape-request",
      });
    }
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
    expect(yield* resolveSpotifyLink({ url: "https://spotify.link/abc" }).pipe(Effect.flip)).toMatchObject({
      code: "scrape-transient-failure",
      retryable: true,
    });
    fetch.mockImplementation(async () =>
      new Response(null, { status: 302, headers: { location: "https://spotify.link/abc" } }),
    );
    expect(yield* resolveSpotifyLink({ url: "https://spotify.link/abc" }).pipe(Effect.flip)).toMatchObject({
      code: "link-unavailable",
    });
    expect(fetch).toHaveBeenCalledTimes(5);
  })),
);

it("interrupts an in-flight lookup", () =>
  Effect.runPromise(Effect.gen(function* () {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        }),
    );
    const fiber = yield* Effect.forkChild(resolveSpotifyLink({ url: "https://spotify.link/abc" }));
    yield* Effect.yieldNow;
    yield* Fiber.interrupt(fiber);
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  })),
);
