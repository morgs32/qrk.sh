import { expect, it } from "@effect/vitest";
import { makeZerospinError } from "@zerospin/error";
import { makeQueryDbVersion, NanoIdFactory } from "@zerospin/sdk";
import { makeSystemHarness } from "@zerospin/sdk/testing";
import { Effect, Layer } from "effect";
import { TestClock } from "effect/testing";
import { vi } from "vitest";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_INSTAGRAM_RECEIVING_ACCOUNT_ID = "receiver_test";
  process.env.NEXT_PUBLIC_INSTAGRAM_RECEIVING_USERNAME = "qrk_verification_test";
});

import { InstagramProfileProvider } from "../src/services/instagramVerification/instagramProfileProvider";
import { instagramVerificationV1 } from "../src/services/instagramVerification/instagramVerificationV1";
import { challengeLifetimeMs } from "../src/services/instagramVerification/instagramVerificationPolicy";
import { system } from "../src/system";

it.effect("accepts codes only after activation and ignores superseded or expired activation", () =>
  Effect.gen(function* () {
    let lookups = 0;
    const harness = yield* makeSystemHarness({
      system,
      layer: () =>
        Layer.succeed(InstagramProfileProvider, {
          getProfile: () => {
            lookups += 1;
            return Effect.succeed({ username: "unused_username" });
          },
        }),
    });
    const db = makeQueryDbVersion({ models: instagramVerificationV1.models });
    const owner = { release: instagramVerificationV1 };
    const actor = {
      serviceName: "instagramVerification",
      serviceVersion: 1,
      actorName: "web",
      actorVersion: 1,
      nodeId: "node_instagram_activation",
      sessionName: "instagramVerificationSession",
      externalOutcome: null,
      claims: { clerkUserId: "owner_activation" },
    };
    yield* TestClock.setTime(0);
    yield* harness.push({
      ...actor,
      kind: "actor",
      id: "cmd_ig_issuing_start",
      commandName: "startInstagramVerification",
      contractVersion: 1,
      pushIndex: 1,
      payload: { id: "ivc_issuing", code: "a".repeat(32) },
    });
    yield* harness.push({
      kind: "system",
      id: "cmd_ig_issuing_receive",
      serviceName: "instagramVerification",
      serviceVersion: 1,
      commandName: "receiveInstagramVerificationMessage",
      contractVersion: 1,
      externalOutcome: null,
      payload: {
        receivingAccountId: "receiver_test",
        senderScopedId: "sender_activation",
        messageId: "message_before_activation",
        code: "a".repeat(32),
        verifiedAccountId: "iva_beforeactivation",
      },
    });
    expect(
      yield* harness.query(
        owner,
        db.query.instagramVerificationChallenge.findFirst({ where: { id: { eq: "ivc_issuing" } } }),
      ),
    ).toMatchObject({ state: { status: "issuing" } });
    yield* harness.push({
      ...actor,
      kind: "actor",
      id: "cmd_ig_activation_replacement",
      commandName: "startInstagramVerification",
      contractVersion: 1,
      pushIndex: 2,
      payload: { id: "ivc_activated", code: "b".repeat(32) },
    });
    yield* harness.flush();
    expect(lookups).toBe(0);
    expect(yield* harness.query(owner, db.query.verifiedInstagramAccount.findMany({}))).toEqual([]);
    const challenges = yield* harness.query(
      owner,
      db.query.instagramVerificationChallenge.findMany({}),
    );
    expect(challenges.find((challenge) => challenge.id === "ivc_issuing")?.state.status).toBe(
      "superseded",
    );
    expect(challenges.find((challenge) => challenge.id === "ivc_activated")?.state.status).toBe(
      "pending",
    );
    yield* harness.push({
      ...actor,
      kind: "actor",
      id: "cmd_ig_activation_delayed",
      commandName: "startInstagramVerification",
      contractVersion: 1,
      pushIndex: 3,
      payload: { id: "ivc_delayed", code: "c".repeat(32) },
    });
    yield* TestClock.setTime(challengeLifetimeMs);
    yield* harness.flush();
    expect(
      yield* harness.query(
        owner,
        db.query.instagramVerificationChallenge.findFirst({ where: { id: { eq: "ivc_delayed" } } }),
      ),
    ).toMatchObject({ expiresAt: new Date(challengeLifetimeMs), state: { status: "issuing" } });
  }).pipe(Effect.provide(NanoIdFactory)),
);

