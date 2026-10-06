import { env } from "cloudflare:workers";
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { encodeRpc } from "./modules/encodeRpc";
import { normalizeInstagramUrl } from "./modules/instagram/normalizeInstagramUrl";
import { parseInstagramPayload } from "./modules/instagram/scrapeInstagram";

const browserFixture = vi.hoisted(() => ({
  payloadText: "",
  pageUrl: "https://www.instagram.com/theonion",
  navigationOk: true,
  closeCount: 0,
  titleCalls: 0,
}));

vi.mock("@cloudflare/puppeteer", () => ({
  default: {
    launch: async () => ({
      connected: true,
      on: () => undefined,
      newPage: async () => ({
        goto: async () => ({ ok: () => browserFixture.navigationOk }),
        url: () => browserFixture.pageUrl,
        title: async () => {
          browserFixture.titleCalls += 1;
          return "Login and Challenge Studio (@theonion)";
        },
        evaluate: async () => browserFixture.payloadText,
        close: async () => {
          browserFixture.closeCount += 1;
        },
      }),
    }),
  },
}));

const publicProfile = {
  username: "theonion",
  profile_pic_url: "https://images.test/avatar.jpg",
  follower_count: 5_302_658,
  is_private: false,
  is_unpublished: false,
};

beforeEach(() => {
  browserFixture.payloadText = JSON.stringify({
    followersText: "5M",
    profiles: [publicProfile, { polaris_ordered_timeline_connection: { edges: [] } }],
  });
  browserFixture.pageUrl = "https://www.instagram.com/theonion";
  browserFixture.navigationOk = true;
  browserFixture.closeCount = 0;
  browserFixture.titleCalls = 0;
});

describe("Instagram scrape boundaries", () => {
  it.each([
    "https://www.instagram.com/TheOnion/",
    " https://instagram.com/TheOnion/?source=profile#posts ",
  ])("canonicalizes the public profile URL %s", async (url) => {
    expect(await Effect.runPromise(normalizeInstagramUrl(url))).toBe(
      "https://www.instagram.com/theonion",
    );
  });

  it.each([
    "theonion",
    "http://www.instagram.com/theonion",
    "https://example.com/theonion",
    "https://www.instagram.com/theonion/posts",
    "https://user:password@www.instagram.com/theonion",
    "https://www.instagram.com:8443/theonion",
    "https://www.instagram.com/invalid-name",
  ])("rejects an unsupported profile URL %s", async (url) => {
    expect(await Effect.runPromise(normalizeInstagramUrl(url).pipe(encodeRpc))).toMatchObject({
      _tag: "Left",
      left: { code: "invalid-scrape-request" },
    });
  });

  it.each([0, 1, 4])(
    "accepts an ordered array of %i images and only profile fields",
    async (count) => {
      const postImageUrls = Array.from(
        { length: count },
        (_, index) => `https://images.test/post-${index}.jpg`,
      );
      const payload = {
        username: "TheOnion",
        followersText: "5M",
        profileImageUrl: "https://images.test/avatar.jpg",
        postImageUrls,
      };
      expect(
        await Effect.runPromise(
          parseInstagramPayload({
            username: "theonion",
            payload: { ...payload, unrelated: "discarded" },
          }),
        ),
      ).toEqual(payload);
    },
  );

  it.each([
    {
      username: "theonion",
      followersText: "5M",
      profileImageUrl: "https://images.test/avatar.jpg",
      postImageUrl1: "https://images.test/legacy.jpg",
    },
    {
      username: "theonion",
      followersText: "5M",
      profileImageUrl: "https://images.test/avatar.jpg",
      postImageUrls: Array.from({ length: 5 }, (_, index) => `https://images.test/${index}.jpg`),
    },
    {
      username: "theonion",
      followersText: "",
      profileImageUrl: "https://images.test/avatar.jpg",
      postImageUrls: [],
    },
    {
      username: "theonion",
      followersText: "5M",
      profileImageUrl: "",
      postImageUrls: [],
    },
    {
      username: "theonion",
      followersText: "5M",
      profileImageUrl: "https://images.test/avatar.jpg",
      postImageUrls: [""],
    },
  ])("rejects incomplete, excessive, or legacy image data", async (payload) => {
    expect(
      await Effect.runPromise(
        parseInstagramPayload({ username: "theonion", payload }).pipe(encodeRpc),
      ),
    ).toMatchObject({
      _tag: "Left",
      left: { code: "unsupported-page-shape" },
    });
  });

  it("rejects another profile's otherwise valid card", async () => {
    expect(
      await Effect.runPromise(
        parseInstagramPayload({
          username: "theonion",
          payload: {
            username: "instagram",
            followersText: "1M",
            profileImageUrl: "https://images.test/avatar.jpg",
            postImageUrls: [],
          },
        }).pipe(encodeRpc),
      ),
    ).toMatchObject({
      _tag: "Left",
      left: { code: "profile-identity-mismatch" },
    });
  });
});

