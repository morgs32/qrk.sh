import { it } from "@effect/vitest";
import { candidateLibrary } from "@qrk.sh/bricks/modules/candidateLibrary";
import { swatchAndIconPreviewState } from "@qrk.sh/bricks/modules/swatchAndIcon/definition/swatchAndIconPreviewState";
import { decodeAndAdaptPayload } from "@zerospin/core/contracts/decodeAndAdaptPayload/decodeAndAdaptPayload";
import { encodePayload } from "@zerospin/core/contracts/encodePayload";
import { applyOperationTx } from "@zerospin/core/contracts/applyOperationTx";
import { makeContractReadDb } from "@zerospin/core/contracts/make/makeContractReadDb";
import { makeResourceDbConfig } from "@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig";
import { makeTx } from "@zerospin/core/drizzle/make/makeTx";
import { openHarnessDb } from "@zerospin/core/testing/systemHarness/openHarnessDb";
import { DownAdapterRefused, findMany } from "@zerospin/sdk/browser";
import { Effect, Schema } from "effect";
import { expect } from "vitest";
import { userAggregateV18 } from "../src/aggregates/user/UserV18";
import { updateBrickV12 } from "../src/aggregates/user/contracts/brick/UpdateBrickV12";
import { addBrickV11 } from "../src/aggregates/user/contracts/wall/AddBrickContractV11";
import { addBrickV10 } from "../src/aggregates/user/contracts/wall/AddBrickContractV10";

it.effect("requires a complete swatch while allowing the default empty hash", () =>
  Effect.sync(() => {
    const isComplete = Schema.is(candidateLibrary["swatch-and-icon"].completeStateSchema);
    expect(isComplete(swatchAndIconPreviewState)).toBe(true);
    expect(isComplete({ ...swatchAndIconPreviewState, payload: { hash: "", color: "not-a-color" } })).toBe(false);
    expect(isComplete({ ...swatchAndIconPreviewState, data: { name: "", svg: "" } })).toBe(false);
  }),
);

it.effect("creates four chosen layouts and rejects incomplete creation and updates", () =>
  Effect.gen(function* () {
    const config = makeResourceDbConfig({ models: userAggregateV18.models });
    const db = yield* openHarnessDb(config);
    const readDb = makeContractReadDb({ db, models: userAggregateV18.models });
    const recordedAt = new Date("2026-11-12T00:00:00Z");
    const timestamps = { createdAt: recordedAt, updatedAt: recordedAt };
    db.transaction((tx) => {
      tx.insert(config.schema.user).values({
        ...timestamps, id: "usr_drawer", clerkUserId: "user_drawer", username: null, displayName: null,
      }).run();
      tx.insert(config.schema.site).values({
        ...timestamps, id: "sit_drawer", userId: "usr_drawer", slug: null, name: null,
        description: null, logoUrl: null, faviconLightUrl: null, faviconDarkUrl: null,
        isPublished: false, stickyNavbar: true, cardStyle: false, brickGap: 1,
      }).run();
      tx.insert(config.schema.page).values({
        ...timestamps, id: "pag_drawer", siteId: "sit_drawer", slug: null, title: null,
        description: null, isPublished: false, publishedSnapshotId: null,
      }).run();
      for (const breakpoint of ["sm", "md", "lg", "xl"] as const) {
        tx.insert(config.schema.wall).values({
          ...timestamps, id: `wal_drawer_${breakpoint}`, pageId: "pag_drawer", breakpoint,
          layout: JSON.stringify({ sections: [] }),
        }).run();
      }
    });

    const state = { imageUrl: "https://example.test/lake.jpg", altText: "Mountain lake", caption: "", crop: null };
    const payload = {
      id: "brk_drawer" as const, pageId: "pag_drawer" as const, moduleId: "image" as const,
      layoutId: "captionless", state,
      target: { kind: "wall" as const, wallId: "wal_drawer_lg" as const, beforeSectionId: null },
    };
    const claims = { clerkUserId: "user_drawer", aggregateId: "acct_drawer" };
    const invoke = (data: typeof payload) => addBrickV11.evaluate({
      aggregateId: "acct_drawer", claims, db: readDb, payload: data,
    });
    // A retained placeholder cannot become a complete Image merely by adapting its payload.
    const legacy = {
      id: payload.id,
      pageId: payload.pageId,
      moduleId: payload.moduleId,
      state: null,
      target: payload.target,
    };
    const legacyEncoded = yield* encodePayload(addBrickV10, { version: 10, payload: legacy });
    const adapted = yield* decodeAndAdaptPayload(addBrickV11, {
      command: { commandName: "addBrick", contractVersion: 10, payload: legacyEncoded },
    });
    expect(adapted.layoutId).toBe("default");
    const legacyRejected = yield* addBrickV11.evaluate({
      aggregateId: "acct_drawer", claims, db: readDb, payload: adapted,
    }).pipe(Effect.flip);
    expect(legacyRejected).toMatchObject({ code: "add-brick-invalid-state" });

    const invalidState = yield* invoke({ ...payload, state: { ...state, altText: "" } }).pipe(Effect.flip);
    expect(invalidState).toMatchObject({ code: "add-brick-invalid-state" });
    const invalidLayout = yield* invoke({ ...payload, layoutId: "toString" }).pipe(Effect.flip);
    expect(invalidLayout).toMatchObject({ code: "add-brick-invalid-layout" });

    const created = yield* invoke(payload);
    for (const operation of created.operations) {
      yield* makeTx("drawer.replay")(function* (tx) {
        yield* applyOperationTx({ tx, operation, appliedAt: recordedAt });
      })(db);
    }
    const placements = yield* findMany({ db: readDb, model: readDb.models.placement, where: { brickId: { eq: payload.id } } });
    expect(placements).toHaveLength(4);
    for (const placement of placements) expect(placement.spec).toEqual(candidateLibrary.image.layouts.captionless);

    const invalidUpdate = yield* updateBrickV12.evaluate({
      aggregateId: "acct_drawer", claims, db: readDb,
      payload: { brickId: payload.id, moduleId: "image", state: { ...state, altText: "" } },
    }).pipe(Effect.flip);
    expect(invalidUpdate).toMatchObject({ code: "update-brick-invalid-state" });
  }),
);

it.effect("adapts old commands to the default layout and refuses incompatible reverse adaptation", () =>
  Effect.gen(function* () {
    const legacy = {
      id: "brk_drawer", pageId: "pag_drawer", moduleId: "image", state: null,
      target: { kind: "wall", wallId: "wal_drawer_lg", beforeSectionId: null },
    } satisfies Parameters<typeof addBrickV10.evaluate>[0]["payload"];
    const encoded = yield* encodePayload(addBrickV10, { version: 10, payload: legacy });
    expect(yield* decodeAndAdaptPayload(addBrickV11, {
      command: { commandName: "addBrick", contractVersion: 10, payload: encoded },
    })).toEqual({ ...legacy, layoutId: "default" });
    const selected = yield* encodePayload(addBrickV11, {
      version: 11,
      payload: {
        ...legacy, layoutId: "captionless",
        state: { imageUrl: "https://example.test/lake.jpg", altText: "Lake", caption: "", crop: null },
      },
    });
    expect(yield* decodeAndAdaptPayload(addBrickV10, {
      command: { commandName: "addBrick", contractVersion: 11, payload: selected },
    }).pipe(Effect.flip)).toBe(DownAdapterRefused);
  }),
);
