"use client";

import { newSyncRpcSession } from "@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession";
import { makeEffectSchema } from "@zerospin/shapes";
import { Schema } from "effect";
import { useId, useState } from "react";
import useSWRMutation from "swr/mutation";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import type { LibraryApi } from "../../worker/LibraryApi.public";
import { instagramV1 } from "./instagramV1";

export function InstagramForm(props: { state: unknown; onSave: (state: unknown) => void }) {
  const { state, onSave } = props;
  const StateSchema = Schema.NullOr(Schema.toType(makeEffectSchema(instagramV1.stateShape)));
  const savedState = Schema.decodeUnknownSync(StateSchema)(state, {
    onExcessProperty: "ignore",
  });
  const inputId = useId();
  const feedbackId = `${inputId}-feedback`;
  const [profile, setProfile] = useState(savedState?.payload.url ?? "");
  const [saveError, setSaveError] = useState<string>();
  const value = profile.trim();
  const isUsername = /^@?[a-z\d._]{1,30}$/i.test(value);
  let normalizedUrl: string | undefined;
  try {
    const parsed = new URL(
      isUsername ? `https://www.instagram.com/${value.replace(/^@/, "")}` : value,
    );
    const pathSegments = parsed.pathname.split("/").filter((segment) => segment.length > 0);
    if (
      parsed.protocol === "https:" &&
      (parsed.hostname === "instagram.com" || parsed.hostname === "www.instagram.com") &&
      parsed.username.length === 0 &&
      parsed.password.length === 0 &&
      parsed.port.length === 0 &&
      pathSegments.length === 1 &&
      /^[a-z\d._]{1,30}$/i.test(pathSegments[0])
    ) {
      normalizedUrl = `https://www.instagram.com/${pathSegments[0].toLowerCase()}`;
    }
  } catch {
    normalizedUrl = undefined;
  }
  const { trigger, isMutating } = useSWRMutation(
    "/rpc:getInstagramProfile",
    async (_key, options: { arg: string }) => {
      const { arg } = options;
      using api = newSyncRpcSession<LibraryApi>("/rpc");
      const result = await api.getInstagramProfile(arg);
      if (result._tag === "Left") {
        throw new Error(result.left.message);
      }
      return result.right;
    },
    { revalidate: false },
  );
  const canSave = normalizedUrl !== undefined && !isMutating;

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
        Instagram profile URL or username
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
        placeholder="https://www.instagram.com/theonion or theonion"
        spellCheck={false}
        type="text"
        value={profile}
      />
      <p aria-live="polite" className="m-0 break-words" id={feedbackId}>
        {normalizedUrl !== undefined
          ? `Profile URL: ${normalizedUrl}`
          : "Enter an Instagram profile URL or a username."}
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
