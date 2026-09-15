"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";

import { Button } from "@/app/tiptap/ui-primitive/button";
import { Spacer } from "@/app/tiptap/ui-primitive/spacer";
import {
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
} from "@/app/tiptap/ui-primitive/toolbar";
import { HeadingDropdownMenu } from "@/app/tiptap/ui/heading-dropdown-menu";
import { ImageUploadButton } from "@/app/tiptap/ui/image-upload-button";
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
import { TextAlignButton } from "@/app/tiptap/ui/text-align-button";
import { UndoRedoButton } from "@/app/tiptap/ui/undo-redo-button";
import {
  SearchAndReplace,
  SearchAndReplaceButton,
} from "@/app/tiptap/ui/search-and-replace";
import { ArrowLeftIcon } from "@/app/tiptap/icons/arrow-left-icon";
import { HighlighterIcon } from "@/app/tiptap/icons/highlighter-icon";
import { LinkIcon } from "@/app/tiptap/icons/link-icon";
import { useIsBreakpoint } from "@/app/tiptap/hooks/use-is-breakpoint";

const SEARCH_AND_REPLACE_SCROLL_OPTIONS: ScrollIntoViewOptions = {
  block: "center",
};

const bodyLockedProps = (locked: boolean) =>
  locked ? ({ disabled: true, "data-disabled": true } as const) : ({} as const);

function MainToolbarContent({
  bodyLocked,
  onHighlighterClick,
  onLinkClick,
  onSearchAndReplaceClick,
  isSearchAndReplaceOpen,
  searchAndReplaceButtonRef,
  isMobile,
}: {
  bodyLocked: boolean;
  onHighlighterClick: () => void;
  onLinkClick: () => void;
  onSearchAndReplaceClick: () => void;
  isSearchAndReplaceOpen: boolean;
  searchAndReplaceButtonRef: React.RefObject<HTMLButtonElement | null>;
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
        <MarkButton type="superscript" {...locked} />
        <MarkButton type="subscript" {...locked} />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <TextAlignButton align="left" {...locked} />
        <TextAlignButton align="center" {...locked} />
        <TextAlignButton align="right" {...locked} />
        <TextAlignButton align="justify" {...locked} />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <ImageUploadButton text="Add" {...locked} />
      </ToolbarGroup>

      <Spacer />

      {isMobile && <ToolbarSeparator />}

      <ToolbarGroup>
        <SearchAndReplaceButton
          ref={searchAndReplaceButtonRef}
          aria-expanded={isSearchAndReplaceOpen}
          data-active-state={isSearchAndReplaceOpen ? "on" : "off"}
          onClick={bodyLocked ? undefined : onSearchAndReplaceClick}
          {...locked}
        />
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
  const [isSearchAndReplaceOpen, setIsSearchAndReplaceOpen] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const searchAndReplaceButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isMobile && mobileView !== "main") {
      setMobileView("main");
    }
  }, [isMobile, mobileView]);

  useEffect(() => {
    if (inRequiredHeading) {
      setMobileView("main");
      setIsSearchAndReplaceOpen(false);
    }
  }, [inRequiredHeading]);

  const openSearchAndReplace = useCallback(() => {
    if (inRequiredHeading) {
      return;
    }
    setMobileView("main");
    setIsSearchAndReplaceOpen(true);
  }, [inRequiredHeading]);

  const closeSearchAndReplace = useCallback(() => {
    setIsSearchAndReplaceOpen(false);
    searchAndReplaceButtonRef.current?.focus();
  }, []);

  const toggleSearchAndReplace = useCallback(() => {
    if (inRequiredHeading) {
      return;
    }
    if (isSearchAndReplaceOpen) {
      closeSearchAndReplace();
      return;
    }
    openSearchAndReplace();
  }, [
    closeSearchAndReplace,
    inRequiredHeading,
    isSearchAndReplaceOpen,
    openSearchAndReplace,
  ]);

  return (
    <div className="sticky top-0 z-10 border-b border-border bg-background">
      <Toolbar ref={toolbarRef}>
        {mobileView === "main" ? (
          <MainToolbarContent
            bodyLocked={inRequiredHeading}
            onHighlighterClick={() => setMobileView("highlighter")}
            onLinkClick={() => setMobileView("link")}
            onSearchAndReplaceClick={toggleSearchAndReplace}
            isSearchAndReplaceOpen={isSearchAndReplaceOpen}
            searchAndReplaceButtonRef={searchAndReplaceButtonRef}
            isMobile={isMobile}
          />
        ) : (
          <MobileToolbarContent
            type={mobileView === "highlighter" ? "highlighter" : "link"}
            onBack={() => setMobileView("main")}
          />
        )}
      </Toolbar>

      <SearchAndReplace
        className="simple-editor-search-and-replace"
        open={!inRequiredHeading && isSearchAndReplaceOpen}
        onOpen={openSearchAndReplace}
        onClose={closeSearchAndReplace}
        scrollIntoViewOptions={SEARCH_AND_REPLACE_SCROLL_OPTIONS}
      />
    </div>
  );
}
