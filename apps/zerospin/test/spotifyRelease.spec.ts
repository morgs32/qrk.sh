import { it } from "@effect/vitest";
import { brickContracts } from "@qrk.sh/bricks/zerospin/brickContracts";
import { encodePayload } from "@zerospin/core/contracts/encodePayload";
import * as Effect from "effect/Effect";
import { expect } from "vitest";

it.effect("accepts canonical supported Spotify content and rejects other destinations", () =>
  Effect.gen(function* () {
    const contract = brickContracts.updateSpotifyBrick;
    for (const kind of ["track", "album", "playlist", "artist", "show", "episode"]) {
      const payload = { brickId: "brk_spotify" as const, state: { url: `https://open.spotify.com/${kind}/abc123` } };
      expect(yield* encodePayload(contract, { version: 1, payload })).toBeDefined();
    }
    for (const url of ["https://example.com/track/abc123", "https://open.spotify.com/user/abc123", "http://open.spotify.com/track/abc123", "https://open.spotify.com/track/abc123?x=1"]) {
      const failure = yield* encodePayload(contract, {
        version: 1, payload: { brickId: "brk_spotify", state: { url } },
      }).pipe(Effect.flip);
      expect(failure).toMatchObject({ code: "encode-command-payload-failed" });
    }
  }),
);
