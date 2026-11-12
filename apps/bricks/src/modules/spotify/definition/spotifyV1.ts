import { makeEffectSchema, primitives } from "@zerospin/shapes";
import { Schema } from "effect";

import { defineComponentMetadata } from "../../../definition/defineComponentMetadata";
import { defineModule } from "../../../definition/defineModule";
import { makeModuleVersion } from "../../../definition/makeModuleVersion";
import { spotifyUrlSchema } from "./spotifySchemas";

export const spotifyPlayerComponentMetadata = defineComponentMetadata({
  type: "SpotifyPlayer",
  propsShape: {},
  description: "An interactive Spotify player for the selected content.",
});

export const spotifyV1 = makeModuleVersion(
  defineModule({
    id: "spotify",
    abbreviation: "spt",
    label: "Spotify",
    description: "Share music and podcasts with a Spotify player.",
  }),
  {
    version: 1,
    variants: {
      default: {
        defaultWidth: 480,
        minWidth: 320,
        defaultHeight: 360,
        minHeight: 180,
      },
    },
    hasPlaceholder: true,
    componentMetadata: { SpotifyPlayer: spotifyPlayerComponentMetadata },
    defaultSpec: {
      root: "player",
      elements: { player: { type: "SpotifyPlayer", props: {} } },
    },
    stateShape: { url: primitives.json({ schema: Schema.NullOr(spotifyUrlSchema) }) },
  },
);

export const completeStateSchema = Schema.toType(makeEffectSchema(spotifyV1.stateShape)).check(
  Schema.makeFilter((state) => state.url !== null || "A Spotify URL is required"),
);
