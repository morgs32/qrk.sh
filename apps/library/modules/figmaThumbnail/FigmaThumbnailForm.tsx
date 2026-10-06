"use client";

import { newSyncRpcSession } from "@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession";
import { makeEffectSchema } from "@zerospin/shapes";
import { Schema } from "effect";
import { useId, useState } from "react";
import useSWRMutation from "swr/mutation";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import type { LibraryApi } from "../../worker/LibraryApi.public";
import { figmaThumbnailV1 } from "./figmaThumbnailV1";

export function FigmaThumbnailForm(props: { state: unknown; onSave: (state: unknown) => void }) {
  const { state, onSave } = props;
  const StateSchema = Schema.NullOr(Schema.toType(makeEffectSchema(figmaThumbnailV1.stateShape)));
  const savedState = Schema.decodeUnknownSync(StateSchema)(state, {
    onExcessProperty: "ignore",
  });
  const inputId = useId();
  const feedbackId = `${inputId}-feedback`;
  const [documentUrl, setDocumentUrl] = useState(savedState?.payload.url ?? "");
  const [saveError, setSaveError] = useState<string>();
  const [normalizedUrl, savedUrl] = [documentUrl.trim(), savedState?.payload.url ?? ""].map(
    (input) => {
      try {
        const parsed = new URL(input);
        const pathSegments = parsed.pathname.split("/");
        const inputType = pathSegments[1];
        const fileKey = pathSegments[2];
        const hasSupportedHost =
          parsed.hostname === "figma.com" || parsed.hostname === "www.figma.com";
        const hasSupportedType =
          inputType === "design" ||
          inputType === "file" ||
          inputType === "board" ||
          inputType === "slides" ||
          inputType === "deck" ||
          inputType === "proto";
        if (
          parsed.protocol !== "https:" ||
          !hasSupportedHost ||
          !hasSupportedType ||
          fileKey === undefined ||
          !/^[a-zA-Z0-9]{22,128}$/.test(fileKey)
        ) {
          return undefined;
        }
        const canonicalType =
          inputType === "deck" ? "slides" : inputType === "file" ? "design" : inputType;
        return `https://www.figma.com/${canonicalType}/${fileKey}`;
      } catch {
        return undefined;
      }
    },
  );
  const { trigger, isMutating } = useSWRMutation(
    "/rpc:figmaBackend.getThumbnail",
    async (_key, options: { arg: string }) => {
      const { arg } = options;
      using api = newSyncRpcSession<LibraryApi>("/rpc");
      const result = await api.figmaBackend().getThumbnail(arg);
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
          const fetchedMetadata = await trigger(submittedUrl);
          const nextState = Schema.decodeUnknownSync(StateSchema)(
            { payload: { url: submittedUrl }, data: fetchedMetadata },
            { onExcessProperty: "ignore" },
          );
          onSave(nextState);
        } catch (cause) {
          setSaveError(cause instanceof Error ? cause.message : String(cause));
        }
      }}
    >
      <label className="font-medium" htmlFor={inputId}>
        Figma document URL
      </label>
      <Input
        aria-describedby={feedbackId}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        disabled={isMutating}
        id={inputId}
        onChange={(event) => {
          setDocumentUrl(event.target.value);
          setSaveError(undefined);
        }}
        placeholder="https://www.figma.com/design/AbCdEfGhIjKlMnOpQrStUv"
        spellCheck={false}
        type="text"
        value={documentUrl}
      />
      <p aria-live="polite" className="m-0 break-words" id={feedbackId}>
        {normalizedUrl !== undefined
          ? `Document URL: ${normalizedUrl}`
          : "Enter an HTTPS Figma document URL."}
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
