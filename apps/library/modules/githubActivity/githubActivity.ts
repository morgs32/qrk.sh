import { primitives } from "@zerospin/schema";
import { Schema } from "effect";

import { defineModule } from "../../make/defineModule";
import { makeDataFetcher } from "../../make/makeDataFetcher";
import { defaultSpec } from "./generative/defaultSpec";
import { githubActivityJsonRenderCatalog } from "./generative/GitHubActivityJsonRenderCatalog";

export const githubActivity = defineModule({
  id: "github-activity",
  label: "GitHub Activity",
  description: "A GitHub contribution activity calendar.",
  catalog: githubActivityJsonRenderCatalog,
  data: makeDataFetcher({
    payloadShape: {
      url: primitives.text({ defaultValue: "https://github.com/morgs32" }),
    },
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
    dataShape: {
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
    },
    defaultData: {
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
    },
  }),
  breakpoints: {
    sm: { defaultSpec },
  },
});
