"use client";

import { newSyncRpcSession } from "@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession";
import { makeEffectSchema } from "@zerospin/schema";
import { Schema } from "effect";
import { useId, useState } from "react";
import useSWRMutation from "swr/mutation";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import type { LibraryApi } from "../../worker/LibraryApi.public";
import { githubRepoV1 } from "./githubRepoV1";

export function GitHubRepoForm(props: { state: unknown; onSave: (state: unknown) => void }) {
  const { state, onSave } = props;
  const StateSchema = Schema.NullOr(Schema.toType(makeEffectSchema(githubRepoV1.stateShape)));
  const savedState = Schema.decodeUnknownSync(StateSchema)(state, {
    onExcessProperty: "ignore",
  });
  const inputId = useId();
  const feedbackId = `${inputId}-feedback`;
  const [repository, setRepository] = useState(savedState?.payload.url ?? "");
  const [saveError, setSaveError] = useState<string>();
  const [normalizedUrl, savedUrl] = [repository.trim(), savedState?.payload.url ?? ""].map(
    (input, index) => {
      try {
        const parsed = new URL(input);
        const pathSegments = parsed.pathname.split("/").filter((segment) => segment.length > 0);
        const owner = pathSegments[0];
        const repoSegment = pathSegments[1];
        const repo =
          repoSegment === undefined || index === 1 || input === savedState?.payload.url
            ? repoSegment
            : repoSegment.replace(/\.git$/i, "");
        if (
          parsed.protocol !== "https:" ||
          parsed.hostname !== "github.com" ||
          pathSegments.length !== 2 ||
          owner === undefined ||
          repo === undefined ||
          !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(owner) ||
          !/^[A-Za-z0-9._-]+$/.test(repo)
        ) {
          return undefined;
        }
        return `https://github.com/${owner.toLowerCase()}/${repo}`;
      } catch {
        return undefined;
      }
    },
  );
  const { trigger, isMutating } = useSWRMutation(
    "/rpc:getGitHubRepo",
    async (_key, options: { arg: string }) => {
      const { arg } = options;
      using api = newSyncRpcSession<LibraryApi>("/rpc");
      const result = await api.getGitHubRepo(arg);
      if (result._tag === "Left") {
        throw new Error(result.left.message);
      }
      return result.right;
    },
    { revalidate: false },
  );
  const canSave = normalizedUrl !== undefined && normalizedUrl !== savedUrl && !isMutating;

  return (
    <form
      aria-busy={isMutating}
      className="mx-auto flex max-w-md flex-col gap-2 p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!canSave || normalizedUrl === undefined) {
          return;
        }
        const submittedInput = repository.trim();
        const submittedUrl = normalizedUrl;
        setSaveError(undefined);
        try {
          const fetchedRepo = await trigger(submittedInput);
          const nextState = Schema.decodeUnknownSync(StateSchema)(
            { payload: { url: submittedUrl }, data: fetchedRepo },
            { onExcessProperty: "ignore" },
          );
          onSave(nextState);
        } catch (cause) {
          setSaveError(cause instanceof Error ? cause.message : String(cause));
        }
      }}
    >
      <label className="font-medium" htmlFor={inputId}>
        GitHub repository URL
      </label>
      <Input
        aria-describedby={feedbackId}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        disabled={isMutating}
        id={inputId}
        onChange={(event) => {
          setRepository(event.target.value);
          setSaveError(undefined);
        }}
        placeholder="https://github.com/morgs32/qrk.sh"
        spellCheck={false}
        type="text"
        value={repository}
      />
      <p aria-live="polite" className="m-0 break-words" id={feedbackId}>
        {normalizedUrl !== undefined
          ? `Repository URL: ${normalizedUrl}`
          : "Enter a GitHub repository URL."}
      </p>
      {saveError !== undefined ? (
        <p className="m-0 break-words" role="alert">
          {saveError}
        </p>
      ) : null}
      <Button className="self-end" disabled={!canSave} type="submit">
        {isMutating ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
