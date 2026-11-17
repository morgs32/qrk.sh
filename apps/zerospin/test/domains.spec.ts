import { expect, it } from "@effect/vitest";
import { vi } from "vitest";
import { makeQueryDbVersion, NanoIdFactory } from "@zerospin/sdk";
import { makeSystemHarness } from "@zerospin/sdk/testing";
import { Effect, Layer } from "effect";
import { domainsV1 } from "../src/services/domains/domainsV1";
import { usersV1 } from "../src/services/users/usersV1";
import { userAggregateV1 } from "../src/fresh/userAggregateV1";
import { system } from "../src/system";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("cloudflare:workers", () => ({
  env: {
    ZEROSPIN_API_URL: "https://zerospin.qrk.localhost",
    ZEROSPIN_SECRET_KEY: "test-only-secret",
  },
}));
vi.mock("@zerospin/core/utils/getSystemApi/getSystemApi", async () => {
  const { Effect } = await import("effect");
  return { getSystemApi: () => Effect.succeed({ executeServiceQuery: mocks.query }) };
});

it.effect(
  "allocates unique stable addresses from the Users observation and records missing-name failures",
  () =>
    Effect.gen(function* () {
      mocks.query.mockReset();
      const harness = yield* makeSystemHarness({
        system,
        layer: (api) => {
          mocks.query.mockImplementation(api.executeServiceQuery);
          return Layer.empty;
        },
      });
      yield* harness.push({
        kind: "system",
        id: "cmd_domain_user",
        aggregateName: "user",
        aggregateVersion: 1,
        aggregateId: "account_one",
        commandName: "createUser",
        contractVersion: 1,
        externalOutcome: null,
        payload: { id: "usr_one", clerkUserId: "account_one", displayName: null },
      });
      yield* harness.push({
        kind: "system",
        id: "cmd_domain_username",
        serviceName: "users",
        serviceVersion: 1,
        commandName: "assignUsername",
        contractVersion: 1,
        externalOutcome: null,
        payload: { userId: "usr_one", aggregateId: "account_one", username: "morgs32" },
      });
      const actor = {
        kind: "actor",
        actorName: "web",
        actorVersion: 1,
        aggregateName: "user",
        aggregateVersion: 1,
        aggregateId: "account_one",
        nodeId: "node_domain",
        sessionName: "userSession",
        claims: { aggregateId: "account_one", clerkUserId: "account_one" },
        commandName: "createSite",
        contractVersion: 1,
        externalOutcome: null,
      } as const;
      yield* harness.push({
        ...actor,
        id: "cmd_site_first",
        pushIndex: 1,
        payload: {
          id: "sit_1ar655v",
          userId: "usr_one",
          slug: null,
          name: null,
          description: null,
        },
      });
      yield* harness.push({
        ...actor,
        id: "cmd_site_collision",
        pushIndex: 2,
        payload: {
          id: "sit_1mo2s42",
          userId: "usr_one",
          slug: null,
          name: null,
          description: null,
        },
      });
      yield* harness.flush();
      const db = makeQueryDbVersion({ models: userAggregateV1.models });
      const sites = yield* harness.query(
        { release: userAggregateV1, aggregateId: "account_one" },
        db.query.site.findMany({}),
      );
      expect(sites).toHaveLength(2);
      expect(
        sites.every(
          (site) => /^morgs32-[a-z0-9]{6}$/.test(site.hostname ?? "") && !site.isPublished,
        ),
      ).toBe(true);
      expect(new Set(sites.map((site) => site.hostname)).size).toBe(2);
      expect(mocks.query).toHaveBeenCalledTimes(2);
      const original = sites.find((site) => site.id === "sit_1ar655v")?.hostname;
      yield* harness.push({
        kind: "system",
        id: "cmd_domain_rename",
        serviceName: "users",
        serviceVersion: 1,
        commandName: "assignUsername",
        contractVersion: 1,
        externalOutcome: null,
        payload: { userId: "usr_one", aggregateId: "account_one", username: "renamed" },
      });
      yield* harness.push({
        kind: "system",
        id: "cmd_domain_again",
        serviceName: "domains",
        serviceVersion: 1,
        commandName: "assignDomain",
        contractVersion: 1,
        externalOutcome: null,
        payload: { siteId: "sit_1ar655v", userId: "usr_one", aggregateId: "account_one" },
      });
      yield* harness.flush();
      expect(mocks.query).toHaveBeenCalledTimes(2);
      const again = yield* harness.query(
        { release: userAggregateV1, aggregateId: "account_one" },
        db.query.site.findFirst({ where: { id: { eq: "sit_1ar655v" } } }),
      );
      expect(again?.hostname).toBe(original);
      mocks.query.mockReturnValueOnce(Effect.succeed(undefined));
      yield* harness.push({
        ...actor,
        id: "cmd_site_no_username",
        pushIndex: 3,
        payload: {
          id: "sit_missing",
          userId: "usr_one",
          slug: null,
          name: null,
          description: null,
        },
      });
      yield* harness.flush();
      const missing = yield* harness.query(
        { release: userAggregateV1, aggregateId: "account_one" },
        db.query.site.findFirst({ where: { id: { eq: "sit_missing" } } }),
      );
      const failure = yield* harness.query(
        { release: userAggregateV1, aggregateId: "account_one" },
        db.query.siteFailure.findFirst({ where: { siteId: { eq: "sit_missing" } } }),
      );
      expect(missing).toMatchObject({ hostname: null, isPublished: false });
      expect(failure).toMatchObject({
        stage: "domains",
        message: "Save a username before creating a Site",
      });
      const domainsDb = makeQueryDbVersion({ models: domainsV1.models });
      expect(
        yield* harness.query({ release: domainsV1 }, domainsDb.query.domain.findMany({})),
      ).toHaveLength(2);
    }).pipe(Effect.provide(NanoIdFactory)),
);

