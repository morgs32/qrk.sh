import { vi } from "vitest";
vi.mock("cloudflare:workers", () => ({
  env: {
    ZEROSPIN_API_URL: "https://zerospin.qrk.localhost",
    ZEROSPIN_SECRET_KEY: "test-only-secret",
  },
}));
vi.mock("@zerospin/core/utils/getSystemApi/getSystemApi", async () => {
  const Effect = await import("effect/Effect");
  return {
    getSystemApi: () =>
      Effect.succeed({ executeServiceQuery: () => Effect.succeed({ username: "testuser" }) }),
  };
});
import { expect, it } from "@effect/vitest";
import { makeQueryDbVersion, NanoIdFactory } from "@zerospin/sdk";
import { makeSystemHarness } from "@zerospin/sdk/testing";
import * as Effect from "effect/Effect";

import { userAggregateV1 } from "../src/fresh/userAggregateV1";
import { system } from "../src/system";

it.effect("enforces unique, unambiguous Page paths within each Site", () =>
  Effect.gen(function* () {
    const harness = yield* makeSystemHarness({ system });
    yield* harness.push({
      kind: "system",
      id: "cmd_paths_user",
      commandName: "createUser",
      contractVersion: 1,
      aggregateName: "user",
      aggregateVersion: 1,
      aggregateId: "acct_paths",
      payload: { id: "usr_paths", clerkUserId: "user_paths", displayName: null },
    });
    const actor = {
      kind: "actor" as const,
      actorName: "web",
      actorVersion: 1,
      aggregateName: "user",
      aggregateVersion: 1,
      aggregateId: "acct_paths",
      nodeId: "node_paths",
      sessionName: "userSession",
      claims: { aggregateId: "acct_paths", clerkUserId: "user_paths" },
    };
    for (const [index, id] of ["sit_paths", "sit_second"].entries()) {
      yield* harness.push({
        ...actor,
        id: `cmd_site_${index}`,
        pushIndex: index + 1,
        commandName: "createSite",
        contractVersion: 1,
        payload: { id, userId: "usr_paths", slug: `site-${index}`, name: null, description: null },
      });
    }
    yield* harness.push({
      ...actor,
      id: "cmd_index",
      pushIndex: 3,
      commandName: "createPage",
      contractVersion: 1,
      payload: { id: "pag_index", siteId: "sit_paths", slug: null, title: null, description: null },
    });
    yield* harness.push({
      ...actor,
      id: "cmd_path_first",
      pushIndex: 4,
      commandName: "createPage",
      contractVersion: 1,
      payload: {
        id: "pag_first",
        siteId: "sit_paths",
        slug: "About/日本語",
        title: null,
        description: null,
      },
    });
    yield* harness.push({
      ...actor,
      id: "cmd_path_case",
      pushIndex: 5,
      commandName: "createPage",
      contractVersion: 1,
      payload: {
        id: "pag_case",
        siteId: "sit_paths",
        slug: "about/日本語",
        title: null,
        description: null,
      },
    });
    yield* harness.push({
      ...actor,
      id: "cmd_path_other_site",
      pushIndex: 6,
      commandName: "createPage",
      contractVersion: 1,
      payload: {
        id: "pag_second",
        siteId: "sit_second",
        slug: "About/日本語",
        title: null,
        description: null,
      },
    });
    const duplicate = yield* harness
      .push({
        ...actor,
        id: "cmd_path_duplicate",
        pushIndex: 7,
        commandName: "createPage",
        contractVersion: 1,
        payload: {
          id: "pag_duplicate",
          siteId: "sit_paths",
          slug: "About/日本語",
          title: null,
          description: null,
        },
      })
      .pipe(Effect.flip);
    expect(duplicate).toMatchObject({ code: "create-page-path-taken" });

    for (const [index, slug] of [
      "",
      "/about",
      "about/",
      "about//team",
      ".",
      "about/../team",
    ].entries()) {
      const invalid = yield* harness
        .push({
          ...actor,
          id: `cmd_path_invalid_${index}`,
          pushIndex: index + 8,
          commandName: "createPage",
          contractVersion: 1,
          payload: {
            id: `pag_invalid_${index}`,
            siteId: "sit_paths",
            slug,
            title: null,
            description: null,
          },
        })
        .pipe(Effect.flip);
      expect(invalid).toMatchObject({ code: "create-page-path-invalid" });
    }
    const forbidden = yield* harness
      .push({
        ...actor,
        claims: { aggregateId: "acct_paths", clerkUserId: "other_user" },
        id: "cmd_path_other_owner",
        pushIndex: 14,
        commandName: "createPage",
        contractVersion: 1,
        payload: {
          id: "pag_forbidden",
          siteId: "sit_paths",
          slug: "About/日本語",
          title: null,
          description: null,
        },
      })
      .pipe(Effect.flip);
    expect(forbidden).toMatchObject({ code: "create-page-site-not-found" });
    const duplicateIndex = yield* harness
      .push({
        ...actor,
        id: "cmd_duplicate_index",
        pushIndex: 15,
        commandName: "createPage",
        contractVersion: 1,
        payload: {
          id: "pag_duplicate_index",
          siteId: "sit_paths",
          slug: null,
          title: null,
          description: null,
        },
      })
      .pipe(Effect.flip);
    expect(duplicateIndex).toMatchObject({ code: "create-page-index-taken" });

    yield* harness.flush();
    const db = makeQueryDbVersion({ models: userAggregateV1.models });
    const pages = yield* harness.query(
      { release: userAggregateV1, aggregateId: "acct_paths" },
      db.query.page.findMany({ where: { siteId: { eq: "sit_paths" } } }),
    );
    expect(pages.map((page) => page.id).sort()).toEqual(["pag_case", "pag_first", "pag_index"]);
  }).pipe(Effect.provide(NanoIdFactory)),
);