it.effect(
  "keeps Instagram ownership unique, supports multiple accounts, refreshes names, and releases a disconnected identity",
  () =>
    Effect.gen(function* () {
      let lookups = 0;
      let username = "first_username";
      const harness = yield* makeSystemHarness({
        system,
        layer: () =>
          Layer.succeed(InstagramProfileProvider, {
            getProfile: () =>
              Effect.sync(() => {
                lookups += 1;
                return { username };
              }),
          }),
      });
      const db = makeQueryDbVersion({ models: instagramVerificationV1.models });
      const owner = { release: instagramVerificationV1 };
      const actor = {
        serviceName: "instagramVerification",
        serviceVersion: 1,
        actorName: "web",
        actorVersion: 1,
        nodeId: "node_instagram_owner",
        sessionName: "instagramVerificationSession",
        externalOutcome: null,
      };
      for (const [index, attempt] of [
        { clerkUserId: "owner_one", senderScopedId: "sender_one" },
        { clerkUserId: "owner_one", senderScopedId: "sender_two" },
        { clerkUserId: "owner_one", senderScopedId: "sender_one" },
        { clerkUserId: "owner_two", senderScopedId: "sender_one" },
      ].entries()) {
        const code = index.toString(16).padStart(32, "0");
        username = index === 2 ? "renamed_username" : "first_username";
        yield* harness.push({
          ...actor,
          kind: "actor",
          id: `cmd_ig_start_${index}`,
          commandName: "startInstagramVerification",
          contractVersion: 1,
          claims: { clerkUserId: attempt.clerkUserId },
          pushIndex: index + 1,
          payload: { id: `ivc_attempt${index}`, code },
        });
        yield* harness.flush();
        const message = {
          serviceName: "instagramVerification",
          serviceVersion: 1,
          commandName: "receiveInstagramVerificationMessage",
          contractVersion: 1,
          externalOutcome: null,
          payload: {
            receivingAccountId: "receiver_test",
            senderScopedId: attempt.senderScopedId,
            messageId: `message_${index}`,
            code,
            verifiedAccountId: `iva_account${index}`,
          },
        };
        yield* harness.push({ ...message, kind: "system", id: `cmd_ig_receive_${index}` });
        yield* harness.push({ ...message, kind: "system", id: `cmd_ig_duplicate_${index}` });
        yield* harness.flush();
      }
      const accounts = yield* harness.query(owner, db.query.verifiedInstagramAccount.findMany({}));
      expect(lookups).toBe(4);
      expect(accounts).toHaveLength(2);
      expect(accounts.every((account) => account.clerkUserId === "owner_one")).toBe(true);
      expect(accounts.find((account) => account.senderScopedId === "sender_one")?.username).toBe(
        "renamed_username",
      );
      const rejected = yield* harness.query(
        owner,
        db.query.instagramVerificationChallenge.findFirst({
          where: { id: { eq: "ivc_attempt3" } },
        }),
      );
      expect(rejected?.state).toMatchObject({
        status: "failed",
        error: { code: "instagram-account-already-linked" },
      });
      const forbidden = yield* Effect.exit(
        harness.push({
          ...actor,
          kind: "actor",
          id: "cmd_ig_forbidden_disconnect",
          claims: { clerkUserId: "owner_two" },
          commandName: "disconnectInstagramAccount",
          contractVersion: 1,
          pushIndex: 5,
          payload: { id: "iva_account0" },
        }),
      );
      expect(forbidden._tag).toBe("Failure");
      yield* harness.push({
        ...actor,
        kind: "actor",
        id: "cmd_ig_disconnect",
        claims: { clerkUserId: "owner_one" },
        commandName: "disconnectInstagramAccount",
        contractVersion: 1,
        pushIndex: 6,
        payload: { id: "iva_account0" },
      });
      yield* harness.push({
        ...actor,
        kind: "actor",
        id: "cmd_ig_transfer_start",
        claims: { clerkUserId: "owner_two" },
        commandName: "startInstagramVerification",
        contractVersion: 1,
        pushIndex: 7,
        payload: { id: "ivc_transfer", code: "f".repeat(32) },
      });
      yield* harness.flush();
      yield* harness.push({
        kind: "system",
        id: "cmd_ig_transfer_receive",
        serviceName: "instagramVerification",
        serviceVersion: 1,
        commandName: "receiveInstagramVerificationMessage",
        contractVersion: 1,
        externalOutcome: null,
        payload: {
          receivingAccountId: "receiver_test",
          senderScopedId: "sender_one",
          messageId: "message_transfer",
          code: "f".repeat(32),
          verifiedAccountId: "iva_transfer",
        },
      });
      yield* harness.flush();
      expect(
        yield* harness.query(
          owner,
          db.query.verifiedInstagramAccount.findFirst({
            where: { senderScopedId: { eq: "sender_one" } },
          }),
        ),
      ).toMatchObject({ clerkUserId: "owner_two" });
    }).pipe(Effect.provide(NanoIdFactory)),
);

