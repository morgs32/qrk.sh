"use client";

import { makeEffectSchema } from "@zerospin/schema";
import { ActionProvider, Renderer, StateProvider, VisibilityProvider } from "@json-render/react";
import { Schema } from "effect";

import type { Spec } from "@json-render/core";

import { buildGitHubProfileSpec } from "./buildGitHubProfileSpec";
import { githubProfile } from "../githubProfile";
import { registry } from "./GitHubProfileJsonRenderRegistry";

export function GitHubProfileJsonRenderCompare(props: { data: unknown; spec?: Spec }) {
  const dataShape = githubProfile.dataShape;
  if (dataShape === null) {
    throw new Error("github-profile module requires a dataShape");
  }

  const data = Schema.decodeUnknownSync(Schema.toType(makeEffectSchema(dataShape)))(props.data, {
    onExcessProperty: "preserve",
  });

  const spec = props.spec ?? buildGitHubProfileSpec();

  return (
    <div className="size-full overflow-hidden" data-github-profile-json-render-compare>
      <StateProvider initialState={data}>
        <VisibilityProvider>
          <ActionProvider handlers={{}}>
            <Renderer spec={spec} registry={registry} />
          </ActionProvider>
        </VisibilityProvider>
      </StateProvider>
    </div>
  );
}
