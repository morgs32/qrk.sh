import { normalizeInstagramInput } from "./normalizeInstagramInput";
import { defaultSpec } from "./generator/defaultSpec";

import { makeEffectSchema, primitives } from "@zerospin/shapes";

import { Schema } from "effect";

import {
  brickBodyComponentMetadata,
  brickFooterComponentMetadata,
  brickShellComponentMetadata,
  columnComponentMetadata,
  rowComponentMetadata,
} from "../../../definition/layoutComponentMetadata";

import { makeModuleVersion } from "../../../definition/makeModuleVersion";

import { instagramCardComponentMetadata } from "./generator/InstagramCardComponentMetadata";

import { instagramMediaFooterComponentMetadata } from "./generator/InstagramMediaFooterComponentMetadata";

import { instagramPostGridComponentMetadata } from "./generator/InstagramPostGridComponentMetadata";

import { instagram } from "./instagram";

const payloadShape = {
  url: primitives.text({
    defaultValue: "https://www.instagram.com/theonion",
  }),
};

const dataShape = {
  username: primitives.text(),
  profileImageUrl: primitives.text(),
  followersText: primitives.text(),
  postImageUrls: primitives.json({
    schema: Schema.mutable(Schema.Array(Schema.String).check(Schema.isMaxLength(4))),
  }),
};

export const instagramV1 = makeModuleVersion(instagram, {
  version: 1,
  variants: {
    default: {
      defaultWidth: 400,
      minWidth: 320,
      defaultHeight: 360,
    },
  },
  defaultSpec,
  hasPlaceholder: true,
  componentMetadata: {
    BrickShell: brickShellComponentMetadata,
    BrickBody: brickBodyComponentMetadata,
    BrickFooter: brickFooterComponentMetadata,
    Column: columnComponentMetadata,
    Row: rowComponentMetadata,
    InstagramCard: instagramCardComponentMetadata,
    InstagramPostGrid: instagramPostGridComponentMetadata,
    InstagramMediaFooter: instagramMediaFooterComponentMetadata,
  },
  stateShape: {
    payload: primitives.json({ schema: makeEffectSchema(payloadShape) }),
    data: primitives.json({ nullable: true, schema: makeEffectSchema(dataShape) }),
  },
});

export const completeStateSchema = Schema.toType(makeEffectSchema(instagramV1.stateShape)).check(
  Schema.makeFilter((state) =>
    (state.data !== null && normalizeInstagramInput(state.payload.url) === state.payload.url) || "A configured source and content are required",
  ),
);
