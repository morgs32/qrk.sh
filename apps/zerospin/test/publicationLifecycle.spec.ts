import { expect, it } from "@effect/vitest";
import { makeQueryDbVersion, NanoIdFactory } from "@zerospin/sdk";
import { makeSystemHarness } from "@zerospin/sdk/testing";
import { Effect } from "effect";

import { system } from "../src/system";

it.effect("publishes, unpublishes, and republishes the current saved Page snapshot", () =>
  Effect.gen(function* () {
    const harness = yield* makeSystemHarness({ system });
    const release = system.aggregates.user.releases[system.aggregates.user.canonical];
    const db = makeQueryDbVersion({ models: release.models });
    const owner = { release, aggregateId: "acct_publication" };
    yield* harness.push({
      kind: "system", id: "cmd_publication_user", commandName: "createUser",
      contractVersion: release.system.createUser.version,
      aggregateName: "user", aggregateVersion: release.version,
      aggregateId: owner.aggregateId, externalOutcome: null,
      payload: { id: "usr_publication", clerkUserId: "user_publication", username: null, displayName: null },
    });
    const actor = {
      kind: "actor" as const, actorName: "web", actorVersion: release.actors.web.version,
      aggregateName: "user", aggregateVersion: release.version, aggregateId: owner.aggregateId,
      nodeId: "node_publication", sessionName: "userSession", externalOutcome: null,
      claims: { aggregateId: owner.aggregateId, clerkUserId: "user_publication" },
    };
    yield* harness.push({
      ...actor, id: "cmd_publication_site", pushIndex: 1, commandName: "createSite",
      contractVersion: release.actors.web.contracts.createSite.version,
      payload: { id: "sit_publication", userId: "usr_publication", slug: "portfolio", name: null, description: null },
    });
    yield* harness.push({
      ...actor, id: "cmd_publication_page", pushIndex: 2, commandName: "createPage",
      contractVersion: release.actors.web.contracts.createPage.version,
      payload: { id: "pag_publication", siteId: "sit_publication", slug: null, title: "First", description: null },
    });
    yield* harness.push({
      ...actor, id: "cmd_publish_first", pushIndex: 3, commandName: "publishSite",
      contractVersion: release.actors.web.contracts.publishSite.version,
      payload: { siteId: "sit_publication", preferredRowSizing: true, preferredStackSizing: true,
        pages: [{ pageId: "pag_publication", snapshotId: "psn_first" }] },
    });
    yield* harness.flush();
    expect(yield* harness.query(owner, db.query.site.findFirst({ where: { id: { eq: "sit_publication" } } })))
      .toMatchObject({ isPublished: true });
    expect(yield* harness.query(owner, db.query.page.findFirst({ where: { id: { eq: "pag_publication" } } })))
      .toMatchObject({ isPublished: true, publishedSnapshotId: "psn_first" });

    yield* harness.push({
      ...actor, id: "cmd_edit_page", pushIndex: 4, commandName: "updatePageSettings",
      contractVersion: release.actors.web.contracts.updatePageSettings.version,
      payload: { id: "pag_publication", title: "Second", description: null },
    });
    yield* harness.flush();
    expect(yield* harness.query(owner, db.query.pageSnapshot.findFirst({ where: { id: { eq: "psn_first" } } })))
      .toMatchObject({ content: { title: "First" } });
    yield* harness.push({
      ...actor, id: "cmd_publish_update", pushIndex: 5, commandName: "publishPage",
      contractVersion: release.actors.web.contracts.publishPage.version,
      payload: { pageId: "pag_publication", snapshotId: "psn_second", preferredRowSizing: true, preferredStackSizing: true },
    });
    yield* harness.push({
      ...actor, id: "cmd_unpublish", pushIndex: 6, commandName: "unpublishSite",
      contractVersion: release.actors.web.contracts.unpublishSite.version,
      payload: { siteId: "sit_publication" },
    });
    yield* harness.flush();
    expect(yield* harness.query(owner, db.query.site.findFirst({ where: { id: { eq: "sit_publication" } } })))
      .toMatchObject({ isPublished: false });
    expect(yield* harness.query(owner, db.query.page.findFirst({ where: { id: { eq: "pag_publication" } } })))
      .toMatchObject({ isPublished: true, publishedSnapshotId: "psn_second" });
    const rejected = yield* harness.push({
      ...actor, id: "cmd_publish_while_unpublished", pushIndex: 7, commandName: "publishPage",
      contractVersion: release.actors.web.contracts.publishPage.version,
      payload: { pageId: "pag_publication", snapshotId: "psn_rejected", preferredRowSizing: true, preferredStackSizing: true },
    }).pipe(Effect.flip);
    expect(rejected).toMatchObject({ code: "publish-page-unavailable" });

    yield* harness.push({
      ...actor, id: "cmd_republish_site", pushIndex: 8, commandName: "publishSite",
      contractVersion: release.actors.web.contracts.publishSite.version,
      payload: { siteId: "sit_publication", preferredRowSizing: true, preferredStackSizing: true,
        pages: [{ pageId: "pag_publication", snapshotId: "psn_third" }] },
    });
    yield* harness.flush();
    expect(yield* harness.query(owner, db.query.site.findFirst({ where: { id: { eq: "sit_publication" } } })))
      .toMatchObject({ isPublished: true });
    expect(yield* harness.query(owner, db.query.page.findFirst({ where: { id: { eq: "pag_publication" } } })))
      .toMatchObject({ isPublished: true, publishedSnapshotId: "psn_third" });
    const snapshots = yield* harness.query(owner, db.query.pageSnapshot.findMany({ where: { pageId: { eq: "pag_publication" } } }));
    expect(snapshots.map((snapshot) => [snapshot.id, snapshot.content.title]).sort()).toEqual([
      ["psn_first", "First"], ["psn_second", "Second"], ["psn_third", "Second"],
    ]);
  }).pipe(Effect.provide(NanoIdFactory)),
);