it.effect("uses the observed username even when its owner renames before domain completion", () =>
  Effect.gen(function* () {
    mocks.query.mockReset();
    const harness = yield* makeSystemHarness({
      system,
      layer: (api) => {
        mocks.query.mockImplementation((input) =>
          api
            .executeServiceQuery(input)
            .pipe(
              Effect.tap(() =>
                api.executeServiceCommand(usersV1, {
                  contractName: "assignUsername",
                  payload: {
                    userId: "usr_observed",
                    aggregateId: "account_observed",
                    username: "after",
                  },
                }),
              ),
            ),
        );
        return Layer.empty;
      },
    });
    yield* harness.push({
      kind: "system",
      id: "cmd_observed_user",
      aggregateName: "user",
      aggregateVersion: 1,
      aggregateId: "account_observed",
      commandName: "createUser",
      contractVersion: 1,
      externalOutcome: null,
      payload: { id: "usr_observed", clerkUserId: "account_observed", displayName: null },
    });
    yield* harness.push({
      kind: "system",
      id: "cmd_observed_username",
      serviceName: "users",
      serviceVersion: 1,
      commandName: "assignUsername",
      contractVersion: 1,
      externalOutcome: null,
      payload: { userId: "usr_observed", aggregateId: "account_observed", username: "before" },
    });
    yield* harness.push({
      kind: "actor",
      actorName: "web",
      actorVersion: 1,
      aggregateName: "user",
      aggregateVersion: 1,
      aggregateId: "account_observed",
      nodeId: "node_observed",
      sessionName: "userSession",
      claims: { aggregateId: "account_observed", clerkUserId: "account_observed" },
      id: "cmd_observed_site",
      pushIndex: 1,
      commandName: "createSite",
      contractVersion: 1,
      externalOutcome: null,
      payload: {
        id: "sit_observed",
        userId: "usr_observed",
        slug: null,
        name: null,
        description: null,
      },
    });
    yield* harness.flush();
    const db = makeQueryDbVersion({ models: userAggregateV1.models });
    const site = yield* harness.query(
      { release: userAggregateV1, aggregateId: "account_observed" },
      db.query.site.findFirst({}),
    );
    expect(site?.hostname).toMatch(/^before-[a-z0-9]{6}$/);
    const usersDb = makeQueryDbVersion({ models: usersV1.models });
    expect(
      (yield* harness.query({ release: usersV1 }, usersDb.query.username.findFirst({})))?.username,
    ).toBe("after");
    yield* harness.flush();
    expect(mocks.query).toHaveBeenCalledTimes(1);
  }).pipe(Effect.provide(NanoIdFactory)),
);
