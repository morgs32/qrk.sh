"use client";

import { Select } from "@base-ui/react/select";
import type { IResult } from "@zerospin/error";
import type { IInferDecodedRow } from "@zerospin/shapes";
import { useEffect, useId, useState } from "react";
import { Button } from "../../../components/button";
import { Field, FieldContent, FieldGroup, FieldLabel } from "../../../components/field";
import { SelectContent, SelectItem, SelectTrigger } from "../../../components/select";
import { TextInput } from "../../../components/TextInput";
import { useWarnBeforeUnload } from "../../react/useWarnBeforeUnload";
import { parseYoutubeUrl } from "../definition/youtubeSchemas";
import type { youtubeV1 } from "../definition/youtubeV1";

export function YoutubeForm(props: {
  state: IInferDecodedRow<typeof youtubeV1.stateShape> | null;
  onSave: (state: IInferDecodedRow<typeof youtubeV1.stateShape>) => IResult<unknown, { message: string }>;
  onDraftChange?: (draft: { state: unknown; pending: boolean; valid: boolean }) => void;
}) {
  const { state, onSave, onDraftChange } = props;
  const [draft, setDraft] = useState<string>();
  const [choice, setChoice] = useState<"video" | "playlist" | null>(null);
  const [error, setError] = useState<string>();
  const choiceId = useId();
  const previous = state?.content;
  const savedUrl = previous == null ? "" : previous.videoId === null
    ? `https://www.youtube.com/playlist?list=${previous.playlistId}${previous.startSeconds ? `&t=${previous.startSeconds}` : ""}`
    : `https://www.youtube.com/watch?v=${previous.videoId}${previous.playlistId ? `&list=${previous.playlistId}` : ""}${previous.startSeconds ? `&t=${previous.startSeconds}` : ""}`;
  const url = draft ?? savedUrl;
  const parsed = parseYoutubeUrl(url);
  const selected = parsed === undefined ? null
    : parsed.videoId === null ? "playlist"
    : parsed.playlistId === null ? "video"
    : choice ?? (draft === undefined ? previous?.kind ?? null : null);

  useWarnBeforeUnload(draft !== undefined || (choice !== null && choice !== previous?.kind));
  useEffect(() => {
    const current = parseYoutubeUrl(url);
    const kind = current === undefined ? null
      : current.videoId === null ? "playlist"
      : current.playlistId === null ? "video"
      : choice ?? (draft === undefined ? state?.content?.kind ?? null : null);
    onDraftChange?.({
      state: current === undefined || kind === null ? state : { content: { ...current, kind } },
      pending: false,
      valid: current !== undefined && kind !== null && error === undefined,
    });
  }, [url, choice, draft, state, onDraftChange, error]);

  return <form autoComplete="off" onSubmit={(event) => {
    event.preventDefault();
    if (parsed === undefined) { setError("Enter a YouTube video or playlist link."); return; }
    if (selected === null) { setError("Choose whether to show the video or playlist."); return; }
    const result = onSave({ content: { ...parsed, kind: selected } });
    if (result._tag === "Failure") { setError(result.failure.message); return; }
    setError(undefined);
    setDraft(undefined);
    setChoice(null);
  }}>
    <FieldGroup>
      <TextInput label="YouTube link" orientation="vertical" description="Paste a video or playlist link." value={url} error={error} aria-invalid={error !== undefined || undefined} onChange={(event) => {
        onDraftChange?.({ state, pending: false, valid: false });
        setDraft(event.currentTarget.value);
        setChoice(null);
        setError(undefined);
      }} autoCapitalize="none" autoCorrect="off" spellCheck={false} type="url" />
      {parsed?.videoId !== null && parsed?.videoId !== undefined && parsed.playlistId !== null ? <Field orientation="vertical">
        <FieldLabel htmlFor={choiceId}>Show</FieldLabel>
        <FieldContent><Select.Root value={selected} onValueChange={(value) => { if (value === "video" || value === "playlist") { setChoice(value); setError(undefined); } }}>
          <SelectTrigger id={choiceId}><Select.Value placeholder="Choose video or playlist" /></SelectTrigger>
          <SelectContent><SelectItem value="video">Video</SelectItem><SelectItem value="playlist">Playlist</SelectItem></SelectContent>
        </Select.Root></FieldContent>
      </Field> : null}
      <Button type="submit">Save</Button>
    </FieldGroup>
  </form>;
}
