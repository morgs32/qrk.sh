import { defineEditorExtension, docToMarkdown, markdownToDoc } from "@meowdown/core";
import { createEditor, union } from "@prosekit/core";
import { redo, undo } from "@prosekit/pm/history";
import { TextSelection } from "@prosekit/pm/state";
import { isTextMarkdown } from "../definition/textDocument";
import { textEditingRules } from "./textEditingRules";

it("accepts a single text block and refuses line breaks, nested headings and multiple blocks", () => {
  for (const markdown of ["", "a **bold** word", "# Heading", "> Quote", "plain\n"]) expect(isTextMarkdown(markdown)).toBe(true);
  for (const markdown of ["first\nsecond", "first\n\nsecond", "Heading\n===", "> # Nested", "#### H4", "- list"]) expect(isTextMarkdown(markdown)).toBe(false);
});

it("keeps valid composition text and undo/redo while rejecting a second block", () => {
  const editor = createEditor({ extension: union(defineEditorExtension({ markMode: "hide" }), textEditingRules) });
  editor.setContent(markdownToDoc("hello", { nodes: editor.nodes }));
  let transaction = editor.state.tr.insertText(" 世界", 6).setMeta("composition", 1);
  let applied = editor.state.applyTransaction(transaction);
  editor.updateState(applied.state);
  expect(docToMarkdown(editor.state.doc)).toBe("hello 世界\n");
  transaction = editor.state.tr.split(2);
  applied = editor.state.applyTransaction(transaction);
  expect(applied.transactions).toHaveLength(0);
  expect(undo(editor.state, (tr) => editor.updateState(editor.state.apply(tr)))).toBe(true);
  expect(docToMarkdown(editor.state.doc)).toBe("hello\n");
  expect(redo(editor.state, (tr) => editor.updateState(editor.state.apply(tr)))).toBe(true);
  expect(docToMarkdown(editor.state.doc)).toBe("hello 世界\n");
});

it("unwraps a quote before applying a heading", () => {
  const editor = createEditor({ extension: union(defineEditorExtension({ markMode: "hide" }), textEditingRules) });
  editor.setContent(markdownToDoc("> quoted", { nodes: editor.nodes }));
  editor.updateState(editor.state.apply(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 3, 6))));
  expect(editor.commands.toggleBlockquote()).toBe(true);
  expect(editor.commands.setHeading({ level: 1 })).toBe(true);
  expect(docToMarkdown(editor.state.doc)).toBe("# quoted\n");
  expect(editor.state.selection.from).not.toBe(editor.state.selection.to);
});

it("formats a selection and accepts the supported text styles", () => {
  const editor = createEditor({ extension: union(defineEditorExtension({ markMode: "hide" }), textEditingRules) });
  editor.setContent(markdownToDoc("hello", { nodes: editor.nodes }));
  editor.updateState(editor.state.apply(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 6))));
  expect(editor.commands.toggleStrong()).toBe(true);
  expect(isTextMarkdown(docToMarkdown(editor.state.doc))).toBe(true);
  expect(editor.commands.setHeading({ level: 2 })).toBe(true);
  expect(docToMarkdown(editor.state.doc)).toContain("## ");
  expect(editor.commands.setParagraph()).toBe(true);
  expect(editor.commands.setBlockquote()).toBe(true);
  expect(isTextMarkdown(docToMarkdown(editor.state.doc))).toBe(true);
});

it.each([
  ["italic", "toggleEm", "*hello* world\n"],
  ["strikethrough", "toggleDel", "~~hello~~ world\n"],
  ["highlight", "toggleHighlight", "==hello== world\n"],
])("applies and removes %s on the selected text", (_style, command, formatted) => {
  const editor = createEditor({ extension: union(defineEditorExtension({ markMode: "hide" }), textEditingRules) });
  editor.setContent(markdownToDoc("hello world", { nodes: editor.nodes }));
  editor.updateState(editor.state.apply(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 6))));
  expect(editor.commands[command]()).toBe(true);
  expect(docToMarkdown(editor.state.doc)).toBe(formatted);
  expect(isTextMarkdown(formatted)).toBe(true);
  expect(docToMarkdown(markdownToDoc(formatted, { nodes: editor.nodes }))).toBe(formatted);
  expect(editor.commands[command]()).toBe(true);
  expect(docToMarkdown(editor.state.doc)).toBe("hello world\n");
});

it("links only the selected text and preserves the link when restored", () => {
  const editor = createEditor({ extension: union(defineEditorExtension({ markMode: "hide" }), textEditingRules) });
  editor.setContent(markdownToDoc("hello world", { nodes: editor.nodes }));
  editor.updateState(editor.state.apply(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 6))));
  expect(editor.commands.insertLink({ href: "https://example.com" })).toBe(true);
  const markdown = "[hello](https://example.com) world\n";
  expect(docToMarkdown(editor.state.doc)).toBe(markdown);
  expect(isTextMarkdown(markdown)).toBe(true);
  expect(docToMarkdown(markdownToDoc(markdown, { nodes: editor.nodes }))).toBe(markdown);
});

