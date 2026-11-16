import { expect, it } from "@effect/vitest";
import { makeQueryDbVersion, NanoIdFactory } from "@zerospin/sdk";
import { makeSystemHarness } from "@zerospin/sdk/testing";
import { Effect } from "effect";
import { usersV1 } from "../src/services/users/usersV1";
import { userAggregateV4 } from "../src/fresh/userAggregateV4";
import { system } from "../src/system";

it.effect("enforces global usernames and ignores older delivered requests", () =>
  Effect.gen(function* () {
    const harness = yield* makeSystemHarness({ system });
    const common = {
      kind: "system",
      serviceName: "users",
      serviceVersion: 1,
      commandName: "setUsername",
      contractVersion: 1,
      externalOutcome: null,
    } as const;
    const first = yield* harness.push({
      ...common,
      id: "cmd_username_first",
      payload: {
        userId: "usr_one",
        aggregateId: "acct_one",
        username: "morgan",
        revision: 1,
      },
    });
    expect(first).toEqual({ status: "saved", username: "morgan", revision: 1 });
    const taken = yield* harness.push({
      ...common,
      id: "cmd_username_taken",
      payload: {
        userId: "usr_two",
        aggregateId: "acct_two",
        username: "morgan",
        revision: 1,
      },
    });
    expect(taken).toEqual({ status: "taken", revision: 1 });
    yield* harness.push({
      ...common,
      id: "cmd_username_new",
      payload: {
        userId: "usr_one",
        aggregateId: "acct_one",
        username: "morgs32",
        revision: 3,
      },
    });
    const stale = yield* harness.push({
      ...common,
      id: "cmd_username_stale",
      payload: {
        userId: "usr_one",
        aggregateId: "acct_one",
        username: "older",
        revision: 2,
      },
    });
    expect(stale).toEqual({ status: "superseded", revision: 3 });
    yield* harness.push({
      ...common,
      id: "cmd_username_released",
      payload: {
        userId: "usr_two",
        aggregateId: "acct_two",
        username: "morgan",
        revision: 2,
      },
    });
    const rejectedNewer = yield* harness.push({
      ...common,
      id: "cmd_username_newer_taken",
      payload: {
        userId: "usr_three",
        aggregateId: "acct_three",
        username: "morgan",
        revision: 2,
      },
    });
    expect(rejectedNewer).toEqual({ status: "taken", revision: 2 });
    const lateOlder = yield* harness.push({
      ...common,
      id: "cmd_username_late_older",
      payload: {
        userId: "usr_three",
        aggregateId: "acct_three",
        username: "free",
        revision: 1,
      },
    });
    expect(lateOlder).toEqual({ status: "superseded", revision: 2 });
    const conflict = yield* harness
      .push({
        ...common,
        id: "cmd_username_conflict",
        payload: {
          userId: "usr_one",
          aggregateId: "acct_one",
          username: "different",
          revision: 3,
        },
      })
      .pipe(Effect.flip);
    expect(conflict).toMatchObject({ code: "username-revision-conflict" });
    const forged = yield* harness
      .push({
        ...common,
        id: "cmd_username_forged",
        payload: {
          userId: "usr_one",
          aggregateId: "acct_two",
          username: "different",
          revision: 4,
        },
      })
      .pipe(Effect.flip);
    expect(forged).toMatchObject({ code: "username-owner-mismatch" });
    const db = makeQueryDbVersion({ models: usersV1.models });
    const rows = yield* harness.query({ release: usersV1 }, db.query.username.findMany({}));
    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row.userId === "usr_three")).toMatchObject({
      username: null,
      revision: 2,
    });
  }).pipe(Effect.provide(NanoIdFactory)),
);

