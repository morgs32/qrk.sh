"use client";

import { useRef, useState } from "react";
import { type Editor, useEditorState } from "@tiptap/react";

import { Button } from "./tiptap/ui-primitive/button/button";
import { ImagePlusIcon } from "./tiptap/icons/image-plus-icon";
import { Toolbar, ToolbarGroup, ToolbarSeparator } from "./tiptap/ui-primitive/toolbar/toolbar";
import { HeadingDropdownMenu } from "./tiptap/ui/heading-dropdown-menu/heading-dropdown-menu";
import { ListDropdownMenu } from "./tiptap/ui/list-dropdown-menu/list-dropdown-menu";
import { BlockquoteButton } from "./tiptap/ui/blockquote-button/blockquote-button";
import { CodeBlockButton } from "./tiptap/ui/code-block-button/code-block-button";
import {
  ColorHighlightPopover,
  ColorHighlightPopoverContent,
  ColorHighlightPopoverButton,
} from "./tiptap/ui/color-highlight-popover/color-highlight-popover";
import { LinkPopover, LinkContent, LinkButton } from "./tiptap/ui/link-popover/link-popover";
import { MarkButton } from "./tiptap/ui/mark-button/mark-button";
import { TextAlignDropdownMenu } from "./tiptap/ui/text-align-dropdown-menu/text-align-dropdown-menu";
import { UndoRedoButton } from "./tiptap/ui/undo-redo-button/undo-redo-button";
import { ArrowLeftIcon } from "./tiptap/icons/arrow-left-icon";
import { HighlighterIcon } from "./tiptap/icons/highlighter-icon";
import { LinkIcon } from "./tiptap/icons/link-icon";
import { useIsBreakpoint } from "./tiptap/hooks/use-is-breakpoint";

function MainToolbarContent(props: {
  editor: Editor;
  onHighlighterClick: () => void;
  onLinkClick: () => void;
  isMobile: boolean;
}) {
  const { editor, onHighlighterClick, onLinkClick, isMobile } = props;
  const canInsertImage = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) =>
      currentEditor.isEditable && currentEditor.can().setImageUploadNode(),
  });

  return (
    <>
      <ToolbarGroup>
        <UndoRedoButton action="undo" />
        <UndoRedoButton action="redo" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <HeadingDropdownMenu modal={false} levels={[2, 3, 4]} />
        <ListDropdownMenu modal={false} types={["bulletList", "orderedList", "taskList"]} />
        <BlockquoteButton />
        <CodeBlockButton />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <MarkButton type="bold" />
        <MarkButton type="italic" />
        <MarkButton type="strike" />
        <MarkButton type="code" />
        <MarkButton type="underline" />
        {!isMobile ? (
          <ColorHighlightPopover />
        ) : (
          <ColorHighlightPopoverButton onClick={onHighlighterClick} />
        )}
        {!isMobile ? <LinkPopover /> : <LinkButton onClick={onLinkClick} />}
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <TextAlignDropdownMenu modal={false} />
        <Button
          type="button"
          variant="ghost"
          tooltip="Add image"
          aria-label="Add image"
          disabled={!canInsertImage}
          data-disabled={!canInsertImage}
          onClick={() => editor.chain().focus().setImageUploadNode().run()}
        >
          <ImagePlusIcon className="tiptap-button-icon" />
        </Button>
      </ToolbarGroup>
    </>
  );
}

function MobileToolbarContent({
  type,
  onBack,
}: {
  type: "highlighter" | "link";
  onBack: () => void;
}) {
  return (
    <>
      <ToolbarGroup>
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeftIcon className="tiptap-button-icon" />
          {type === "highlighter" ? (
            <HighlighterIcon className="tiptap-button-icon" />
          ) : (
            <LinkIcon className="tiptap-button-icon" />
          )}
        </Button>
      </ToolbarGroup>

      <ToolbarSeparator />

      {type === "highlighter" ? <ColorHighlightPopoverContent /> : <LinkContent />}
    </>
  );
}

export function ArticleToolbar(props: { editor: Editor }) {
  const { editor } = props;
  const isMobile = useIsBreakpoint();
  const [mobileView, setMobileView] = useState<"main" | "highlighter" | "link">("main");
  const toolbarRef = useRef<HTMLDivElement>(null);

  if (!isMobile && mobileView !== "main") {
    setMobileView("main");
  }

  return (
    <div className="qrk-article-toolbar">
      <Toolbar ref={toolbarRef} variant="floating" data-plain="true">
        {mobileView === "main" ? (
          <MainToolbarContent
            editor={editor}
            onHighlighterClick={() => setMobileView("highlighter")}
            onLinkClick={() => setMobileView("link")}
            isMobile={isMobile}
          />
        ) : (
          <MobileToolbarContent
            type={mobileView === "highlighter" ? "highlighter" : "link"}
            onBack={() => setMobileView("main")}
          />
        )}
      </Toolbar>
    </div>
  );
}
