import { makeModelVersion, primitives } from "@zerospin/sdk/browser";
import { Schema } from "effect";

import { siteV2 as Site } from "../site/SiteV2";

import { page } from "./page";

const ArticleDocSchema = Schema.Struct({
  type: Schema.Literal("doc"),
  content: Schema.optional(Schema.Array(Schema.Unknown)),
  attrs: Schema.optional(Schema.Unknown),
  marks: Schema.optional(Schema.Array(Schema.Unknown)),
  text: Schema.optional(Schema.String),
});

export const pageV2 = makeModelVersion(page, {
  attributes: {
    siteId: primitives.ref({
      table: Site.table,
      relation: "site",
      inverse: "pages",
    }),
    slug: primitives.text(),
    title: primitives.text({
      nullable: true,
      defaultValue: null,
    }),
    description: primitives.text({
      nullable: true,
      defaultValue: null,
    }),
    pageType: primitives.enum({
      values: ["split-scroll", "shared-scroll"],
    }),
    article: primitives.json({
      nullable: true,
      defaultValue: null,
      schema: ArticleDocSchema,
    }),
  },
  indexes: [],
  version: "2.0.0",
});
