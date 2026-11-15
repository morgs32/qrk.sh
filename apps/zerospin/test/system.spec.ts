import { expect, it } from "@effect/vitest";
import { makeQueryDbVersion, NanoIdFactory } from "@zerospin/sdk";
import { makeSystemHarness } from "@zerospin/sdk/testing";
import { Effect } from "effect";
import { system } from "../src/system";
import { userAggregateV1 } from "../src/fresh/userAggregateV1";

it.effect("provisions a user, validates Site settings, and publishes immutable Page snapshots", () =>
  Effect.gen(function* () {
    const harness = yield* makeSystemHarness({ system });
    yield* harness.push({
      kind: "system", id: "cmd_system_user", commandName: "createUser", contractVersion: 1,
      aggregateName: "user", aggregateVersion: 1, aggregateId: "acct_system", externalOutcome: null,
      payload: { id: "usr_system", clerkUserId: "user_system", username: null, displayName: null },
    });
    const forbidden = yield* harness.push({
      kind: "system", id: "cmd_system_site", commandName: "createSite", contractVersion: 1,
      aggregateName: "user", aggregateVersion: 1, aggregateId: "acct_system", externalOutcome: null,
      payload: { id: "sit_forbidden", userId: "usr_system", slug: "site", name: null, description: null },
    }).pipe(Effect.flip);
    expect(forbidden).toMatchObject({ code: "system-harness-command-forbidden" });
    const actor = {
      kind: "actor" as const, actorName: "web", actorVersion: 1, contractVersion: 1,
      aggregateName: "user", aggregateVersion: 1, aggregateId: "acct_system", nodeId: "node_system",
      sessionName: "userSession", externalOutcome: null, claims: { aggregateId: "acct_system", clerkUserId: "user_system" },
    };
    yield* harness.push({
      ...actor, id: "cmd_create_site", pushIndex: 1, commandName: "createSite",
      payload: { id: "sit_system", userId: "usr_system", slug: "site", name: null, description: null },
    });
    yield* harness.push({
      ...actor, id: "cmd_create_page", pushIndex: 2, commandName: "createPage",
      payload: { id: "pag_system", siteId: "sit_system", slug: null, title: "Initial", description: null },
    });
    yield* harness.flush();
    const db = makeQueryDbVersion({ models: userAggregateV1.models });
    const owner = { release: userAggregateV1, aggregateId: "acct_system" };
    expect(yield* harness.query(owner, db.query.user.findFirst({ where: { id: { eq: "usr_system" } } })))
      .toMatchObject({ clerkUserId: "user_system" });
    expect(yield* harness.query(owner, db.query.site.findFirst({ where: { id: { eq: "sit_system" } } })))
      .toMatchObject({ brickGap: 0 });
    let pushIndex = 3;
    for (const gap of [0, 12]) {
      yield* harness.push({ ...actor, id: `cmd_gap_${gap}`, pushIndex: pushIndex++, commandName: "updateSiteSettings", payload: { id: "sit_system", brickGap: gap } });
      yield* harness.flush();
      expect(yield* harness.query(owner, db.query.site.findFirst({ where: { id: { eq: "sit_system" } } })))
        .toMatchObject({ brickGap: gap });
    }
    for (const gap of [-1, 13]) {
      const rejected = yield* harness.push({ ...actor, id: `cmd_invalid_gap_${gap}`, pushIndex: pushIndex++, commandName: "updateSiteSettings", payload: { id: "sit_system", brickGap: gap } }).pipe(Effect.flip);
      expect(rejected).toMatchObject({ code: "site-brick-gap-invalid" });
    }
    const fractional = yield* harness.push({ ...actor, id: "cmd_fractional_gap", pushIndex: pushIndex++, commandName: "updateSiteSettings", payload: { id: "sit_system", brickGap: 1.5 } }).pipe(Effect.flip);
    expect(fractional).toMatchObject({ code: "encode-command-payload-failed" });
    const unavailable = yield* harness.push({
      ...actor, id: "cmd_unpublished_page", pushIndex: pushIndex++, commandName: "publishPage",
      payload: { pageId: "pag_system", snapshotId: "psn_unpublished", preferredRowSizing: true, preferredStackSizing: true },
    }).pipe(Effect.flip);
    expect(unavailable).toMatchObject({ code: "publish-page-unavailable" });
    yield* harness.push({
      ...actor, id: "cmd_publish_site", pushIndex: pushIndex++, commandName: "publishSite",
      payload: { siteId: "sit_system", preferredRowSizing: true, preferredStackSizing: true, pages: [{ pageId: "pag_system", snapshotId: "psn_first" }] },
    });
    yield* harness.push({
      ...actor, id: "cmd_republish_page", pushIndex: pushIndex++, commandName: "publishPage",
      payload: { pageId: "pag_system", snapshotId: "psn_second", preferredRowSizing: true, preferredStackSizing: true },
    });
    yield* harness.flush();
    expect(yield* harness.query(owner, db.query.page.findFirst({ where: { id: { eq: "pag_system" } } })))
      .toMatchObject({ isPublished: true, publishedSnapshotId: "psn_second" });
    const snapshots = yield* harness.query(owner, db.query.pageSnapshot.findMany({ where: { pageId: { eq: "pag_system" } } }));
    expect(snapshots.map((snapshot) => snapshot.id).sort()).toEqual(["psn_first", "psn_second"]);
    expect(snapshots.every((snapshot) => snapshot.content.title === "Initial")).toBe(true);
  }).pipe(Effect.provide(NanoIdFactory)),
);
