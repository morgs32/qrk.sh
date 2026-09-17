import { makeModelVersion } from "@zerospin/core/models/makeModel";
import { primitives } from "@zerospin/schema";
import { Schema } from "effect";

import { githubProfileModel } from "./githubProfileModel";

export const githubProfileModelV1 = makeModelVersion(githubProfileModel, {
  attributes: {
    state: primitives.json({
      schema: Schema.Struct({
        login: Schema.String,
        avatar_url: Schema.String,
        name: Schema.NullOr(Schema.String),
        bio: Schema.NullOr(Schema.String),
        location: Schema.NullOr(Schema.String),
        blog: Schema.String,
        public_repos: Schema.Int,
        followers: Schema.Int,
        following: Schema.Int,
      }),
    }),
  },
  indexes: [],
  version: "1.0.0",
});
