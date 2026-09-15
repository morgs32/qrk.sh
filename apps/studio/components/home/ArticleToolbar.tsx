"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";

import { Button } from "@/app/tiptap/ui-primitive/button";
import { Spacer } from "@/app/tiptap/ui-primitive/spacer";
import {
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
} from "@/app/tiptap/ui-primitive/toolbar";
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

const bodyLockedProps = (locked: boolean) =>
  locked ? ({ disabled: true, "data-disabled": true } as const) : ({} as const);

function MainToolbarContent({
  bodyLocked,
  onHighlighterClick,
  onLinkClick,
  isMobile,
}: {
  bodyLocked: boolean;
  onHighlighterClick: () => void;
  onLinkClick: () => void;
  isMobile: boolean;
}) {
  const locked = bodyLockedProps(bodyLocked);

  return (
    <>
      <Spacer />

      <ToolbarGroup>
        <UndoRedoButton action="undo" {...locked} />
        <UndoRedoButton action="redo" {...locked} />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <HeadingDropdownMenu modal={false} levels={[1, 2, 3, 4]} />
        <ListDropdownMenu
          modal={false}
          types={["bulletList", "orderedList", "taskList"]}
          {...locked}
        />
        <BlockquoteButton {...locked} />
        <CodeBlockButton {...locked} />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <MarkButton type="bold" {...locked} />
        <MarkButton type="italic" {...locked} />
        <MarkButton type="strike" {...locked} />
        <MarkButton type="code" {...locked} />
        <MarkButton type="underline" {...locked} />
        {!isMobile ? (
          <ColorHighlightPopover {...locked} />
        ) : (
          <ColorHighlightPopoverButton
            onClick={bodyLocked ? undefined : onHighlighterClick}
            {...locked}
          />
        )}
        {!isMobile ? (
          <LinkPopover {...locked} />
        ) : (
          <LinkButton onClick={bodyLocked ? undefined : onLinkClick} {...locked} />
        )}
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <TextAlignDropdownMenu modal={false} {...locked} />
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

export function ArticleToolbar({
  editor,
  inRequiredHeading,
}: {
  editor: Editor;
  inRequiredHeading: boolean;
}) {
  const isMobile = useIsBreakpoint();
  const [mobileView, setMobileView] = useState<"main" | "highlighter" | "link">("main");
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMobile && mobileView !== "main") {
      setMobileView("main");
    }
  }, [isMobile, mobileView]);

  useEffect(() => {
    if (inRequiredHeading) {
      setMobileView("main");
    }
  }, [inRequiredHeading]);

  return (
    <div className="sticky top-0 z-10 border-b border-border bg-background">
      <Toolbar ref={toolbarRef}>
        {mobileView === "main" ? (
          <MainToolbarContent
            bodyLocked={inRequiredHeading}
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