it("blocks Enter, permits composing Enter, and pastes plain text on one line", () => {
  const editor = createEditor({ extension: union(defineEditorExtension({ markMode: "hide" }), textEditingRules) });
  editor.setContent(markdownToDoc("hello", { nodes: editor.nodes }));
  const plugin = editor.state.plugins.find((candidate) => candidate.props.handlePaste !== undefined && candidate.props.handleDrop !== undefined && candidate.spec.filterTransaction !== undefined);
  expect(plugin).toBeDefined();
  const view = {
    composing: false,
    get state() { return editor.state; },
    dispatch(transaction) { editor.updateState(editor.state.apply(transaction)); },
  };
  const enter = { key: "Enter", isComposing: false, preventDefault: vi.fn() };
  expect(plugin.props.handleKeyDown(view, enter)).toBe(true);
  expect(enter.preventDefault).toHaveBeenCalled();
  const composingEnter = { key: "Enter", isComposing: true, preventDefault: vi.fn() };
  expect(plugin.props.handleKeyDown(view, composingEnter)).toBe(false);
  expect(composingEnter.preventDefault).not.toHaveBeenCalled();
  const paste = { preventDefault: vi.fn(), clipboardData: { getData: () => "one\r\ntwo\nthree" } };
  expect(plugin.props.handlePaste(view, paste)).toBe(true);
  expect(docToMarkdown(editor.state.doc)).toContain("one two three");
});

it("drops normalized plain text at the pointer, leaving same-editor moves to ProseMirror", () => {
  const editor = createEditor({ extension: union(defineEditorExtension({ markMode: "hide" }), textEditingRules) });
  editor.setContent(markdownToDoc("hello", { nodes: editor.nodes }));
  const plugin = editor.state.plugins.find((candidate) => candidate.props.handleDrop !== undefined && candidate.spec.filterTransaction !== undefined);
  const view = {
    get state() { return editor.state; },
    dispatch(transaction) { editor.updateState(editor.state.apply(transaction)); },
    posAtCoords: vi.fn(() => ({ pos: 3, inside: 0 })),
  };
  const drop = {
    clientX: 12,
    clientY: 34,
    preventDefault: vi.fn(),
    dataTransfer: { getData: vi.fn(() => "one\r\ntwo\u2028three") },
  };
  expect(plugin.props.handleDrop(view, drop, null, false)).toBe(true);
  expect(drop.preventDefault).toHaveBeenCalledOnce();
  expect(drop.dataTransfer.getData).toHaveBeenCalledWith("text/plain");
  expect(view.posAtCoords).toHaveBeenCalledWith({ left: 12, top: 34 });
  expect(docToMarkdown(editor.state.doc)).toBe("heone two threello\n");
  expect(undo(editor.state, (tr) => editor.updateState(editor.state.apply(tr)))).toBe(true);
  expect(docToMarkdown(editor.state.doc)).toBe("hello\n");
  expect(redo(editor.state, (tr) => editor.updateState(editor.state.apply(tr)))).toBe(true);
  expect(docToMarkdown(editor.state.doc)).toBe("heone two threello\n");

  const move = { preventDefault: vi.fn() };
  expect(plugin.props.handleDrop(view, move, null, true)).toBe(false);
  expect(move.preventDefault).not.toHaveBeenCalled();
});

it("ignores drops with no plain text or no position", () => {
  const editor = createEditor({ extension: union(defineEditorExtension({ markMode: "hide" }), textEditingRules) });
  editor.setContent(markdownToDoc("hello", { nodes: editor.nodes }));
  const plugin = editor.state.plugins.find((candidate) => candidate.props.handleDrop !== undefined && candidate.spec.filterTransaction !== undefined);
  const view = {
    get state() { return editor.state; },
    dispatch: vi.fn(),
    posAtCoords: vi.fn(() => null),
  };
  const drop = { clientX: 0, clientY: 0, preventDefault: vi.fn(), dataTransfer: { getData: () => "" } };
  expect(plugin.props.handleDrop(view, drop, null, false)).toBe(true);
  expect(view.dispatch).not.toHaveBeenCalled();
  drop.dataTransfer.getData = () => "text";
  expect(plugin.props.handleDrop(view, drop, null, false)).toBe(true);
  expect(view.dispatch).not.toHaveBeenCalled();
  expect(docToMarkdown(editor.state.doc)).toBe("hello\n");
});
