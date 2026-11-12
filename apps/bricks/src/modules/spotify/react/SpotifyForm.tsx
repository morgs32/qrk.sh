"use client";

import { newSyncRpcSession } from "@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession";
import type { IResult } from "@zerospin/error";
import type { IInferDecodedRow } from "@zerospin/shapes";
import { useEffect, useRef, useState } from "react";

import { Button } from "../../../components/button";
import { FieldGroup } from "../../../components/field";
import { TextInput } from "../../../components/TextInput";
import type { BricksApi } from "../../../rpc/BricksApi";
import { useWarnBeforeUnload } from "../../react/useWarnBeforeUnload";
import { normalizeSpotifyUrl } from "../definition/spotifySchemas";
import type { spotifyV1 } from "../definition/spotifyV1";

export function SpotifyForm(props: {
  state: IInferDecodedRow<typeof spotifyV1.stateShape> | null;
  onSave: (
    state: IInferDecodedRow<typeof spotifyV1.stateShape>,
  ) => IResult<unknown, { message: string }>;
  onDraftChange?: (draft: { state: unknown; pending: boolean; valid: boolean }) => void;
}) {
  const { state, onSave, onDraftChange } = props;
  const [draft, setDraft] = useState<string>();
  const [error, setError] = useState<string>();
  const [resolving, setResolving] = useState(false);
  const activeRequest = useRef<AbortController>(null);
  const url = draft ?? state?.url ?? "";
  useEffect(() => {
    const normalized = normalizeSpotifyUrl(url);
    onDraftChange?.({
      state: normalized === undefined ? state : { url: normalized },
      pending: resolving,
      valid: normalized !== undefined && !resolving && error === undefined,
    });
  }, [onDraftChange, state, url, resolving, error]);
  useWarnBeforeUnload(resolving || draft !== undefined);
  useEffect(() => () => activeRequest.current?.abort(), []);

  async function save() {
    const directUrl = normalizeSpotifyUrl(url);
    let normalized = directUrl;
    if (normalized === undefined) {
      const parsed = URL.parse(url.trim());
      if (
        parsed === null ||
        parsed.protocol !== "https:" ||
        parsed.hostname !== "spotify.link" ||
        parsed.username ||
        parsed.password ||
        parsed.port
      ) {
        setError("Enter a Spotify track, album, playlist, artist, show, or episode link.");
        return;
      }

      activeRequest.current?.abort();
      const request = new AbortController();
      activeRequest.current = request;
      setResolving(true);
      setError(undefined);
      try {
        using api = newSyncRpcSession<BricksApi>("/rpc");
        const close = () => api[Symbol.dispose]();
        request.signal.addEventListener("abort", close, { once: true });
        try {
          const response = await api.resolveSpotifyLink(url.trim());
          if (request.signal.aborted) return;
          if (response._tag === "Left") {
            setError(response.left.message);
            return;
          }
          normalized = normalizeSpotifyUrl(response.right);
          if (normalized === undefined || normalized !== response.right) {
            setError("Spotify returned an unsupported link. Try another link.");
            return;
          }
        } finally {
          request.signal.removeEventListener("abort", close);
        }
      } catch {
        if (!request.signal.aborted) setError("Unable to resolve this Spotify link. Try again.");
        return;
      } finally {
        if (activeRequest.current === request) {
          activeRequest.current = null;
          setResolving(false);
        }
      }
    }

    const result = onSave({ url: normalized });
    if (result._tag === "Failure") {
      setError(result.failure.message);
      return;
    }
    setError(undefined);
    setDraft(undefined);
  }

  return (
    <form
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <FieldGroup>
        <TextInput
          label="Spotify link"
          orientation="vertical"
          description="Paste a track, album, playlist, artist, show, or episode link."
          value={url}
          error={error}
          aria-invalid={error !== undefined || undefined}
          status={resolving ? "Resolving Spotify link…" : undefined}
          onChange={(event) => {
            onDraftChange?.({ state, pending: false, valid: false });
            activeRequest.current?.abort();
            activeRequest.current = null;
            setResolving(false);
            setDraft(event.currentTarget.value);
            setError(undefined);
          }}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          type="url"
        />
        <Button type="submit" disabled={resolving}>
          Save
        </Button>
      </FieldGroup>
    </form>
  );
}
