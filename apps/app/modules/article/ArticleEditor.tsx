"use client";

import { MeowdownEditor, type EditorHandle } from "@meowdown/react";
import type { articleV1 } from "@qrk.sh/zerospin/src/modules/article/articleV1";
import type { IResult } from "@zerospin/error";
import type { IInferDecodedRow } from "@zerospin/shapes";
import { isEqual } from "es-toolkit";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useWarnBeforeUnload } from "@/lib/useWarnBeforeUnload";
import { BrickShell } from "../components/brick/BrickShell";
import { Button } from "../components/ui/button";

import "./article-font.css";
import "./article-editor.css";

export function ArticleEditor(props: {
  state: IInferDecodedRow<typeof articleV1.stateShape> | null;
  onFocus: () => void;
  onSave: (
    state: IInferDecodedRow<typeof articleV1.stateShape>,
  ) => IResult<unknown, { message: string }>;
  registerFlush: (flush: (onRecover?: () => void) => boolean) => () => void;
}) {
  const { state, onFocus, onSave, registerFlush } = props;
  const savedState = state ?? { title: "", subtitle: "", content: null };
  const [draft, setDraft] = useState<{ state: typeof savedState; bodyChanged: boolean } | null>(
    null,
  );
  // Keep the accepted snapshot visible until the session query echoes it.
  const [staged, setStaged] = useState<typeof savedState | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const editedState = draft?.state ?? staged ?? savedState;
  const [mounted, setMounted] = useState(false);
  const [editorStart, setEditorStart] = useState({ key: 0, markdown: savedState.content ?? "" });
  const editorRef = useRef<EditorHandle>(null);
  // Navigation can request a flush before React commits the latest input event.
  const current = useRef({ draft, staged, savedState, onSave, saveError });
  const composing = useRef(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const pendingRecoveries = useRef(new Set<() => void>());
  const lastAppliedMarkdown = useRef(editorStart.markdown);

  useLayoutEffect(() => {
    current.current.savedState = savedState;
    current.current.onSave = onSave;
    if (current.current.staged !== null && isEqual(current.current.staged, savedState)) {
      current.current.staged = null;
      setStaged(null);
    }
  });

  useWarnBeforeUnload(draft !== null);

  const finishDraft = useCallback(() => {
    current.current.draft = null;
    current.current.saveError = null;
    setDraft(null);
    setSaveError(null);
    const recoveries = [...pendingRecoveries.current];
    pendingRecoveries.current.clear();
    for (const resume of recoveries) resume();
  }, []);

  const flush = useCallback(
    (onRecover?: () => void, retry = false) => {
      window.clearTimeout(saveTimer.current);
      const { draft, staged, savedState, onSave, saveError } = current.current;
      const editor = editorRef.current;
      if (composing.current || editor?.editor?.view.composing || (saveError !== null && !retry)) {
        if (onRecover !== undefined) pendingRecoveries.current.add(onRecover);
        return false;
      }
      if (draft === null) {
        if (onRecover !== undefined) pendingRecoveries.current.delete(onRecover);
        if (pendingRecoveries.current.size > 0) finishDraft();
        return true;
      }
      if (onRecover !== undefined) pendingRecoveries.current.add(onRecover);

      const previous = staged ?? savedState;
      let nextState = draft.state;
      if (draft.bodyChanged) {
        if (editor === null) return false;
        const markdown = editor.getMarkdown();
        nextState = {
          ...nextState,
          content: markdown === "" && previous.content === null ? null : markdown,
        };
      }

      if (!isEqual(nextState, previous)) {
        const result = onSave(nextState);
        if (result._tag === "Failure") {
          current.current.saveError = result.failure.message;
          setSaveError(result.failure.message);
          return false;
        }
        current.current.staged = nextState;
        setStaged(nextState);
      }

      lastAppliedMarkdown.current = nextState.content ?? "";
      // The current caller can proceed on true. Resume earlier blocked callers.
      if (onRecover !== undefined) pendingRecoveries.current.delete(onRecover);
      finishDraft();
      return true;
    },
    [finishDraft],
  );

  useLayoutEffect(() => registerFlush(flush), [flush, registerFlush]);
  useLayoutEffect(() => {
    const recoveries = pendingRecoveries.current;
    return () => {
      window.clearTimeout(saveTimer.current);
      recoveries.clear();
    };
  }, []);
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [flush]);

  const scheduleSave = useCallback(() => {
    if (current.current.saveError !== null) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flush, 1000);
  }, [flush]);

  const updateDraft = useCallback(
    (fields: { title?: string; subtitle?: string }, bodyChanged = false) => {
      const { draft, staged, savedState } = current.current;
      if (!bodyChanged || !draft?.bodyChanged) {
        const nextDraft = {
          state: { ...(draft?.state ?? staged ?? savedState), ...fields },
          bodyChanged: bodyChanged || draft?.bodyChanged === true,
        };
        current.current.draft = nextDraft;
        setDraft(nextDraft);
      }
      scheduleSave();
    },
    [scheduleSave],
  );

  // Meowdown requires the DOM. Mount it after hydration.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setMounted(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const handleDocChange = useCallback(() => {
    updateDraft({}, true);
  }, [updateDraft]);
  const resolveXPost = useCallback(() => undefined, []);
  const resolveYouTubeVideo = useCallback(() => undefined, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!mounted || editor === null) return;
    editor.editor?.view.dom.setAttribute("aria-label", "Article content");
  }, [mounted, editorStart.key]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!mounted || editor === null || draft !== null || staged !== null) return;
    const incoming = savedState.content ?? "";
    if (incoming === lastAppliedMarkdown.current || incoming === editor.getMarkdown()) {
      lastAppliedMarkdown.current = incoming;
      return;
    }
    let cancelled = false;
    // React node views may flush while applying saved content.
    queueMicrotask(() => {
      if (cancelled || editorRef.current !== editor) return;
      editor.setMarkdown(incoming);
      lastAppliedMarkdown.current = incoming;
    });
    return () => {
      cancelled = true;
    };
  }, [draft, mounted, savedState.content, staged]);

  return (
    <BrickShell className="overflow-hidden bg-white">
      <div
        className="qrk-article-writing-column qrk-responsive-insets"
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
          if (current.current.draft !== null || pendingRecoveries.current.size > 0) scheduleSave();
        }}
        onFocus={(event) => {
          if (
            event.currentTarget.contains(event.target) &&
            !(event.target instanceof HTMLButtonElement) &&
            !event.currentTarget.contains(event.relatedTarget)
          )
            onFocus();
        }}
      >
        {saveError !== null && (
          <div className="mb-4 flex flex-col gap-2">
            <p className="text-sm text-destructive" role="alert">
              Couldn’t save the Article. {saveError}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => flush(undefined, true)}>
                Retry
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  window.clearTimeout(saveTimer.current);
                  composing.current = false;
                  const { staged, savedState } = current.current;
                  const markdown = (staged ?? savedState).content ?? "";
                  lastAppliedMarkdown.current = markdown;
                  // Replace the editor so undo cannot restore the discarded draft.
                  setEditorStart((start) => ({ key: start.key + 1, markdown }));
                  finishDraft();
                }}
              >
                Discard changes
              </Button>
            </div>
          </div>
        )}
        <input
          className="qrk-article-title-input"
          autoComplete="off"
          data-1p-ignore="true"
          aria-label="Article title"
          placeholder="Title"
          value={editedState.title}
          onChange={(event) => updateDraft({ title: event.currentTarget.value })}
        />
        <input
          className="qrk-article-subtitle-input"
          autoComplete="off"
          data-1p-ignore="true"
          aria-label="Article subtitle"
          placeholder="Add a subtitle…"
          value={editedState.subtitle}
          onChange={(event) => updateDraft({ subtitle: event.currentTarget.value })}
        />
        <div
          className="qrk-article-document"
          onDragStartCapture={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onDragOverCapture={(event) => {
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "none";
          }}
          onDropCapture={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          {mounted && (
            <MeowdownEditor
              key={editorStart.key}
              initialMarkdown={editorStart.markdown}
              blockHandle={false}
              mode="focus"
              handleRef={editorRef}
              onDocChange={handleDocChange}
              editorClassName="qrk-article-editor outline-none"
              wrapperClassName="qrk-article-meowdown"
              placeholder="Start writing…"
              embedPaste={false}
              resolveXPost={resolveXPost}
              resolveYouTubeVideo={resolveYouTubeVideo}
            />
          )}
        </div>
      </div>
    </BrickShell>
  );
}
