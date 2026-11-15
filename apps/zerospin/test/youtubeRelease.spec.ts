import { it } from "@effect/vitest";
import { brickContracts } from "@qrk.sh/bricks/zerospin/brickContracts";
import { encodePayload } from "@zerospin/core/contracts/encodePayload";
import { Effect } from "effect";
import { expect } from "vitest";

it.effect("accepts YouTube videos and playlists and rejects invalid IDs or times", () =>
  Effect.gen(function* () {
    const contract = brickContracts.updateYoutubeBrick;
    const video = { kind: "video" as const, videoId: "dQw4w9WgXcQ", playlistId: null, startSeconds: 12 };
    const playlist = { kind: "playlist" as const, videoId: "dQw4w9WgXcQ", playlistId: "PLabc123", startSeconds: 0 };
    for (const content of [video, playlist]) {
      expect(yield* encodePayload(contract, { version: 1, payload: { brickId: "brk_youtube", state: { content } } })).toBeDefined();
    }
    for (const content of [{ ...video, videoId: "bad" }, { ...playlist, playlistId: null }, { ...video, startSeconds: -1 }]) {
      const failure = yield* encodePayload(contract, { version: 1, payload: { brickId: "brk_youtube", state: { content } } }).pipe(Effect.flip);
      expect(failure).toMatchObject({ code: "encode-command-payload-failed" });
    }
  }),
);
