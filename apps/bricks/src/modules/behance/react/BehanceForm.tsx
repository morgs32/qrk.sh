"use client";

import { newSyncRpcSession } from "@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession";
import type { IResult } from "@zerospin/error";
import type { IInferDecodedRow } from "@zerospin/shapes";
import { Schema } from "effect";
import { useEffect, useRef, useState } from "react";

import { Button } from "../../../components/button";
import { Checkbox } from "../../../components/checkbox";
import { FieldGroup } from "../../../components/field";
import { TextInput } from "../../../components/TextInput";
import type { BricksApi } from "../../../rpc/BricksApi";
import { useWarnBeforeUnload } from "../../react/useWarnBeforeUnload";
import { behanceImportSchema, normalizeBehanceProfile } from "../definition/behanceSchemas";
import type { behanceV1 } from "../definition/behanceV1";

export function BehanceForm(props: {
  state: IInferDecodedRow<typeof behanceV1.stateShape> | null;
  onSave: (
    state: IInferDecodedRow<typeof behanceV1.stateShape>,
  ) => IResult<unknown, { message: string }>;
}) {
  const { state, onSave } = props;
  const [urlDraft, setUrlDraft] = useState<string>();
  const url = urlDraft ?? state?.payload.url ?? "";
  const [imported, setImported] = useState<typeof behanceImportSchema.Type>();
  const [selectedIds, setSelectedIds] = useState<string[]>();
  const [error, setError] = useState<string>();
  const [importing, setImporting] = useState(false);
  const activeRequest = useRef<AbortController>(null);

  const candidates = imported?.projects ?? state?.data.projects ?? [];
  const selected = selectedIds ?? state?.data.projects.map((project) => project.id) ?? [];
  useWarnBeforeUnload(
    importing ||
      url !== (state?.payload.url ?? "") ||
      imported !== undefined ||
      selectedIds !== undefined,
  );
  useEffect(() => () => activeRequest.current?.abort(), []);

  async function importProjects() {
    const normalized = normalizeBehanceProfile(url);
    if (normalized === undefined) {
      setError("Enter a public Behance profile URL.");
      return;
    }

    activeRequest.current?.abort();
    const request = new AbortController();
    activeRequest.current = request;
    setImporting(true);
    setError(undefined);
    try {
      using api = newSyncRpcSession<BricksApi>("/rpc");
      const close = () => api[Symbol.dispose]();
      request.signal.addEventListener("abort", close, { once: true });
      try {
        const response = await api.getBehanceProfile(normalized);
        if (request.signal.aborted) return;
        if (response._tag === "Left") {
          setError(response.left.message);
          return;
        }
        const profile = Schema.decodeUnknownSync(behanceImportSchema)(response.right);
        if (profile.url !== normalized) throw new Error("Behance profile identity mismatch");
        const savedIds = state?.data.projects.map((project) => project.id) ?? [];
        setSelectedIds(
          state?.payload.url === normalized
            ? profile.projects
                .filter((project) => savedIds.includes(project.id))
                .map((project) => project.id)
            : profile.projects.slice(0, 4).map((project) => project.id),
        );
        setImported(profile);
      } finally {
        request.signal.removeEventListener("abort", close);
      }
    } catch {
      if (!request.signal.aborted) setError("Unable to import this Behance profile. Try again.");
    } finally {
      if (activeRequest.current === request) {
        activeRequest.current = null;
        setImporting(false);
      }
    }
  }

  return (
    <form
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault();
        const profile =
          imported ?? (state === null ? undefined : { ...state.data, url: state.payload.url });
        if (profile === undefined || profile.url !== normalizeBehanceProfile(url) || importing)
          return;
        const result = onSave({
          payload: { url: profile.url },
          data: {
            displayName: profile.displayName,
            projects: profile.projects.filter((project) => selected.includes(project.id)),
          },
        });
        if (result._tag === "Failure") {
          setError(result.failure.message);
          return;
        }
        setError(undefined);
        setImported(undefined);
        setSelectedIds(undefined);
        setUrlDraft(undefined);
      }}
    >
      <FieldGroup>
        <TextInput
          label="Behance profile URL"
          orientation="vertical"
          value={url}
          autoCapitalize="none"
          error={error}
          status={importing ? "Importing projects…" : undefined}
          onChange={(event) => {
            activeRequest.current?.abort();
            activeRequest.current = null;
            setUrlDraft(event.currentTarget.value);
            setImported(undefined);
            setSelectedIds(undefined);
            setImporting(false);
            setError(undefined);
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={importing}
          onClick={() => void importProjects()}
        >
          Import projects
        </Button>
        {(imported?.url ?? state?.payload.url) === normalizeBehanceProfile(url) &&
          (imported !== undefined || state !== null) && (
            <fieldset className="flex min-w-0 flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Projects ({selected.length}/4)</legend>
              {candidates.length === 0 && (
                <p className="text-sm">No public project covers were returned.</p>
              )}
              {candidates.map((project) => (
                <label key={project.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selected.includes(project.id)}
                    disabled={!selected.includes(project.id) && selected.length >= 4}
                    onCheckedChange={(checked) => {
                      setSelectedIds(
                        checked
                          ? [...selected, project.id]
                          : selected.filter((id) => id !== project.id),
                      );
                    }}
                  />
                  <img
                    alt=""
                    src={project.coverUrl}
                    loading="lazy"
                    className="size-10 rounded object-cover"
                  />
                  <span className="min-w-0 break-words">{project.title}</span>
                </label>
              ))}
            </fieldset>
          )}
        <Button
          type="submit"
          disabled={importing || (imported === undefined && selectedIds === undefined)}
        >
          Save
        </Button>
      </FieldGroup>
    </form>
  );
}
