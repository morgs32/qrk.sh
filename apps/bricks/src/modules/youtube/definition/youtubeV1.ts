import { makeEffectSchema, primitives } from "@zerospin/shapes";
import { Schema } from "effect";
import { defineComponentMetadata } from "../../../definition/defineComponentMetadata";
import { defineModule } from "../../../definition/defineModule";
import { makeModuleVersion } from "../../../definition/makeModuleVersion";
import { youtubeContentSchema } from "./youtubeSchemas";

export const youtubePlayerComponentMetadata = defineComponentMetadata({
  type: "YoutubePlayer",
  propsShape: {},
  description: "An interactive YouTube video or playlist player.",
});

export const youtubeV1 = makeModuleVersion(
  defineModule({ id: "youtube", abbreviation: "ytb", label: "YouTube", description: "Share a YouTube video or playlist." }),
  {
    version: 1,
    variants: { default: { defaultWidth: 480, minWidth: 320, defaultHeight: 360, minHeight: 200 } },
    hasPlaceholder: true,
    componentMetadata: { YoutubePlayer: youtubePlayerComponentMetadata },
    defaultSpec: { root: "player", elements: { player: { type: "YoutubePlayer", props: {} } } },
    stateShape: { content: primitives.json({ schema: Schema.NullOr(youtubeContentSchema) }) },
  },
);

export const completeStateSchema = Schema.toType(makeEffectSchema(youtubeV1.stateShape)).check(
  Schema.makeFilter((state) => state.content !== null || "A YouTube video or playlist is required"),
);