it.effect("rejects backslashes in Page paths on the initial release", () =>
  Effect.gen(function* () {
    const harness = yield* makeSystemHarness({ system });
    yield* harness.push({
      kind: "system",
      id: "cmd_backslash_user",
      commandName: "createUser",
      contractVersion: 1,
      aggregateName: "user",
      aggregateVersion: 1,
      aggregateId: "acct_backslash",
      payload: { id: "usr_backslash", clerkUserId: "user_backslash", displayName: null },
    });
    const actor = {
      kind: "actor" as const,
      actorName: "web",
      actorVersion: 1,
      aggregateName: "user",
      aggregateVersion: 1,
      aggregateId: "acct_backslash",
      nodeId: "node_backslash",
      sessionName: "userSession",
      claims: { aggregateId: "acct_backslash", clerkUserId: "user_backslash" },
    };
    yield* harness.push({
      ...actor,
      id: "cmd_backslash_site",
      pushIndex: 1,
      commandName: "createSite",
      contractVersion: 1,
      payload: {
        id: "sit_backslash",
        userId: "usr_backslash",
        slug: "site",
        name: null,
        description: null,
      },
    });
    yield* harness.push({
      ...actor,
      id: "cmd_backslash_valid",
      pushIndex: 2,
      commandName: "createPage",
      contractVersion: 1,
      payload: {
        id: "pag_valid",
        siteId: "sit_backslash",
        slug: "About/日本語",
        title: null,
        description: null,
      },
    });
    const invalid = yield* harness
      .push({
        ...actor,
        id: "cmd_backslash_invalid",
        pushIndex: 3,
        commandName: "createPage",
        contractVersion: 1,
        payload: {
          id: "pag_invalid",
          siteId: "sit_backslash",
          slug: "About\\team",
          title: null,
          description: null,
        },
      })
      .pipe(Effect.flip);
    expect(invalid).toMatchObject({ code: "create-page-path-invalid" });

    yield* harness.flush();
    const db = makeQueryDbVersion({ models: userAggregateV1.models });
    const pages = yield* harness.query(
      { release: userAggregateV1, aggregateId: "acct_backslash" },
      db.query.page.findMany({ where: { siteId: { eq: "sit_backslash" } } }),
    );
    expect(pages.map((page) => page.id)).toEqual(["pag_valid"]);
  }).pipe(Effect.provide(NanoIdFactory)),
);
