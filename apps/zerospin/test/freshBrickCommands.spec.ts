import { vi } from "vitest";
vi.mock("cloudflare:workers", () => ({
  env: {
    ZEROSPIN_API_URL: "https://zerospin.qrk.localhost",
    ZEROSPIN_SECRET_KEY: "test-only-secret",
  },
}));
vi.mock("@zerospin/core/utils/getSystemApi/getSystemApi", async () => {
  const { Effect } = await import("effect");
  return {
    getSystemApi: () =>
      Effect.succeed({ executeServiceQuery: () => Effect.succeed({ username: "testuser" }) }),
  };
});
import { expect, it } from "@effect/vitest";
import { makeQueryDbVersion, NanoIdFactory } from "@zerospin/sdk";
import { makeSystemHarness } from "@zerospin/sdk/testing";
import { Effect } from "effect";
import { userAggregateV1 } from "../src/fresh/userAggregateV1";
import { system } from "../src/system";

const cases = [
  {
    moduleId: "article",
    add: "addArticleBrick",
    update: "updateArticleBrick",
    state: { title: "Title", subtitle: "Subtitle", content: "Content" },
  },
  {
    moduleId: "behance",
    add: "addBehanceBrick",
    update: "updateBehanceBrick",
    state: {
      payload: { url: "https://www.behance.net/example" },
      data: {
        displayName: "Studio",
        projects: [
          {
            id: "123",
            title: "Identity",
            url: "https://www.behance.net/gallery/123/Identity",
            coverUrl: "https://mir-s3-cdn-cf.behance.net/projects/808/example.jpg",
          },
        ],
      },
    },
  },
  {
    moduleId: "buy-me-a-coffee",
    add: "addBuyMeACoffeeBrick",
    update: "updateBuyMeACoffeeBrick",
    state: { payload: { url: "https://buymeacoffee.com/example", message: "Thanks" } },
  },
  {
    moduleId: "figma-thumbnail",
    add: "addFigmaThumbnailBrick",
    update: "updateFigmaThumbnailBrick",
    state: {
      payload: { url: "https://www.figma.com/design/Abcdefghijklmnopqrstuv" },
      data: {
        title: "Design",
        url: "https://www.figma.com/design/Abcdefghijklmnopqrstuv",
        thumbnail_url: null,
        thumbnail_width: null,
        thumbnail_height: null,
      },
    },
  },
  {
    moduleId: "github-activity",
    add: "addGithubActivityBrick",
    update: "updateGithubActivityBrick",
    state: {
      payload: { url: "https://github.com/octocat" },
      data: { contributions: [{ date: "2026-11-13", count: 1, level: 1 }] },
    },
  },
  {
    moduleId: "github-profile",
    add: "addGithubProfileBrick",
    update: "updateGithubProfileBrick",
    state: {
      payload: { url: "https://github.com/octocat" },
      data: {
        login: "octocat",
        avatar_url: "https://github.com/octocat.png",
        name: "Octocat",
        bio: null,
        location: null,
        blog: "",
        public_repos: 1,
        followers: 2,
        following: 3,
      },
    },
  },
  {
    moduleId: "github-repo",
    add: "addGithubRepoBrick",
    update: "updateGithubRepoBrick",
    state: {
      payload: { url: "https://github.com/octocat/hello" },
      data: {
        name: "hello",
        description: null,
        stargazers_count: 1,
        forks_count: 2,
        language: null,
      },
    },
  },
  {
    moduleId: "image",
    add: "addImageBrick",
    update: "updateImageBrick",
    state: {
      imageUrl: "https://example.com/image.png",
      altText: "Image",
      caption: "Caption",
      crop: null,
      round: false,
    },
  },
  {
    moduleId: "image-carousel",
    add: "addImageCarouselBrick",
    update: "updateImageCarouselBrick",
    state: {
      interval: 5,
      slides: [
        { id: "one", imageUrl: "https://example.com/1.png", alt: "One", crop: null },
        { id: "two", imageUrl: "https://example.com/2.png", alt: "Two", crop: null },
      ],
    },
  },
  {
    moduleId: "instagram",
    add: "addInstagramBrick",
    update: "updateInstagramBrick",
    state: {
      payload: { url: "https://www.instagram.com/theonion" },
      data: {
        username: "theonion",
        profileImageUrl: "https://example.com/a.png",
        followersText: "5M",
        postImageUrls: [],
      },
    },
  },
  {
    moduleId: "link",
    add: "addLinkBrick",
    update: "updateLinkBrick",
    state: {
      payload: { url: "https://example.com/" },
      data: {
        url: "https://example.com/",
        title: "Example",
        description: "",
        siteName: "Example",
        imageUrl: "",
        iconUrl: "",
      },
    },
  },
  {
    moduleId: "map-place",
    add: "addMapPlaceBrick",
    update: "updateMapPlaceBrick",
    state: {
      payload: { googlePlaceId: "ChIJ7cv00DwsDogRAMDACa2m4K8" },
      data: {
        googlePlaceId: "ChIJ7cv00DwsDogRAMDACa2m4K8",
        name: "Chicago",
        address: "Chicago",
        latitude: 41.8,
        longitude: -87.6,
      },
    },
  },
  {
    moduleId: "spotify",
    add: "addSpotifyBrick",
    update: "updateSpotifyBrick",
    state: { url: "https://open.spotify.com/track/1" },
  },
  {
    moduleId: "swatch-and-icon",
    add: "addSwatchAndIconBrick",
    update: "updateSwatchAndIconBrick",
    state: {
      payload: { hash: "", color: "#123456" },
      data: { name: "Circle", svg: "<svg></svg>" },
    },
  },
  {
    moduleId: "youtube",
    add: "addYoutubeBrick",
    update: "updateYoutubeBrick",
    state: {
      content: { kind: "video", videoId: "dQw4w9WgXcQ", playlistId: null, startSeconds: 0 },
    },
  },
];