it.effect(
  "stages a username request for the authenticated user with a monotonically increasing revision",
  () =>
    Effect.gen(function* () {
      const harness = yield* makeSystemHarness({ system });
      yield* harness.push({
        kind: "system",
        id: "cmd_username_user",
        commandName: "createUser",
        contractVersion: 1,
        aggregateName: "user",
        aggregateVersion: 4,
        aggregateId: "account_one",
        externalOutcome: null,
        payload: { id: "usr_one", clerkUserId: "account_one", username: null, displayName: null },
      });
      const actor = {
        kind: "actor",
        actorName: "web",
        actorVersion: 3,
        aggregateName: "user",
        aggregateVersion: 4,
        aggregateId: "account_one",
        nodeId: "node_username",
        sessionName: "userSession",
        externalOutcome: null,
        contractVersion: 1,
        commandName: "requestUsername",
        claims: { aggregateId: "account_one", clerkUserId: "account_one" },
      } as const;
      const withoutUsername = yield* harness
        .push({
          ...actor,
          id: "cmd_create_site_without_username",
          nodeId: "node_site_before_username",
          pushIndex: 1,
          commandName: "createSite",
          contractVersion: 2,
          payload: {
            id: "sit_before_username",
            userId: "usr_one",
            slug: null,
            name: "My Site",
            description: null,
          },
        })
        .pipe(Effect.flip);
      expect(withoutUsername).toMatchObject({ code: "create-site-user-mismatch" });
      yield* harness.push({
        ...actor,
        id: "cmd_username_request_one",
        pushIndex: 1,
        payload: { userId: "usr_one", username: "first" },
      });
      yield* harness.push({
        ...actor,
        id: "cmd_username_request_two",
        pushIndex: 2,
        payload: { userId: "usr_one", username: "second" },
      });
      const db = makeQueryDbVersion({ models: userAggregateV4.models });
      const status = yield* harness.query(
        { release: userAggregateV4, aggregateId: "account_one" },
        db.query.usernameStatus.findFirst({ where: { userId: { eq: "usr_one" } } }),
      );
      expect(status).toMatchObject({ revision: 2, pending: "second", failure: null });
      yield* harness.flush();
      const saved = yield* harness.query(
        { release: userAggregateV4, aggregateId: "account_one" },
        db.query.user.findFirst({ where: { id: { eq: "usr_one" } } }),
      );
      expect(saved).toMatchObject({ username: "second" });
      const settled = yield* harness.query(
        { release: userAggregateV4, aggregateId: "account_one" },
        db.query.usernameStatus.findFirst({ where: { userId: { eq: "usr_one" } } }),
      );
      expect(settled).toMatchObject({ revision: 2, pending: null, failure: null });
      yield* harness.push({
        ...actor,
        id: "cmd_create_site_with_domain",
        pushIndex: 3,
        commandName: "createSite",
        contractVersion: 2,
        payload: {
          id: "sit_one",
          userId: "usr_one",
          slug: null,
          name: "My Site",
          description: null,
        },
      });
      yield* harness.flush();
      const site = yield* harness.query(
        { release: userAggregateV4, aggregateId: "account_one" },
        db.query.site.findFirst({ where: { id: { eq: "sit_one" } } }),
      );
      expect(site?.hostname).toMatch(/^second-[a-z0-9]{6}$/);
      expect(site?.isPublished).toBe(false);
      yield* harness.push({
        kind: "system",
        id: "cmd_conflicting_domain",
        serviceName: "domains",
        serviceVersion: 1,
        commandName: "assignDomain",
        contractVersion: 1,
        externalOutcome: null,
        payload: {
          siteId: "sit_conflict",
          userId: "usr_other",
          aggregateId: "account_other",
          username: "other",
        },
      });
      yield* harness.push({
        ...actor,
        id: "cmd_create_site_with_conflicting_domain",
        pushIndex: 4,
        commandName: "createSite",
        contractVersion: 2,
        payload: {
          id: "sit_conflict",
          userId: "usr_one",
          slug: null,
          name: "Another Site",
          description: null,
        },
      });
      yield* harness.flush();
      const failure = yield* harness.query(
        { release: userAggregateV4, aggregateId: "account_one" },
        db.query.siteFailure.findFirst({ where: { siteId: { eq: "sit_conflict" } } }),
      );
      expect(failure).toMatchObject({
        id: "sfl_sit_conflict_domains",
        stage: "domains",
        message: "This Site belongs to another user",
      });
      yield* harness.flush();
      const failures = yield* harness.query(
        { release: userAggregateV4, aggregateId: "account_one" },
        db.query.siteFailure.findMany({ where: { siteId: { eq: "sit_conflict" } } }),
      );
      expect(failures).toHaveLength(1);
      yield* harness.push({
        kind: "system",
        id: "cmd_username_user_two",
        commandName: "createUser",
        contractVersion: 1,
        aggregateName: "user",
        aggregateVersion: 4,
        aggregateId: "account_two",
        externalOutcome: null,
        payload: { id: "usr_two", clerkUserId: "account_two", username: null, displayName: null },
      });
      yield* harness.push({
        ...actor,
        aggregateId: "account_two",
        nodeId: "node_username_two",
        claims: { aggregateId: "account_two", clerkUserId: "account_two" },
        id: "cmd_username_reserve",
        pushIndex: 1,
        payload: { userId: "usr_two", username: "reserved" },
      });
      yield* harness.flush();
      yield* harness.push({
        ...actor,
        id: "cmd_username_request_three",
        pushIndex: 3,
        payload: { userId: "usr_one", username: "third" },
      });
      yield* harness.push({
        ...actor,
        id: "cmd_username_request_taken",
        pushIndex: 4,
        payload: { userId: "usr_one", username: "reserved" },
      });
      yield* harness.flush();
      const current = yield* harness.query(
        { release: userAggregateV4, aggregateId: "account_one" },
        db.query.user.findFirst({ where: { id: { eq: "usr_one" } } }),
      );
      const rejected = yield* harness.query(
        { release: userAggregateV4, aggregateId: "account_one" },
        db.query.usernameStatus.findFirst({ where: { userId: { eq: "usr_one" } } }),
      );
      expect(current).toMatchObject({ username: "third" });
      expect(rejected).toMatchObject({
        revision: 4,
        pending: null,
        failure: "That username is already taken",
      });
      const forged = yield* harness
        .push({
          ...actor,
          id: "cmd_username_request_forged",
          pushIndex: 5,
          payload: { userId: "usr_other", username: "other" },
        })
        .pipe(Effect.flip);
      expect(forged).toMatchObject({ code: "username-owner-mismatch" });
    }).pipe(Effect.provide(NanoIdFactory)),
);
