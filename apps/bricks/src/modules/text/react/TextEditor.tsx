"use client";

import { Popover } from "@base-ui/react/popover";
import { Select } from "@base-ui/react/select";
import { defineEditorExtension, docToMarkdown, markdownToDoc } from "@meowdown/core";
import { createEditor, defineDocChangeHandler, defineUpdateHandler, union } from "@prosekit/core";
import type { IResult } from "@zerospin/error";
import type { IInferDecodedRow } from "@zerospin/shapes";
import * as Schema from "effect/Schema";
import { Bold, Highlighter, Italic, Link, Strikethrough } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "../../../components/button";
import { Input } from "../../../components/Input";
import { SelectContent, SelectItem, SelectTrigger } from "../../../components/select";
import { useWarnBeforeUnload } from "../../react/useWarnBeforeUnload";
import { textPlacementStateSchema } from "../commands/textPlacementState";
import { isTextMarkdown } from "../definition/textDocument";
import type { textV1 } from "../definition/textV1";
import { textEditingRules } from "./textEditingRules";
import "../../../components/spectral-font.css";
import "./text.css";

const families = { sans: '"Geist Variable", sans-serif', serif: '"Spectral", serif', mono: '"Geist Mono Variable", monospace' };

export function TextEditor(props: {
  state: IInferDecodedRow<typeof textV1.stateShape> | null;
  onSave: (state: IInferDecodedRow<typeof textV1.stateShape>) => IResult<unknown, { message: string }>;
  placementState: typeof textPlacementStateSchema.Type;
  onSavePlacement: (state: typeof textPlacementStateSchema.Type) => IResult<unknown, { message: string }>;
  registerFlush: (flush: (onRecover?: () => void) => boolean) => () => void;
}) {
  const { state, onSave, placementState, onSavePlacement, registerFlush } = props;
  const anchor = useRef<HTMLDivElement>(null);
  const mount = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const recoveries = useRef(new Set<() => void>());
  const pendingPlacement = useRef<typeof textPlacementStateSchema.Type | null>(null);
  const current = useRef<{
    onSave: typeof onSave;
    saved: string;
    draft: string | null;
    staged: string | null;
    composing: boolean;
    applying: boolean;
    error: string | null;
    schedule: () => void;
    updateSelection: () => void;
  }>({ onSave, saved: state?.content ?? "", draft: null, staged: null, composing: false, applying: false, error: null, schedule: () => {}, updateSelection: () => {} });
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [placementError, setPlacementError] = useState<string | null>(null);
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [, setSelectionVersion] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [stagedPlacement, setStagedPlacement] = useState<typeof textPlacementStateSchema.Type | null>(null);
  const [editor] = useState(() => createEditor({
    extension: union(
      defineEditorExtension({ markMode: "hide", placeholder: "Write text…", embedPaste: false, linkPaste: false, substitution: false }),
      textEditingRules,
      defineDocChangeHandler((view) => {
        if (current.current.applying) return;
        current.current.draft = docToMarkdown(view.state.doc);
        setDirty(true);
        current.current.schedule();
      }),
      defineUpdateHandler(() => current.current.updateSelection()),
    ),
  }));
  const content = state?.content ?? "";
  const { fontFamily, fontSizePx } = Schema.decodeUnknownSync(textPlacementStateSchema)(stagedPlacement ?? placementState);
  const [sizeDraft, setSizeDraft] = useState(String(fontSizePx));

  useLayoutEffect(() => {
    current.current.onSave = onSave;
    current.current.saved = content;
    if (current.current.staged === content) current.current.staged = null;
  }, [content, onSave]);
  useLayoutEffect(() => {
    if (stagedPlacement !== null && stagedPlacement.fontFamily === placementState.fontFamily && stagedPlacement.fontSizePx === placementState.fontSizePx) setStagedPlacement(null);
  }, [placementState, stagedPlacement]);
  useEffect(() => setSizeDraft(String(fontSizePx)), [fontSizePx]);
  useWarnBeforeUnload(dirty || placementError !== null);

  const flush = useCallback((onRecover?: () => void, retry = false) => {
    window.clearTimeout(timer.current);
    const value = current.current;
    if (onRecover !== undefined) recoveries.current.add(onRecover);
    if (value.composing || (editor.mounted && editor.view.composing) || (value.error !== null && !retry)) return false;
    if (value.draft !== null && value.draft !== (value.staged ?? value.saved)) {
      const result = value.onSave({ content: value.draft });
      if (result._tag === "Failure") {
        value.error = result.failure.message;
        setSaveError(result.failure.message);
        return false;
      }
      value.staged = value.draft;
    }
    value.draft = null;
    value.error = null;
    setDirty(false);
    setSaveError(null);
    if (pendingPlacement.current !== null) return false;
    if (onRecover !== undefined) recoveries.current.delete(onRecover);
    const waiting = [...recoveries.current];
    recoveries.current.clear();
    for (const resume of waiting) resume();
    return true;
  }, [editor]);
  current.current.schedule = () => {
    if (current.current.error !== null) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 1000);
  };
  current.current.updateSelection = () => setSelectionVersion((value) => value + 1);
  useLayoutEffect(() => registerFlush(flush), [flush, registerFlush]);
  useLayoutEffect(() => {
    if (mount.current === null) return;
    if (!isTextMarkdown(current.current.saved)) throw new Error("Text Brick contains an invalid document");
    editor.setContent(markdownToDoc(current.current.saved, { nodes: editor.nodes }));
    editor.mount(mount.current);
    editor.view.dom.setAttribute("aria-label", "Text content");
    return () => { window.clearTimeout(timer.current); recoveries.current.clear(); editor.unmount(); };
  }, [editor]);
  useEffect(() => {
    if (!editor.mounted || current.current.draft !== null || current.current.staged !== null) return;
    const value = current.current.saved;
    if (value === docToMarkdown(editor.state.doc) || (value === "" && docToMarkdown(editor.state.doc) === "\n")) return;
    if (!isTextMarkdown(value)) throw new Error("Text Brick contains an invalid document");
    current.current.applying = true;
    try { editor.setContent(markdownToDoc(value, { nodes: editor.nodes })); }
    finally { current.current.applying = false; }
  }, [content, editor]);
  useEffect(() => {
    const onVisibilityChange = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [flush]);
  const root = editor.state.doc.firstChild;
  const block = root?.type.name === "blockquote" ? "blockquote" : root?.type.name === "heading" ? `h${root.attrs.level}` : "paragraph";
  function setBlock(value: string | null) {
    if (value === null) return;
    if (editor.state.doc.firstChild?.type.name === "blockquote") editor.commands.toggleBlockquote();
    if (value === "blockquote") { editor.commands.setParagraph(); editor.commands.setBlockquote(); }
    else if (value === "paragraph") editor.commands.setParagraph();
    else if (value === "h1" || value === "h2" || value === "h3") editor.commands.setHeading({ level: Number(value.slice(1)) });
    editor.focus();
  }
  function saveTypography(next: { fontFamily: "sans" | "serif" | "mono"; fontSizePx: number }) {
    if (next.fontFamily === fontFamily && next.fontSizePx === fontSizePx) return;
    setStagedPlacement(next);
    const result = onSavePlacement(next);
    if (result._tag === "Failure") { pendingPlacement.current = next; setPlacementError(result.failure.message); return; }
    pendingPlacement.current = null;
    setPlacementError(null);
    flush();
  }
  function retryTypography() {
    const next = pendingPlacement.current;
    if (next === null) return;
    const result = onSavePlacement(next);
    if (result._tag === "Failure") { setPlacementError(result.failure.message); return; }
    pendingPlacement.current = null;
    setPlacementError(null);
    flush();
  }

  return <>
    <div ref={anchor} className="qrk-text-block" style={{ fontFamily: families[fontFamily], fontSize: fontSizePx }} onFocusCapture={() => setToolbarOpen(true)} onCompositionStart={() => { current.current.composing = true; }} onCompositionEnd={() => { current.current.composing = false; if (current.current.draft !== null || recoveries.current.size > 0) current.current.schedule(); }}>
      <div ref={mount} className="qrk-text-document" />
      {saveError === null ? null : <div role="alert" className="text-sm text-destructive">{saveError} <Button type="button" size="xs" onClick={() => flush(undefined, true)}>Retry</Button></div>}
      {placementError === null ? null : <div role="alert" className="text-sm text-destructive">{placementError} <Button type="button" size="xs" onClick={retryTypography}>Retry</Button></div>}
    </div>
    <Popover.Root open={toolbarOpen} onOpenChange={setToolbarOpen}>
      <Popover.Portal><Popover.Positioner anchor={anchor} side="top" align="start" sideOffset={8} collisionPadding={8} className="z-50">
        <Popover.Popup initialFocus={false} finalFocus={false} className="flex max-w-[calc(100vw-16px)] flex-wrap items-center gap-1 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg" aria-label="Text formatting">
          <Select.Root value={block} onValueChange={setBlock}><SelectTrigger aria-label="Block style" className="w-28"><Select.Value /></SelectTrigger><SelectContent><SelectItem value="paragraph">Paragraph</SelectItem><SelectItem value="h1">H1</SelectItem><SelectItem value="h2">H2</SelectItem><SelectItem value="h3">H3</SelectItem><SelectItem value="blockquote">Blockquote</SelectItem></SelectContent></Select.Root>
          <Select.Root value={fontFamily} onValueChange={(value) => { if (value === "sans" || value === "serif" || value === "mono") saveTypography({ fontFamily: value, fontSizePx }); }}><SelectTrigger aria-label="Font family" className="w-24"><Select.Value /></SelectTrigger><SelectContent><SelectItem value="sans">Sans</SelectItem><SelectItem value="serif">Serif</SelectItem><SelectItem value="mono">Mono</SelectItem></SelectContent></Select.Root>
          <Input aria-label="Font size in pixels" type="number" step="any" value={sizeDraft} className="w-16" onChange={(event) => setSizeDraft(event.currentTarget.value)} onBlur={() => { const value = Number(sizeDraft); if (Number.isFinite(value) && value > 0) saveTypography({ fontFamily, fontSizePx: value }); else setSizeDraft(String(fontSizePx)); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
          <Button type="button" variant="ghost" size="icon-xs" aria-label="Bold" onMouseDown={(event) => event.preventDefault()} onClick={() => { editor.commands.toggleStrong(); editor.focus(); }}><Bold aria-hidden="true" /></Button>
          <Button type="button" variant="ghost" size="icon-xs" aria-label="Italic" onMouseDown={(event) => event.preventDefault()} onClick={() => { editor.commands.toggleEm(); editor.focus(); }}><Italic aria-hidden="true" /></Button>
          <Button type="button" variant="ghost" size="icon-xs" aria-label="Strikethrough" onMouseDown={(event) => event.preventDefault()} onClick={() => { editor.commands.toggleDel(); editor.focus(); }}><Strikethrough aria-hidden="true" /></Button>
          <Button type="button" variant="ghost" size="icon-xs" aria-label="Highlight" onMouseDown={(event) => event.preventDefault()} onClick={() => { editor.commands.toggleHighlight(); editor.focus(); }}><Highlighter aria-hidden="true" /></Button>
          <Button type="button" variant="ghost" size="icon-xs" aria-label="Add link" onMouseDown={(event) => event.preventDefault()} onClick={() => setLinkOpen((value) => !value)}><Link aria-hidden="true" /></Button>
          {linkOpen ? <><Input aria-label="Link URL" type="url" value={linkUrl} onChange={(event) => setLinkUrl(event.currentTarget.value)} /><Button type="button" size="xs" disabled={linkUrl.trim() === ""} onClick={() => { editor.commands.insertLink({ href: linkUrl.trim() }); setLinkUrl(""); setLinkOpen(false); editor.focus(); }}>Apply link</Button></> : null}
        </Popover.Popup>
      </Popover.Positioner></Popover.Portal>
    </Popover.Root>
  </>;
}
