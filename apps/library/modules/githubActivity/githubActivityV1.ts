/*
fetcher: async ({ api, payload, setData }) => {
  const result = await api.githubBackend().getProfile(payload.url);
  if (result._tag === "Left") return result;
  if (!Array.isArray(result.right.contributions)) {
    return {
      _tag: "Left",
      left: {
        code: "unsupported-page-shape",
        message: "GitHub profile response did not include contributions",
      },
    };
  }
  setData({ contributions: result.right.contributions });
  return { _tag: "Right", right: undefined };
},
*/

import { makeEffectSchema, primitives } from "@zerospin/schema";
import { Schema } from "effect";

import {
  brickBodyComponent,
  brickFooterComponent,
  brickShellComponent,
  columnComponent,
  rowComponent,
} from "../../lib/jsonRender/layoutComponents";
import { makeDataFetcher } from "../../make/makeDataFetcher";
import { makeModuleVersion } from "../../make/makeModuleVersion";
import { activityCalendarComponent } from "./generative/ActivityCalendarComponent";
import { defaultSpec } from "./generative/defaultSpec";
import { githubActivity } from "./githubActivity";

const payloadShape = {
  url: primitives.text({ defaultValue: "https://github.com/morgs32" }),
};

const dataShape = {
  contributions: primitives.json({
    schema: Schema.mutable(
      Schema.Array(
        Schema.Struct({
          date: Schema.String,
          count: Schema.Int,
          level: Schema.Literals([0, 1, 2, 3, 4]),
        }),
      ),
    ),
  }),
};

const defaultData = {
  contributions: Array.from({ length: 365 }, (_, index) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - (364 - index));

    // Mix each day's index to avoid repeating stripes while keeping samples stable.
    let sample = Math.imul(index + 1, 0x45d9f3b);
    sample = Math.imul(sample ^ (sample >>> 16), 0x45d9f3b);
    sample = (sample ^ (sample >>> 16)) >>> 0;
    const count = sample % 100 < 30 ? 0 : 1 + (sample % 15);
    const level: 0 | 1 | 2 | 3 | 4 =
      count === 0 ? 0 : count <= 3 ? 1 : count <= 7 ? 2 : count <= 11 ? 3 : 4;

    return { date: date.toISOString().slice(0, 10), count, level };
  }),
};

export const githubActivityV1 = makeModuleVersion(githubActivity, {
  version: "1.0.0",
  components: {
    BrickShell: brickShellComponent,
    BrickBody: brickBodyComponent,
    BrickFooter: brickFooterComponent,
    Column: columnComponent,
    Row: rowComponent,
    ActivityCalendar: activityCalendarComponent,
  },
  data: makeDataFetcher({
    payloadShape,
    dataShape,
    defaultData,
  }),
  stateShape: {
    payload: primitives.json({ schema: makeEffectSchema(payloadShape) }),
    data: primitives.json({ schema: makeEffectSchema(dataShape) }),
  },
  defaultState: {
    payload: { url: "https://github.com/morgs32" },
    data: defaultData,
  },
  breakpoints: {
    sm: { defaultSpec },
  },
});
