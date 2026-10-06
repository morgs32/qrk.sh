import { env } from "cloudflare:workers";
import { runInDurableObject, SELF } from "cloudflare:test";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BackendRepo } from "./BackendRepo";
import { BrowserHost } from "./modules/instagram/BrowserHost";
import { LibraryApi } from "./modules/LibraryApi";

const scrapedProfile = {
  username: "morgs32",
  profileImageUrl: "https://instagram-media.test/avatar.png",
  followersText: "1.2K",
  postImageUrls: [
    "https://instagram-media.test/post-1.png",
    "https://instagram-media.test/post-2.png",
    "https://instagram-media.test/post-3.png",
    "https://instagram-media.test/post-4.png",
  ],
};
const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const previousProfile = {
  username: "morgs32",
  profileImageUrl: "http://api.test/assets/instagram/previous/avatar",
  followersText: "Previous",
  postImageUrls: [],
};
const responseKey = "instagram-profile:https://www.instagram.com/morgs32";

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

describe("LibraryApi Instagram images and response retention", () => {
  it.each([0, 1, 2, 3, 4])(
    "stores an avatar and %i posts before retaining the result",
    async (count) => {
      const api = new LibraryApi(env, new Request("http://api.test/rpc"));
      const scraped = {
        ...scrapedProfile,
        postImageUrls: scrapedProfile.postImageUrls.slice(0, count),
      };
      const scrapeSpy = vi.spyOn(BrowserHost.prototype, "scrapeInstagram").mockResolvedValueOnce({
        _tag: "Right",
        right: JSON.stringify({ ...scraped, provider_extra: "discard" }),
      });
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(
          async () => new Response(imageBytes, { headers: { "Content-Type": "image/png" } }),
        );

      const result = await api.getInstagramProfile("https://instagram.com/MORGS32/?x=1#posts");

      expect(result._tag).toBe("Right");
      if (result._tag !== "Right") throw new Error("Instagram fetch failed");
      expect(result.right).toEqual({
        username: "morgs32",
        followersText: scraped.followersText,
        profileImageUrl: expect.stringMatching(
          /^http:\/\/api\.test\/assets\/instagram\/morgs32\/.+\/avatar$/,
        ),
        postImageUrls: Array.from({ length: count }, (_value, index) =>
          expect.stringMatching(
            new RegExp(`^http://api\\.test/assets/instagram/morgs32/.+/post-${index + 1}$`),
          ),
        ),
      });
      expect(scrapeSpy).toHaveBeenCalledWith("https://www.instagram.com/morgs32");
      expect(fetchSpy).toHaveBeenCalledTimes(count + 1);
      expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
        scraped.profileImageUrl,
        ...scraped.postImageUrls,
      ]);
      for (const imageUrl of [result.right.profileImageUrl, ...result.right.postImageUrls]) {
        const key = new URL(imageUrl).pathname.slice("/assets/".length);
        const object = await env.QRKSH.get(key);
        expect(object).not.toBeNull();
        if (object === null) throw new Error("Instagram image missing from R2");
        expect(object.httpMetadata?.contentType).toBe("image/png");
        expect(new Uint8Array(await object.arrayBuffer())).toEqual(imageBytes);
      }
      const assetResponse = await SELF.fetch(result.right.profileImageUrl);
      expect(assetResponse.status).toBe(200);
      expect(assetResponse.headers.get("Content-Type")).toBe("image/png");
      expect(new Uint8Array(await assetResponse.arrayBuffer())).toEqual(imageBytes);
      const rows = await runInDurableObject(
        env.BACKEND_REPO.getByName("global"),
        (_instance, state) =>
          state.storage.sql.exec("SELECT key, payload FROM responses").toArray(),
      );
      expect(rows).toEqual([{ key: responseKey, payload: JSON.stringify(result.right) }]);
    },
  );

  it("scrapes each call and keeps prior image URLs serving their original bytes", async () => {
    const api = new LibraryApi(env, new Request("http://api.test/rpc"));
    const stub = env.BACKEND_REPO.getByName("global");
    expect(
      (await stub.storeResponse({ key: responseKey, payload: previousProfile })).result._tag,
    ).toBe("Success");
    const scrapeSpy = vi.spyOn(BrowserHost.prototype, "scrapeInstagram").mockResolvedValue({
      _tag: "Right",
      right: JSON.stringify({ ...scrapedProfile, postImageUrls: [] }),
    });
    const secondBytes = new Uint8Array([255, 216, 255, 217]);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(imageBytes, { headers: { "Content-Type": "image/png" } }))
      .mockResolvedValueOnce(
        new Response(secondBytes, { headers: { "Content-Type": "image/jpeg; charset=binary" } }),
      );

    const first = await api.getInstagramProfile("https://www.instagram.com/morgs32");
    const second = await api.getInstagramProfile("https://www.instagram.com/morgs32");

    if (first._tag !== "Right" || second._tag !== "Right")
      throw new Error("Instagram fetch failed");
    expect(scrapeSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(first.right.profileImageUrl).not.toBe(second.right.profileImageUrl);
    const firstAsset = await SELF.fetch(first.right.profileImageUrl);
    const secondAsset = await SELF.fetch(second.right.profileImageUrl);
    expect(firstAsset.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await firstAsset.arrayBuffer())).toEqual(imageBytes);
    expect(secondAsset.headers.get("Content-Type")).toBe("image/jpeg; charset=binary");
    expect(new Uint8Array(await secondAsset.arrayBuffer())).toEqual(secondBytes);
    const rows = await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql.exec("SELECT key, payload FROM responses").toArray(),
    );
    expect(rows).toEqual([{ key: responseKey, payload: JSON.stringify(second.right) }]);
  });

  it.each([
    { name: "malformed JSON", payload: "{" },
    {
      name: "identity mismatch",
      payload: JSON.stringify({ ...scrapedProfile, username: "other" }),
    },
    { name: "missing avatar", payload: JSON.stringify({ ...scrapedProfile, profileImageUrl: "" }) },
    {
      name: "missing posts array",
      payload: JSON.stringify({
        username: "morgs32",
        profileImageUrl: scrapedProfile.profileImageUrl,
        followersText: "1.2K",
      }),
    },
    {
      name: "over four posts",
      payload: JSON.stringify({
        ...scrapedProfile,
        postImageUrls: [...scrapedProfile.postImageUrls, "https://instagram-media.test/post-5.png"],
      }),
    },
  ])("rejects $name without downloading images or replacing retained data", async (props) => {
    const { payload } = props;
    const api = new LibraryApi(env, new Request("http://api.test/rpc"));
    const stub = env.BACKEND_REPO.getByName("global");
    expect(
      (await stub.storeResponse({ key: responseKey, payload: previousProfile })).result._tag,
    ).toBe("Success");
    vi.spyOn(BrowserHost.prototype, "scrapeInstagram").mockResolvedValueOnce({
      _tag: "Right",
      right: payload,
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    expect((await api.getInstagramProfile("https://www.instagram.com/morgs32"))._tag).toBe("Left");

    expect(fetchSpy).not.toHaveBeenCalled();
    const rows = await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql.exec("SELECT key, payload FROM responses").toArray(),
    );
    expect(rows).toEqual([{ key: responseKey, payload: JSON.stringify(previousProfile) }]);
  });

  it.each(["typed failure", "transport rejection"])(
    "preserves retained data after a scrape %s",
    async (failure) => {
      const api = new LibraryApi(env, new Request("http://api.test/rpc"));
      const stub = env.BACKEND_REPO.getByName("global");
      expect(
        (await stub.storeResponse({ key: responseKey, payload: previousProfile })).result._tag,
      ).toBe("Success");
      const scrapeSpy = vi.spyOn(BrowserHost.prototype, "scrapeInstagram");
      if (failure === "typed failure") {
        scrapeSpy.mockResolvedValueOnce({
          _tag: "Left",
          left: { code: "profile-unavailable", message: "Unavailable profile" },
        });
      } else {
        scrapeSpy.mockRejectedValueOnce(new Error("Browser unavailable"));
      }
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      expect((await api.getInstagramProfile("https://www.instagram.com/morgs32"))._tag).toBe(
        "Left",
      );

      expect(fetchSpy).not.toHaveBeenCalled();
      const rows = await runInDurableObject(stub, (_instance, state) =>
        state.storage.sql.exec("SELECT key, payload FROM responses").toArray(),
      );
      expect(rows).toEqual([{ key: responseKey, payload: JSON.stringify(previousProfile) }]);
    },
  );

  it.each([
    {
      name: "HTTP failure",
      response: new Response(imageBytes, { status: 503, headers: { "Content-Type": "image/png" } }),
    },
    {
      name: "nonimage response",
      response: new Response("<html>Login</html>", { headers: { "Content-Type": "text/html" } }),
    },
    {
      name: "empty image",
      response: new Response(new Uint8Array(), { headers: { "Content-Type": "image/png" } }),
    },
    { name: "download rejection", response: null },
  ])("preserves retained data after $name on a later post", async (props) => {
    const { response } = props;
    const api = new LibraryApi(env, new Request("http://api.test/rpc"));
    const stub = env.BACKEND_REPO.getByName("global");
    expect(
      (await stub.storeResponse({ key: responseKey, payload: previousProfile })).result._tag,
    ).toBe("Success");
    vi.spyOn(BrowserHost.prototype, "scrapeInstagram").mockResolvedValueOnce({
      _tag: "Right",
      right: JSON.stringify({
        ...scrapedProfile,
        postImageUrls: scrapedProfile.postImageUrls.slice(0, 1),
      }),
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(imageBytes, { headers: { "Content-Type": "image/png" } }),
      );
    if (response === null) {
      fetchSpy.mockRejectedValueOnce(new Error("Download unavailable"));
    } else {
      fetchSpy.mockResolvedValueOnce(response);
    }

    expect((await api.getInstagramProfile("https://www.instagram.com/morgs32"))._tag).toBe("Left");

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const rows = await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql.exec("SELECT key, payload FROM responses").toArray(),
    );
    expect(rows).toEqual([{ key: responseKey, payload: JSON.stringify(previousProfile) }]);
  });

  it.each(["rejected write", "unwritten object"])(
    "preserves retained data after an R2 %s",
    async (failure) => {
      const bucket = new Proxy(env.QRKSH, {
        get(target, property, receiver) {
          if (property === "put") {
            return () =>
              failure === "rejected write"
                ? Promise.reject(new Error("R2 unavailable"))
                : Promise.resolve(null);
          }
          return Reflect.get(target, property, receiver);
        },
      });
      const api = new LibraryApi({ ...env, QRKSH: bucket }, new Request("http://api.test/rpc"));
      const stub = env.BACKEND_REPO.getByName("global");
      expect(
        (await stub.storeResponse({ key: responseKey, payload: previousProfile })).result._tag,
      ).toBe("Success");
      vi.spyOn(BrowserHost.prototype, "scrapeInstagram").mockResolvedValueOnce({
        _tag: "Right",
        right: JSON.stringify({ ...scrapedProfile, postImageUrls: [] }),
      });
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(imageBytes, { headers: { "Content-Type": "image/png" } }),
      );

      expect((await api.getInstagramProfile("https://www.instagram.com/morgs32"))._tag).toBe(
        "Left",
      );

      const rows = await runInDurableObject(stub, (_instance, state) =>
        state.storage.sql.exec("SELECT key, payload FROM responses").toArray(),
      );
      expect(rows).toEqual([{ key: responseKey, payload: JSON.stringify(previousProfile) }]);
    },
  );

  it.each(["typed failure", "transport rejection"])(
    "returns persisted images after a retention %s",
    async (failure) => {
      const api = new LibraryApi(env, new Request("http://api.test/rpc"));
      const stub = env.BACKEND_REPO.getByName("global");
      expect(
        (await stub.storeResponse({ key: responseKey, payload: previousProfile })).result._tag,
      ).toBe("Success");
      if (failure === "typed failure") {
        const envelope = await stub.storeResponse({ key: "invalid-json", payload: undefined });
        expect(envelope.result._tag).toBe("Failure");
        vi.spyOn(BackendRepo.prototype, "storeResponse").mockResolvedValueOnce(envelope);
      } else {
        vi.spyOn(BackendRepo, "getRepo").mockReturnValueOnce(
          Effect.succeed(
            new Proxy(stub, {
              get(target, property, receiver) {
                if (property === "storeResponse")
                  return () => Promise.reject(new Error("Retention unavailable"));
                return Reflect.get(target, property, receiver);
              },
            }),
          ),
        );
      }
      vi.spyOn(BrowserHost.prototype, "scrapeInstagram").mockResolvedValueOnce({
        _tag: "Right",
        right: JSON.stringify({ ...scrapedProfile, postImageUrls: [] }),
      });
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(imageBytes, { headers: { "Content-Type": "image/png" } }),
      );
      const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await api.getInstagramProfile("https://www.instagram.com/morgs32");

      if (result._tag !== "Right") throw new Error("Instagram fetch failed");
      const object = await env.QRKSH.get(
        new URL(result.right.profileImageUrl).pathname.slice("/assets/".length),
      );
      expect(object).not.toBeNull();
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("backend-response-retention-failed"),
      );
      const rows = await runInDurableObject(stub, (_instance, state) =>
        state.storage.sql.exec("SELECT key, payload FROM responses").toArray(),
      );
      expect(rows).toEqual([{ key: responseKey, payload: JSON.stringify(previousProfile) }]);
    },
  );

  it("waits for image persistence and the retention attempt before resolving", async () => {
    const enteredWrite = Promise.withResolvers<void>();
    const finishWrite = Promise.withResolvers<void>();
    const enteredRetention = Promise.withResolvers<void>();
    const finishRetention = Promise.withResolvers<void>();
    const bucket = new Proxy(env.QRKSH, {
      get(target, property, receiver) {
        if (property === "put") {
          return async (key: string, bytes: ArrayBuffer, options: R2PutOptions) => {
            enteredWrite.resolve();
            await finishWrite.promise;
            return target.put(key, bytes, options);
          };
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const api = new LibraryApi({ ...env, QRKSH: bucket }, new Request("http://api.test/rpc"));
    const stub = env.BACKEND_REPO.getByName("global");
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
    vi.spyOn(BrowserHost.prototype, "scrapeInstagram").mockResolvedValueOnce({
      _tag: "Right",
      right: JSON.stringify({ ...scrapedProfile, postImageUrls: [] }),
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(imageBytes, { headers: { "Content-Type": "image/png" } }),
    );
    let settled = false;
    const pending = api.getInstagramProfile("https://www.instagram.com/morgs32").then((result) => {
      settled = true;
      return result;
    });
    await enteredWrite.promise;
    expect(settled).toBe(false);
    finishWrite.resolve();
    await enteredRetention.promise;
    expect(settled).toBe(false);
    finishRetention.resolve();
    const result = await pending;
    if (result._tag !== "Right") throw new Error("Instagram fetch failed");
    const rows = await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql.exec("SELECT key, payload FROM responses").toArray(),
    );
    expect(rows).toEqual([{ key: responseKey, payload: JSON.stringify(result.right) }]);
  });
});