it.effect("adds and updates every non-Text Brick through the fresh owner", () =>
  Effect.gen(function* () {
    const harness = yield* makeSystemHarness({ system });
    yield* harness.push({
      kind: "system",
      id: "cmd_bricks_user",
      commandName: "createUser",
      contractVersion: 1,
      aggregateName: "user",
      aggregateVersion: 1,
      aggregateId: "acct_bricks",
      externalOutcome: null,
      payload: { id: "usr_bricks", clerkUserId: "user_bricks", displayName: null },
    });
    yield* harness.flush();
    const actor = {
      kind: "actor" as const,
      actorName: "web",
      actorVersion: 1,
      contractVersion: 1,
      aggregateName: "user",
      aggregateVersion: 1,
      aggregateId: "acct_bricks",
      nodeId: "node_bricks",
      sessionName: "userSession",
      externalOutcome: null,
      claims: { aggregateId: "acct_bricks", clerkUserId: "user_bricks" },
    };
    yield* harness.push({
      ...actor,
      id: "cmd_bricks_site",
      pushIndex: 1,
      commandName: "createSite",
      payload: {
        id: "sit_bricks",
        userId: "usr_bricks",
        slug: "bricks",
        name: null,
        description: null,
      },
    });
    yield* harness.push({
      ...actor,
      id: "cmd_bricks_page",
      pushIndex: 2,
      commandName: "createPage",
      payload: {
        id: "pag_bricks",
        siteId: "sit_bricks",
        slug: null,
        title: null,
        description: null,
      },
    });
    const db = makeQueryDbVersion({ models: userAggregateV1.models });
    const owner = { release: userAggregateV1, aggregateId: "acct_bricks" };
    let pushIndex = 3;
    for (const [index, entry] of cases.entries()) {
      const brickId: `brk_${string}` = `brk_case_${index}`;
      const initialState =
        entry.moduleId === "swatch-and-icon"
          ? entry.state
          : entry.moduleId === "image"
            ? { imageUrl: "", altText: "", caption: "", crop: null, round: true }
            : null;
      yield* harness.push({
        ...actor,
        id: `cmd_add_${index}`,
        pushIndex: pushIndex++,
        commandName: entry.add,
        payload: {
          brickId,
          pageId: "pag_bricks",
          state: initialState,
          target: { kind: "wall", wallId: "wal_pag_bricks_lg", beforeSectionId: null },
          ...(entry.moduleId === "image" ? { layoutId: "captionless" } : {}),
        },
      });
      yield* harness.push({
        ...actor,
        id: `cmd_update_${index}`,
        pushIndex: pushIndex++,
        commandName: entry.update,
        payload: { brickId, state: entry.state },
      });
      yield* harness.flush();
      const brick = yield* harness.query(
        owner,
        db.query.brick.findFirst({ where: { id: { eq: brickId } } }),
      );
      expect(brick, entry.moduleId).toMatchObject({ moduleId: entry.moduleId, state: entry.state });
      const placements = yield* harness.query(
        owner,
        db.query.placement.findMany({ where: { brickId: { eq: brickId } } }),
      );
      expect(placements, entry.moduleId).toHaveLength(4);
      expect(
        placements.every(
          (placement) =>
            placement.layoutId === (entry.moduleId === "image" ? "captionless" : "default"),
        ),
      ).toBe(true);
    }

    const before = yield* harness.query(
      owner,
      db.query.wall.findFirst({ where: { id: { eq: "wal_pag_bricks_lg" } } }),
    );
    const stale = yield* harness
      .push({
        ...actor,
        id: "cmd_stale_add",
        pushIndex: pushIndex++,
        commandName: "addSpotifyBrick",
        payload: {
          brickId: "brk_stale",
          pageId: "pag_bricks",
          state: null,
          target: {
            kind: "row",
            wallId: "wal_pag_bricks_lg",
            rowId: "row_missing",
            beforePlacementId: null,
          },
        },
      })
      .pipe(Effect.flip);
    expect(stale).toMatchObject({ code: "wall-insertion-invalid" });
    expect(
      yield* harness.query(owner, db.query.brick.findFirst({ where: { id: { eq: "brk_stale" } } })),
    ).toBeUndefined();
    expect(
      yield* harness.query(
        owner,
        db.query.placement.findMany({ where: { brickId: { eq: "brk_stale" } } }),
      ),
    ).toEqual([]);
    expect(
      yield* harness.query(
        owner,
        db.query.wall.findFirst({ where: { id: { eq: "wal_pag_bricks_lg" } } }),
      ),
    ).toEqual(before);

    const invalid = yield* harness
      .push({
        ...actor,
        id: "cmd_invalid_spotify",
        pushIndex: pushIndex++,
        commandName: "updateSpotifyBrick",
        payload: { brickId: "brk_case_12", state: { url: "https://example.com/track/1" } },
      })
      .pipe(Effect.flip);
    expect(invalid).toMatchObject({ code: "encode-command-payload-failed" });
    const wrongOwner = yield* harness
      .push({
        ...actor,
        id: "cmd_wrong_owner",
        pushIndex: pushIndex++,
        commandName: "updateSpotifyBrick",
        claims: { aggregateId: "acct_bricks", clerkUserId: "user_other" },
        payload: { brickId: "brk_case_12", state: { url: "https://open.spotify.com/track/2" } },
      })
      .pipe(Effect.flip);
    expect(wrongOwner).toMatchObject({ code: "update-spotify-brick-unavailable" });
    const wrongModule = yield* harness
      .push({
        ...actor,
        id: "cmd_wrong_module",
        pushIndex: pushIndex++,
        commandName: "updateSpotifyBrick",
        payload: { brickId: "brk_case_14", state: { url: "https://open.spotify.com/track/2" } },
      })
      .pipe(Effect.flip);
    expect(wrongModule).toMatchObject({ code: "update-spotify-brick-unavailable" });
  }).pipe(Effect.provide(NanoIdFactory)),
);
