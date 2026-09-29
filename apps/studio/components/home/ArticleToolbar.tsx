"use client";

import { useRef, useState } from "react";
import { type Editor, useEditorState } from "@tiptap/react";

import { Button } from "@/app/tiptap/ui-primitive/button/button";
import { ImagePlusIcon } from "@/app/tiptap/icons/image-plus-icon";
import { Spacer } from "@/app/tiptap/ui-primitive/spacer";
import { Toolbar, ToolbarGroup, ToolbarSeparator } from "@/app/tiptap/ui-primitive/toolbar";
import { HeadingDropdownMenu } from "@/app/tiptap/ui/heading-dropdown-menu";
import { ListDropdownMenu } from "@/app/tiptap/ui/list-dropdown-menu";
import { BlockquoteButton } from "@/app/tiptap/ui/blockquote-button";
import { CodeBlockButton } from "@/app/tiptap/ui/code-block-button";
import {
  ColorHighlightPopover,
  ColorHighlightPopoverContent,
  ColorHighlightPopoverButton,
} from "@/app/tiptap/ui/color-highlight-popover";
import { LinkPopover, LinkContent, LinkButton } from "@/app/tiptap/ui/link-popover";
import { MarkButton } from "@/app/tiptap/ui/mark-button";
import { TextAlignDropdownMenu } from "@/app/tiptap/ui/text-align-dropdown-menu";
import { UndoRedoButton } from "@/app/tiptap/ui/undo-redo-button";
import { ArrowLeftIcon } from "@/app/tiptap/icons/arrow-left-icon";
import { HighlighterIcon } from "@/app/tiptap/icons/highlighter-icon";
import { LinkIcon } from "@/app/tiptap/icons/link-icon";
import { useIsBreakpoint } from "@/app/tiptap/hooks/use-is-breakpoint";

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
      <Spacer />

      <ToolbarGroup>
        <UndoRedoButton action="undo" />
        <UndoRedoButton action="redo" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <HeadingDropdownMenu modal={false} levels={[1, 2, 3, 4]} />
        <ListDropdownMenu
          modal={false}
          types={["bulletList", "orderedList", "taskList"]}
        />
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
        {!isMobile ? (
          <LinkPopover />
        ) : (
          <LinkButton onClick={onLinkClick} />
        )}
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

      <Spacer />
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
        <Button variant="ghost" onClick={onBack}>
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
    <div className="sticky top-0 z-10 border-b border-border bg-background">
      <Toolbar ref={toolbarRef}>
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
