import { expect, it } from "@effect/vitest";
import { makeQueryDbVersion, NanoIdFactory } from "@zerospin/sdk";
import { makeSystemHarness } from "@zerospin/sdk/testing";
import { Effect } from "effect";
import { domainsV1 } from "../src/services/domains/domainsV1";
import { system } from "../src/system";

it.effect(
  "assigns stable globally unique hostnames, handles collisions and enforces ownership",
  () =>
    Effect.gen(function* () {
      const harness = yield* makeSystemHarness({ system });
      const common = {
        kind: "system",
        serviceName: "domains",
        serviceVersion: 1,
        commandName: "assignDomain",
        contractVersion: 1,
        externalOutcome: null,
      } as const;
      const first = yield* harness.push({
        ...common,
        id: "cmd_domain_first",
        payload: {
          siteId: "sit_1ar655v",
          userId: "usr_one",
          aggregateId: "acct_one",
          username: "morgs32",
        },
      });
      const second = yield* harness.push({
        ...common,
        id: "cmd_domain_collision",
        payload: {
          siteId: "sit_1mo2s42",
          userId: "usr_one",
          aggregateId: "acct_one",
          username: "morgs32",
        },
      });
      expect(first.hostname).toMatch(/^morgs32-[a-z0-9]{6}$/);
      expect(second.hostname).not.toBe(first.hostname);
      const again = yield* harness.push({
        ...common,
        id: "cmd_domain_again",
        payload: {
          siteId: "sit_1ar655v",
          userId: "usr_one",
          aggregateId: "acct_one",
          username: "newname",
        },
      });
      expect(again.hostname).toBe(first.hostname);
      const forbidden = yield* harness
        .push({
          ...common,
          id: "cmd_domain_other",
          payload: {
            siteId: "sit_1ar655v",
            userId: "usr_other",
            aggregateId: "acct_other",
            username: "other",
          },
        })
        .pipe(Effect.flip);
      expect(forbidden).toMatchObject({ code: "domain-owner-mismatch" });
      const invalid = yield* harness
        .push({
          ...common,
          id: "cmd_domain_invalid",
          payload: {
            siteId: "sit_invalid",
            userId: "usr_one",
            aggregateId: "acct_one",
            username: "invalid-name",
          },
        })
        .pipe(Effect.flip);
      expect(invalid).toMatchObject({ code: "domain-username-invalid" });
      const db = makeQueryDbVersion({ models: domainsV1.models });
      const rows = yield* harness.query({ release: domainsV1 }, db.query.domain.findMany({}));
      expect(rows).toHaveLength(2);
    }).pipe(Effect.provide(NanoIdFactory)),
);