describe("BrowserHost Instagram public-page parsing", () => {
  it.each([0, 1, 2, 3, 4])("extracts %i ordered post images", async (count) => {
    const postImageUrls = Array.from(
      { length: count },
      (_, index) => `https://images.test/post-${index}.jpg`,
    );
    browserFixture.payloadText = JSON.stringify({
      followersText: "5M",
      profiles: [
        publicProfile,
        {
          polaris_ordered_timeline_connection: {
            edges: postImageUrls.map((display_uri) => ({ node: { display_uri } })),
          },
        },
      ],
    });
    const result = await env.BROWSER_HOST.getByName("scraper-boundary").scrapeInstagram(
      "https://www.instagram.com/theonion",
    );
    expect(result._tag).toBe("Right");
    if (result._tag !== "Right") throw new Error("Public profile scrape failed");
    expect(JSON.parse(result.right)).toEqual({
      username: "theonion",
      profileImageUrl: publicProfile.profile_pic_url,
      followersText: "5M",
      postImageUrls,
    });
    expect(browserFixture.closeCount).toBe(1);
    expect(browserFixture.titleCalls).toBe(0);
  });

  it("skips explicit unsupported images and null partial feeds, keeping four supported images in order", async () => {
    const postImageUrls = Array.from(
      { length: 5 },
      (_, index) => `https://images.test/post-${index}.jpg`,
    );
    browserFixture.payloadText = JSON.stringify({
      followersText: "5M",
      profiles: [
        { ...publicProfile, polaris_ordered_timeline_connection: null },
        {
          polaris_ordered_timeline_connection: {
            edges: [
              { node: { display_uri: null } },
              ...postImageUrls.map((display_uri) => ({ node: { display_uri } })),
            ],
          },
        },
      ],
    });
    const result = await env.BROWSER_HOST.getByName("scraper-boundary").scrapeInstagram(
      "https://www.instagram.com/theonion",
    );
    expect(result._tag).toBe("Right");
    if (result._tag !== "Right") throw new Error("Public profile scrape failed");
    expect(JSON.parse(result.right).postImageUrls).toEqual(postImageUrls.slice(0, 4));
    expect(browserFixture.closeCount).toBe(1);
  });

  it.each([
    { edges: [{ node: {} }] },
    { edges: [{ node: { display_uri: "" } }] },
    { edges: [{ node: { display_uri: 123 } }] },
    { edges: "malformed" },
  ])("rejects a malformed public timeline", async (timeline) => {
    browserFixture.payloadText = JSON.stringify({
      followersText: "5M",
      profiles: [publicProfile, { polaris_ordered_timeline_connection: timeline }],
    });
    expect(
      await env.BROWSER_HOST.getByName("scraper-boundary").scrapeInstagram(
        "https://www.instagram.com/theonion",
      ),
    ).toMatchObject({ _tag: "Left", left: { code: "unsupported-page-shape" } });
    expect(browserFixture.closeCount).toBe(1);
  });

  it.each([
    "https://www.instagram.com/accounts/login/?next=%2Ftheonion%2F",
    "https://www.instagram.com/challenge/123/",
  ])("rejects an actual unavailable-page redirect %s", async (pageUrl) => {
    browserFixture.pageUrl = pageUrl;
    expect(
      await env.BROWSER_HOST.getByName("scraper-boundary").scrapeInstagram(
        "https://www.instagram.com/theonion",
      ),
    ).toMatchObject({ _tag: "Left", left: { code: "profile-unavailable" } });
    expect(browserFixture.closeCount).toBe(1);
  });

  it("rejects unsuccessful navigation", async () => {
    browserFixture.navigationOk = false;
    expect(
      await env.BROWSER_HOST.getByName("scraper-boundary").scrapeInstagram(
        "https://www.instagram.com/theonion",
      ),
    ).toMatchObject({ _tag: "Left", left: { code: "profile-unavailable" } });
    expect(browserFixture.closeCount).toBe(1);
  });

  it("rejects a private profile's public card", async () => {
    browserFixture.payloadText = JSON.stringify({
      followersText: "5M",
      profiles: [
        { ...publicProfile, is_private: true },
        { polaris_ordered_timeline_connection: { edges: [] } },
      ],
    });
    expect(
      await env.BROWSER_HOST.getByName("scraper-boundary").scrapeInstagram(
        "https://www.instagram.com/theonion",
      ),
    ).toMatchObject({ _tag: "Left", left: { code: "profile-unavailable" } });
  });

  it("rejects a public page whose profile identity does not match", async () => {
    browserFixture.payloadText = JSON.stringify({
      followersText: "5M",
      profiles: [
        { ...publicProfile, username: "other-profile" },
        { polaris_ordered_timeline_connection: { edges: [] } },
      ],
    });
    expect(
      await env.BROWSER_HOST.getByName("scraper-boundary").scrapeInstagram(
        "https://www.instagram.com/theonion",
      ),
    ).toMatchObject({ _tag: "Left", left: { code: "profile-identity-mismatch" } });
  });
});
