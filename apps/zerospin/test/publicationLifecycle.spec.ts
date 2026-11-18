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

import { getReferencedAssetIds } from "../src/fresh/getReferencedAssetIds";
import { system } from "../src/system";
import { assetsV1 } from "../src/services/assets/assetsV1";

it.effect("publishes, unpublishes, and republishes the current saved Page snapshot", () =>
  Effect.gen(function* () {
    const harness = yield* makeSystemHarness({ system });
    const release = system.aggregates.user.releases[system.aggregates.user.canonical];
    const db = makeQueryDbVersion({ models: release.models });
    const owner = { release, aggregateId: "acct_publication" };
    yield* harness.push({
      kind: "system",
      id: "cmd_publication_user",
      commandName: "createUser",
      contractVersion: release.system.createUser.version,
      aggregateName: "user",
      aggregateVersion: release.version,
      aggregateId: owner.aggregateId,
      externalOutcome: null,
      payload: { id: "usr_publication", clerkUserId: "user_publication", displayName: null },
    });
    const actor = {
      kind: "actor" as const,
      actorName: "web",
      actorVersion: release.actors.web.version,
      aggregateName: "user",
      aggregateVersion: release.version,
      aggregateId: owner.aggregateId,
      nodeId: "node_publication",
      sessionName: "userSession",
      externalOutcome: null,
      claims: { aggregateId: owner.aggregateId, clerkUserId: "user_publication" },
    };
    yield* harness.push({
      ...actor,
      id: "cmd_publication_site",
      pushIndex: 1,
      commandName: "createSite",
      contractVersion: release.actors.web.contracts.createSite.version,
      payload: {
        id: "sit_publication",
        userId: "usr_publication",
        slug: "portfolio",
        name: null,
        description: null,
      },
    });
    yield* harness.push({
      ...actor,
      id: "cmd_publication_page",
      pushIndex: 2,
      commandName: "createPage",
      contractVersion: release.actors.web.contracts.createPage.version,
      payload: {
        id: "pag_publication",
        siteId: "sit_publication",
        slug: null,
        title: "First",
        description: null,
      },
    });
    yield* harness.flush();
    const image = {
      imageUrl: "ast_publication",
      altText: "Photo",
      caption: "",
      crop: null,
      round: false,
    };
    yield* harness.push({
      ...actor,
      id: "cmd_publication_image",
      pushIndex: 3,
      commandName: "addImageBrick",
      contractVersion: release.actors.web.contracts.addImageBrick.version,
      payload: {
        brickId: "brk_publication",
        pageId: "pag_publication",
        layoutId: "default",
        state: image,
        target: { kind: "wall", wallId: "wal_pag_publication_lg", beforeSectionId: null },
      },
    });
    const externalSlide = {
      id: "external",
      imageUrl: "https://example.com/ast_unmanaged",
      alt: "External photo",
      crop: null,
    };
    yield* harness.push({
      ...actor,
      id: "cmd_publication_carousel",
      pushIndex: 4,
      commandName: "addImageCarouselBrick",
      contractVersion: release.actors.web.contracts.addImageCarouselBrick.version,
      payload: {
        brickId: "brk_carousel",
        pageId: "pag_publication",
        state: {
          slides: [
            { ...externalSlide, id: "duplicate", imageUrl: "ast_publication" },
            { ...externalSlide, id: "managed", imageUrl: "ast_carousel" },
            externalSlide,
          ],
          interval: 5,
        },
        target: { kind: "wall", wallId: "wal_pag_publication_sm", beforeSectionId: null },
      },
    });
    yield* harness.flush();
    yield* harness.push({
      ...actor,
      id: "cmd_publish_first",
      pushIndex: 5,
      commandName: "publishSite",
      contractVersion: release.actors.web.contracts.publishSite.version,
      payload: {
        siteId: "sit_publication",
        preferredRowSizing: true,
        preferredStackSizing: true,
        pages: [{ pageId: "pag_publication", snapshotId: "psn_first" }],
      },
    });
    yield* harness.flush();
    expect(
      yield* harness.query(
        owner,
        db.query.site.findFirst({ where: { id: { eq: "sit_publication" } } }),
      ),
    ).toMatchObject({ isPublished: true });
    expect(
      yield* harness.query(
        owner,
        db.query.page.findFirst({ where: { id: { eq: "pag_publication" } } }),
      ),
    ).toMatchObject({ isPublished: true, publishedSnapshotId: "psn_first" });
    const firstPublishedAssets = db.query.pageSnapshot.findFirst({
      columns: { referencedAssetIds: true },
      where: {
        id: { eq: "psn_first" },
        page: {
          id: { eq: "pag_publication" },
          publishedSnapshotId: { eq: "psn_first" },
          isPublished: { eq: true },
          site: { isPublished: { eq: true }, user: { clerkUserId: { eq: "user_publication" } } },
        },
      },
    });
    expect(yield* harness.query(owner, firstPublishedAssets)).toEqual({
      referencedAssetIds: ["ast_carousel", "ast_publication"],
    });

    yield* harness.push({
      ...actor,
      id: "cmd_edit_page",
      pushIndex: 6,
      commandName: "updatePageSettings",
      contractVersion: release.actors.web.contracts.updatePageSettings.version,
      payload: { id: "pag_publication", title: "Second", description: null },
    });
    yield* harness.push({
      ...actor,
      id: "cmd_replace_publication_image",
      pushIndex: 7,
      commandName: "updateImageBrick",
      contractVersion: release.actors.web.contracts.updateImageBrick.version,
      payload: { brickId: "brk_publication", state: { ...image, imageUrl: "https://example.com/new.png" } },
    });
    yield* harness.push({
      ...actor,
      id: "cmd_replace_publication_carousel",
      pushIndex: 8,
      commandName: "updateImageCarouselBrick",
      contractVersion: release.actors.web.contracts.updateImageCarouselBrick.version,
      payload: { brickId: "brk_carousel", state: { slides: [externalSlide], interval: 5 } },
    });
    yield* harness.flush();
    const firstSnapshot = yield* harness.query(
      owner,
      db.query.pageSnapshot.findFirst({ where: { id: { eq: "psn_first" } } }),
    );
    expect(firstSnapshot).toMatchObject({
      referencedAssetIds: ["ast_carousel", "ast_publication"],
      content: {
        title: "First",
        bricks: expect.arrayContaining([
          expect.objectContaining({ id: "brk_publication", brickState: image }),
        ]),
      },
    });
    if (firstSnapshot === undefined) throw new Error("Expected a published snapshot");
    expect(
      getReferencedAssetIds({
        ...firstSnapshot.content,
        bricks: [
          ...firstSnapshot.content.bricks,
          {
            id: "brk_unplaced",
            moduleId: "image",
            brickState: { ...image, imageUrl: "ast_unplaced" },
            borderWidth: 0,
          },
        ],
      }),
    ).toEqual(["ast_carousel", "ast_publication"]);
    yield* harness.push({
      ...actor,
      id: "cmd_publish_update",
      pushIndex: 9,
      commandName: "publishPage",
      contractVersion: release.actors.web.contracts.publishPage.version,
      payload: {
        pageId: "pag_publication",
        snapshotId: "psn_second",
        preferredRowSizing: true,
        preferredStackSizing: true,
      },
    });
    yield* harness.flush();
    expect(yield* harness.query(owner, firstPublishedAssets)).toBeUndefined();

    yield* harness.push({
      ...actor,
      id: "cmd_unpublish",
      pushIndex: 10,
      commandName: "unpublishSite",
      contractVersion: release.actors.web.contracts.unpublishSite.version,
      payload: { siteId: "sit_publication" },
    });
    yield* harness.flush();
    expect(
      yield* harness.query(
        owner,
        db.query.site.findFirst({ where: { id: { eq: "sit_publication" } } }),
      ),
    ).toMatchObject({ isPublished: false });
    expect(
      yield* harness.query(
        owner,
        db.query.page.findFirst({ where: { id: { eq: "pag_publication" } } }),
      ),
    ).toMatchObject({ isPublished: true, publishedSnapshotId: "psn_second" });
    const rejected = yield* harness
      .push({
        ...actor,
        id: "cmd_publish_while_unpublished",
        pushIndex: 11,
        commandName: "publishPage",
        contractVersion: release.actors.web.contracts.publishPage.version,
        payload: {
          pageId: "pag_publication",
          snapshotId: "psn_rejected",
          preferredRowSizing: true,
          preferredStackSizing: true,
        },
      })
      .pipe(Effect.flip);
    expect(rejected).toMatchObject({ code: "publish-page-unavailable" });

    yield* harness.flush();
    yield* harness.push({
      ...actor,
      id: "cmd_republish_site",
      pushIndex: 12,
      commandName: "publishSite",
      contractVersion: release.actors.web.contracts.publishSite.version,
      payload: {
        siteId: "sit_publication",
        preferredRowSizing: true,
        preferredStackSizing: true,
        pages: [{ pageId: "pag_publication", snapshotId: "psn_third" }],
      },
    });
    yield* harness.flush();
    expect(
      yield* harness.query(
        owner,
        db.query.site.findFirst({ where: { id: { eq: "sit_publication" } } }),
      ),
    ).toMatchObject({ isPublished: true });
    expect(
      yield* harness.query(
        owner,
        db.query.page.findFirst({ where: { id: { eq: "pag_publication" } } }),
      ),
    ).toMatchObject({ isPublished: true, publishedSnapshotId: "psn_third" });
    const snapshots = yield* harness.query(
      owner,
      db.query.pageSnapshot.findMany({ where: { pageId: { eq: "pag_publication" } } }),
    );
    expect(
      snapshots
        .map((snapshot) => [snapshot.id, snapshot.content.title, snapshot.referencedAssetIds])
        .sort(),
    ).toEqual([
      ["psn_first", "First", ["ast_carousel", "ast_publication"]],
      ["psn_second", "Second", []],
      ["psn_third", "Second", []],
    ]);
    expect(snapshots.find((snapshot) => snapshot.id === "psn_third")?.content.bricks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "brk_publication",
          brickState: { ...image, imageUrl: "https://example.com/new.png" },
        }),
      ]),
    );
  }).pipe(Effect.provide(NanoIdFactory)),
);