it.effect(
  "does not resolve expired challenges, ignores superseded completion, and retains provider failure",
  () =>
    Effect.gen(function* () {
      let lookups = 0;
      const harness = yield* makeSystemHarness({
        system,
        layer: () =>
          Layer.succeed(InstagramProfileProvider, {
            getProfile: () => {
              lookups += 1;
              return Effect.fail(
                makeZerospinError({
                  code: "instagram-profile-lookup-failed",
                  message: "Provider unavailable",
                }),
              );
            },
          }),
      });
      const db = makeQueryDbVersion({ models: instagramVerificationV1.models });
      const owner = { release: instagramVerificationV1 };
      const actor = {
        serviceName: "instagramVerification",
        serviceVersion: 1,
        actorName: "web",
        actorVersion: 1,
        nodeId: "node_instagram_expiry",
        sessionName: "instagramVerificationSession",
        externalOutcome: null,
        claims: { clerkUserId: "owner_expiry" },
      };
      yield* TestClock.setTime(0);
      yield* harness.push({
        ...actor,
        kind: "actor",
        id: "cmd_ig_expired_start",
        commandName: "startInstagramVerification",
        contractVersion: 1,
        pushIndex: 1,
        payload: { id: "ivc_expired", code: "1".repeat(32) },
      });
      yield* harness.flush();
      yield* TestClock.setTime(challengeLifetimeMs);
      yield* harness.push({
        kind: "system",
        id: "cmd_ig_expired_receive",
        serviceName: "instagramVerification",
        serviceVersion: 1,
        commandName: "receiveInstagramVerificationMessage",
        contractVersion: 1,
        externalOutcome: null,
        payload: {
          receivingAccountId: "receiver_test",
          senderScopedId: "sender_expiry",
          messageId: "message_expired",
          code: "1".repeat(32),
          verifiedAccountId: "iva_expired",
        },
      });
      for (const index of [2, 3]) {
        yield* harness.push({
          ...actor,
          kind: "actor",
          id: `cmd_ig_replacement_${index}`,
          commandName: "startInstagramVerification",
          contractVersion: 1,
          pushIndex: index,
          payload: { id: `ivc_replacement${index}`, code: String(index).repeat(32) },
        });
        yield* harness.flush();
        yield* harness.push({
          kind: "system",
          id: `cmd_ig_replacement_receive_${index}`,
          serviceName: "instagramVerification",
          serviceVersion: 1,
          commandName: "receiveInstagramVerificationMessage",
          contractVersion: 1,
          externalOutcome: null,
          payload: {
            receivingAccountId: "receiver_test",
            senderScopedId: "sender_expiry",
            messageId: `message_replacement${index}`,
            code: String(index).repeat(32),
            verifiedAccountId: `iva_replacement${index}`,
          },
        });
      }
      yield* harness.flush();
      expect(lookups).toBe(2);
      expect(yield* harness.query(owner, db.query.verifiedInstagramAccount.findMany({}))).toEqual(
        [],
      );
      const challenges = yield* harness.query(
        owner,
        db.query.instagramVerificationChallenge.findMany({}),
      );
      expect(
        challenges.find((challenge) => challenge.id === "ivc_replacement2")?.state.status,
      ).toBe("superseded");
      expect(
        challenges.find((challenge) => challenge.id === "ivc_replacement3")?.state,
      ).toMatchObject({
        status: "failed",
        error: { code: "instagram-profile-lookup-failed", retryable: true },
      });
      const reused = yield* Effect.exit(
        harness.push({
          ...actor,
          kind: "actor",
          id: "cmd_ig_reused_code",
          commandName: "startInstagramVerification",
          contractVersion: 1,
          claims: { clerkUserId: "other_owner" },
          pushIndex: 4,
          payload: { id: "ivc_reused", code: "2".repeat(32) },
        }),
      );
      expect(reused._tag).toBe("Failure");
    }).pipe(Effect.provide(NanoIdFactory)),
);

