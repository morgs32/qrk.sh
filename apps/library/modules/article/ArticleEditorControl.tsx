"use client";

import { MeowdownEditor, type EditorHandle } from "@meowdown/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import "./article-font.css";
import "./article-editor.scss";

export function ArticleEditorControl(props: {
  title: string;
  subtitle: string;
  value: string | null;
  readOnly: boolean;
  drawer: {
    onTitleChange: (title: string) => void;
    onSubtitleChange: (subtitle: string) => void;
    onChange: (markdown: string) => void;
  };
}) {
  const { title, subtitle, value, readOnly, drawer } = props;
  const [mounted, setMounted] = useState(false);
  const [initialMarkdown] = useState(value ?? "");
  const editorRef = useRef<EditorHandle>(null);
  const current = useRef(drawer);
  useLayoutEffect(() => {
    current.current = drawer;
  });
  const lastApplied = useRef(initialMarkdown);
  const lastStaged = useRef<string | null>(null);

  // 1 — Mount browser-only Meowdown after hydration and keep its callbacks stable.
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
    const editor = editorRef.current;
    if (editor === null) return;
    const markdown = editor.getMarkdown();
    if (markdown === lastStaged.current) return;
    lastStaged.current = markdown;
    current.current.onChange(markdown);
  }, []);
  const resolveXPost = useCallback(() => undefined, []);
  const resolveYouTubeVideo = useCallback(() => undefined, []);

  // 2 — Session echoes never reset the editor. Only genuinely different external content is applied.
  useEffect(() => {
    const editor = editorRef.current;
    if (!mounted || editor === null) return;
    editor.editor?.view.dom.setAttribute("aria-label", "Article content");
    const incoming = value ?? "";
    if (
      incoming === lastApplied.current ||
      incoming === lastStaged.current ||
      incoming === editor.getMarkdown()
    ) {
      lastApplied.current = incoming;
      return;
    }
    let cancelled = false;
    // React node views may flush while applying content; run after this commit.
    queueMicrotask(() => {
      if (cancelled || editorRef.current !== editor) return;
      editor.setMarkdown(incoming);
      lastApplied.current = incoming;
      lastStaged.current = editor.getMarkdown();
    });
    return () => {
      cancelled = true;
    };
  }, [mounted, value]);

  if (!mounted) return null;
  return (
    <div className="qrk-article-surface qrk-article-writing-column">
      <input
        className="qrk-article-title-input"
        autoComplete="off"
        data-1p-ignore="true"
        aria-label="Article title"
        placeholder="Title"
        required
        pattern={".*\\S.*"}
        title="Enter a title containing more than whitespace."
        value={title}
        onChange={(event) => drawer.onTitleChange(event.target.value)}
      />
      <input
        className="qrk-article-subtitle-input"
        autoComplete="off"
        data-1p-ignore="true"
        aria-label="Article subtitle"
        placeholder="Add a subtitle…"
        required
        pattern={".*\\S.*"}
        title="Enter a subtitle containing more than whitespace."
        value={subtitle}
        onChange={(event) => drawer.onSubtitleChange(event.target.value)}
      />
      <div className="qrk-article-document">
        <MeowdownEditor
          initialMarkdown={initialMarkdown}
          mode="focus"
          handleRef={editorRef}
          onDocChange={handleDocChange}
          editorClassName="qrk-article-editor outline-none"
          wrapperClassName="qrk-article-meowdown"
          placeholder="Start writing…"
          readOnly={readOnly}
          embedPaste={false}
          resolveXPost={resolveXPost}
          resolveYouTubeVideo={resolveYouTubeVideo}
        />
      </div>
    </div>
  );
}
