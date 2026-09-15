"use client";

import { makeEffectSchema } from "@zerospin/schema";
import { ActionProvider, Renderer, StateProvider, VisibilityProvider } from "@json-render/react";
import { Schema } from "effect";

import { buildGitHubProfileSpec } from "./buildGitHubProfileSpec";
import { githubProfile } from "./githubProfile";
import { registry } from "./GitHubProfileJsonRenderRegistry";

export function GitHubProfileJsonRenderCompare(props: { data: unknown }) {
  const dataShape = githubProfile.dataShape;
  if (dataShape === null) {
    throw new Error("github-profile module requires a dataShape");
  }

  const data = Schema.decodeUnknownSync(Schema.toType(makeEffectSchema(dataShape)))(props.data, {
    onExcessProperty: "preserve",
  });

  const spec = buildGitHubProfileSpec({
    login: data.login,
    avatar_url: data.avatar_url,
    name: data.name,
    bio: data.bio,
    location: data.location,
    blog: data.blog,
    public_repos: data.public_repos,
    followers: data.followers,
    following: data.following,
  });

  return (
    <div className="size-full overflow-hidden" data-github-profile-json-render-compare>
      <StateProvider initialState={{}}>
        <VisibilityProvider>
          <ActionProvider handlers={{}}>
            <Renderer spec={spec} registry={registry} />
          </ActionProvider>
        </VisibilityProvider>
      </StateProvider>
    </div>
  );
}