it.effect(
  "checks uniqueness at completion, accepts provider latency beyond expiry, and fences a disconnected in-flight verification",
  () =>
    Effect.gen(function* () {
      const harness = yield* makeSystemHarness({
        system,
        layer: () =>
          Layer.succeed(InstagramProfileProvider, {
            getProfile: () => Effect.succeed({ username: "shared_account" }),
          }),
      });
      const db = makeQueryDbVersion({ models: instagramVerificationV1.models });
      const owner = { release: instagramVerificationV1 };
      const actor = {
        serviceName: "instagramVerification",
        serviceVersion: 1,
        actorName: "web",
        actorVersion: 1,
        nodeId: "node_instagram_race",
        sessionName: "instagramVerificationSession",
        externalOutcome: null,
      };
      yield* TestClock.setTime(0);
      for (const index of [1, 2]) {
        yield* harness.push({
          ...actor,
          kind: "actor",
          id: `cmd_ig_race_start${index}`,
          commandName: "startInstagramVerification",
          contractVersion: 1,
          claims: { clerkUserId: `owner_race${index}` },
          pushIndex: index,
          payload: { id: `ivc_race${index}`, code: String(index).repeat(32) },
        });
      }
      yield* harness.flush();
      for (const index of [1, 2]) {
        yield* harness.push({
          kind: "system",
          id: `cmd_ig_race_receive${index}`,
          serviceName: "instagramVerification",
          serviceVersion: 1,
          commandName: "receiveInstagramVerificationMessage",
          contractVersion: 1,
          externalOutcome: null,
          payload: {
            receivingAccountId: "receiver_test",
            senderScopedId: "sender_shared",
            messageId: `message_race${index}`,
            code: String(index).repeat(32),
            verifiedAccountId: `iva_race${index}`,
          },
        });
      }
      yield* TestClock.setTime(challengeLifetimeMs + 1);
      yield* harness.flush();
      expect(
        yield* harness.query(owner, db.query.verifiedInstagramAccount.findMany({})),
      ).toHaveLength(1);
      expect(
        yield* harness.query(
          owner,
          db.query.instagramVerificationChallenge.findFirst({ where: { id: { eq: "ivc_race1" } } }),
        ),
      ).toMatchObject({ state: { status: "succeeded" } });
      expect(
        yield* harness.query(
          owner,
          db.query.instagramVerificationChallenge.findFirst({ where: { id: { eq: "ivc_race2" } } }),
        ),
      ).toMatchObject({
        state: { status: "failed", error: { code: "instagram-account-already-linked" } },
      });
      yield* harness.push({
        ...actor,
        kind: "actor",
        id: "cmd_ig_inflight_start",
        commandName: "startInstagramVerification",
        contractVersion: 1,
        claims: { clerkUserId: "owner_race1" },
        pushIndex: 3,
        payload: { id: "ivc_inflight", code: "3".repeat(32) },
      });
      yield* harness.flush();
      yield* harness.push({
        kind: "system",
        id: "cmd_ig_inflight_receive",
        serviceName: "instagramVerification",
        serviceVersion: 1,
        commandName: "receiveInstagramVerificationMessage",
        contractVersion: 1,
        externalOutcome: null,
        payload: {
          receivingAccountId: "receiver_test",
          senderScopedId: "sender_shared",
          messageId: "message_inflight",
          code: "3".repeat(32),
          verifiedAccountId: "iva_inflight",
        },
      });
      yield* harness.push({
        ...actor,
        kind: "actor",
        id: "cmd_ig_inflight_disconnect",
        commandName: "disconnectInstagramAccount",
        contractVersion: 1,
        claims: { clerkUserId: "owner_race1" },
        pushIndex: 4,
        payload: { id: "iva_race1" },
      });
      yield* harness.flush();
      expect(yield* harness.query(owner, db.query.verifiedInstagramAccount.findMany({}))).toEqual(
        [],
      );
      expect(
        yield* harness.query(
          owner,
          db.query.instagramVerificationChallenge.findFirst({
            where: { id: { eq: "ivc_inflight" } },
          }),
        ),
      ).toMatchObject({ state: { status: "superseded" } });
    }).pipe(Effect.provide(NanoIdFactory)),
);
