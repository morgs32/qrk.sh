import { defaultSpec } from "./generator/defaultSpec";

import { makeEffectSchema, primitives } from "@zerospin/shapes";

import { Schema } from "effect";

import {
  brickBodyComponentMetadata,
  brickFooterComponentMetadata,
  brickShellComponentMetadata,
  columnComponentMetadata,
  rowComponentMetadata,
} from "../../definition/layoutComponentMetadata";

import { makeModuleVersion } from "../../definition/makeModuleVersion";

import { activityCalendarComponentMetadata } from "./generator/ActivityCalendarComponentMetadata";

import { githubActivity } from "./githubActivity";

const payloadShape = {
  url: primitives.text({ defaultValue: "https://github.com/morgs32" }),
};

const dataShape = {
  contributions: primitives.json({
    schema: Schema.mutable(
      Schema.Array(
        Schema.Struct({
          date: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)),
          count: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
          level: Schema.Literals([0, 1, 2, 3, 4]),
        }),
      ),
    ),
  }),
};

export const githubActivityV1 = makeModuleVersion(githubActivity, {
  version: 1,
  variants: {
    default: {
      defaultWidth: 656,
      minWidth: 320,
      defaultHeight: 180,
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
    ActivityCalendar: activityCalendarComponentMetadata,
  },
  stateShape: {
    payload: primitives.json({ schema: makeEffectSchema(payloadShape) }),
    data: primitives.json({ nullable: true, schema: makeEffectSchema(dataShape) }),
  },
});
