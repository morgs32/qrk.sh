"use client";

import { forwardRef, useCallback, useState } from "react";

// --- Icons ---
import { ChevronDownIcon } from "../../icons/chevron-down-icon";

// --- Hooks ---
import { useTiptapEditor } from "../../hooks/use-tiptap-editor";

// --- Tiptap UI ---
import { TextAlignButton } from "../text-align-button/text-align-button";
import { textAlignLabels } from "../text-align-button/use-text-align";
import type { UseTextAlignDropdownMenuConfig } from "./use-text-align-dropdown-menu";
import { useTextAlignDropdownMenu } from "./use-text-align-dropdown-menu";

// --- UI Primitives ---
import type { ButtonProps } from "../../ui-primitive/button/button";
import { Button } from "../../ui-primitive/button/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
} from "../../ui-primitive/dropdown-menu/dropdown-menu";

export interface TextAlignDropdownMenuProps
  extends Omit<ButtonProps, "type">, UseTextAlignDropdownMenuConfig {
  /**
   * Callback for when the dropdown opens or closes
   */
  onOpenChange?: (isOpen: boolean) => void;
  /**
   * Whether the dropdown should use a modal
   */
  modal?: boolean;
}

/**
 * Dropdown menu component for selecting text alignment in a Tiptap editor.
 *
 * For custom dropdown implementations, use the `useTextAlignDropdownMenu` hook instead.
 */
export const TextAlignDropdownMenu = forwardRef<HTMLButtonElement, TextAlignDropdownMenuProps>(
  (
    {
      editor: providedEditor,
      aligns = ["left", "center", "right", "justify"],
      hideWhenUnavailable = false,
      onOpenChange,
      children,
      modal = true,
      ...buttonProps
    },
    ref,
  ) => {
    const { editor } = useTiptapEditor(providedEditor);
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const { isVisible, isActive, canAlign, Icon } = useTextAlignDropdownMenu({
      editor,
      aligns,
      hideWhenUnavailable,
    });

    const handleOpenChange = useCallback(
      (open: boolean) => {
        if (!editor || !canAlign) return;
        setIsOpen(open);
        onOpenChange?.(open);
      },
      [canAlign, editor, onOpenChange],
    );

    if (!isVisible) {
      return null;
    }

    return (
      <DropdownMenu modal={modal} open={isOpen} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            data-active-state={isActive ? "on" : "off"}
            role="button"
            tabIndex={-1}
            disabled={!canAlign}
            data-disabled={!canAlign}
            aria-label="Align text"
            aria-pressed={isActive}
            tooltip="Align"
            {...buttonProps}
            ref={ref}
          >
            {children ? (
              children
            ) : (
              <>
                <Icon className="tiptap-button-icon" />
                <ChevronDownIcon className="tiptap-button-dropdown-small" />
              </>
            )}
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start">
          <DropdownMenuGroup>
            {aligns.map((align) => (
              <DropdownMenuItem key={`tiptap-align-${align}`} asChild>
                <TextAlignButton
                  editor={editor}
                  align={align}
                  text={textAlignLabels[align]}
                  showTooltip={false}
                />
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
);

TextAlignDropdownMenu.displayName = "TextAlignDropdownMenu";

export default TextAlignDropdownMenu;
