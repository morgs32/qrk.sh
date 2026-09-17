import { makeModelVersion } from "@zerospin/core/models/makeModel";
import { primitives } from "@zerospin/schema";
import { Schema } from "effect";

import {
  brickBodyComponent,
  brickFooterComponent,
  brickShellComponent,
  columnComponent,
  rowComponent,
} from "../../lib/jsonRender/layoutComponents";
import { makeComponentSpecSchema } from "../../make/makeComponentSpecSchema";
import { avatarAndUsernameComponent } from "./generative/AvatarAndUsernameComponent";
import { bioComponent } from "./generative/BioComponent";
import { blogComponent } from "./generative/BlogComponent";
import { followersComponent } from "./generative/FollowersComponent";
import { followingComponent } from "./generative/FollowingComponent";
import { locationComponent } from "./generative/LocationComponent";
import { publicReposComponent } from "./generative/PublicReposComponent";
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
    spec: primitives.json({
      schema: Schema.Struct({
        root: Schema.String,
        elements: Schema.Record(
          Schema.String,
          Schema.Union([
            makeComponentSpecSchema(brickShellComponent),
            makeComponentSpecSchema(brickBodyComponent),
            makeComponentSpecSchema(brickFooterComponent),
            makeComponentSpecSchema(columnComponent),
            makeComponentSpecSchema(rowComponent),
            makeComponentSpecSchema(avatarAndUsernameComponent),
            makeComponentSpecSchema(bioComponent),
            makeComponentSpecSchema(locationComponent),
            makeComponentSpecSchema(blogComponent),
            makeComponentSpecSchema(followersComponent),
            makeComponentSpecSchema(followingComponent),
            makeComponentSpecSchema(publicReposComponent),
          ]),
        ),
        state: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
      }),
    }),
  },
  indexes: [],
  version: "1.0.0",
});