it.effect("preserves an immutable Asset reservation through retries and readiness", () =>
  Effect.gen(function* () {
    const harness = yield* makeSystemHarness({ system });
    const db = makeQueryDbVersion({ models: assetsV1.models });
    const assetId = "ast_publication";
    const reservation = {
      kind: "system",
      commandName: "reserveAsset",
      serviceName: "assets",
      serviceVersion: 1,
      contractVersion: 1,
      externalOutcome: null,
      payload: {
        assetId,
        ownerAggregateId: "user_publication",
        uploadSiteId: "sit_publication",
        objectKey: `creator/${assetId}`,
        contentType: "image/png",
        size: 120,
        sha256: "a".repeat(64),
      },
    } as const;
    const current = db.query.asset.findFirst({ where: { id: { eq: assetId } } });
    yield* harness.push({ ...reservation, id: "cmd_reserve_publication" });
    yield* harness.flush();
    expect(yield* harness.query({ release: assetsV1 }, current)).toMatchObject({ ready: false });

    yield* harness.push({
      kind: "system",
      id: "cmd_ready_publication",
      commandName: "markAssetReady",
      serviceName: "assets",
      serviceVersion: 1,
      contractVersion: 1,
      externalOutcome: null,
      payload: { assetId },
    });
    yield* harness.push({ ...reservation, id: "cmd_retry_publication" });
    yield* harness.flush();
    const conflict = yield* harness.push({
      ...reservation,
      id: "cmd_conflict_publication",
      payload: { ...reservation.payload, sha256: "b".repeat(64) },
    }).pipe(Effect.flip);
    expect(conflict).toMatchObject({ code: "asset-reservation-conflict" });
    expect(yield* harness.query({ release: assetsV1 }, current)).toMatchObject({
      id: assetId,
      sha256: reservation.payload.sha256,
      ready: true,
    });
  }).pipe(Effect.provide(NanoIdFactory)),
);
