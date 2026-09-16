"use client";

import type { Spec } from "@json-render/core";
import {
  ActionProvider,
  Renderer,
  StateProvider,
  VisibilityProvider,
  type ComponentRegistry,
} from "@json-render/react";
import { Schema } from "effect";
import useSWR from "swr";

import { BrickShell } from "../../../components/brick/BrickShell";

const GITHUB_REPO_OWNER = "morgs32";
const GITHUB_REPO_NAME = "ink-steps";

const RepoDataSchema = Schema.Struct({
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  stargazers_count: Schema.Number,
  forks_count: Schema.Number,
  language: Schema.NullOr(Schema.String),
  html_url: Schema.String,
});

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const data = await response.json();
  return Schema.decodeUnknownSync(RepoDataSchema)(data, { onExcessProperty: "ignore" });
};

/** Client-fetch brick wrapper: SWR → StateProvider → Renderer. */
export function GitHubRepoBrick(props: {
  data: unknown;
  breakpointOptions: unknown;
  breakpoint: "sm" | "md" | "lg" | "xl";
  defaultSpec: Spec;
  spec?: Spec;
  registry: ComponentRegistry;
}) {
  const { data, isLoading } = useSWR(
    `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`,
    fetcher,
  );

  if (isLoading) {
    return (
      <BrickShell className="min-w-0">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-1/2 rounded bg-zinc-200" />
          <div className="h-4 w-3/4 rounded bg-zinc-200" />
          <div className="mt-4 h-4 w-1/4 rounded bg-zinc-200" />
        </div>
      </BrickShell>
    );
  }

  if (!data || data.name === undefined) {
    return (
      <BrickShell className="min-w-0">
        <p>Repository not found</p>
      </BrickShell>
    );
  }

  return (
    <StateProvider initialState={data}>
      <VisibilityProvider>
        <ActionProvider handlers={{}}>
          <Renderer spec={props.spec ?? props.defaultSpec} registry={props.registry} />
        </ActionProvider>
      </VisibilityProvider>
    </StateProvider>
  );
}
