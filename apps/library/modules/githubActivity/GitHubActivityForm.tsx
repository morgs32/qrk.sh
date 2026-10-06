"use client";

import { newSyncRpcSession } from "@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession";
import { makeEffectSchema } from "@zerospin/shapes";
import { Schema } from "effect";
import { useId, useState } from "react";
import useSWRMutation from "swr/mutation";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import type { LibraryApi } from "../../worker/LibraryApi.public";
import { githubActivityV1 } from "./githubActivityV1";

export function GitHubActivityForm(props: { state: unknown; onSave: (state: unknown) => void }) {
  const { state, onSave } = props;
  const StateSchema = Schema.NullOr(Schema.toType(makeEffectSchema(githubActivityV1.stateShape)));
  const savedState = Schema.decodeUnknownSync(StateSchema)(state, {
    onExcessProperty: "ignore",
  });
  const inputId = useId();
  const feedbackId = `${inputId}-feedback`;
  const [profile, setProfile] = useState(savedState?.payload.url ?? "");
  const [saveError, setSaveError] = useState<string>();
  const value = profile.trim();
  const isUsername = /^@?[a-z\d][a-z\d-]*$/i.test(value);
  const [normalizedUrl, savedUrl] = [value, savedState?.payload.url ?? ""].map((input) => {
    try {
      const parsed = new URL(
        /^@?[a-z\d][a-z\d-]*$/i.test(input)
          ? `https://github.com/${input.replace(/^@/, "")}`
          : input,
      );
      const pathSegments = parsed.pathname.split("/").filter((segment) => segment.length > 0);
      if (
        parsed.protocol !== "https:" ||
        parsed.hostname !== "github.com" ||
        pathSegments.length !== 1 ||
        !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(pathSegments[0])
      ) {
        return undefined;
      }
      return `https://github.com/${pathSegments[0].toLowerCase()}`;
    } catch {
      return undefined;
    }
  });
  const { trigger, isMutating } = useSWRMutation(
    "/rpc:getGitHubProfile",
    async (_key, options: { arg: string }) => {
      const { arg } = options;
      using api = newSyncRpcSession<LibraryApi>("/rpc");
      const result = await api.getGitHubProfile(arg);
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
        const submittedUrl = normalizedUrl;
        setSaveError(undefined);
        try {
          const fetchedProfile = await trigger(submittedUrl);
          const nextState = Schema.decodeUnknownSync(StateSchema)(
            { payload: { url: submittedUrl }, data: fetchedProfile },
            { onExcessProperty: "ignore" },
          );
          onSave(nextState);
        } catch (cause) {
          setSaveError(cause instanceof Error ? cause.message : String(cause));
        }
      }}
    >
      <label className="font-medium" htmlFor={inputId}>
        GitHub profile URL or username
      </label>
      <Input
        aria-describedby={feedbackId}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        disabled={isMutating}
        id={inputId}
        onChange={(event) => {
          setProfile(event.target.value);
          setSaveError(undefined);
        }}
        placeholder="https://github.com/octocat or octocat"
        spellCheck={false}
        type="text"
        value={profile}
      />
      <p aria-live="polite" className="m-0 break-words" id={feedbackId}>
        {isUsername && normalizedUrl !== undefined
          ? `Profile URL: ${normalizedUrl}`
          : "Enter a GitHub profile URL or a username."}
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
