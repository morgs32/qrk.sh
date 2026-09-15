"use client"

import { useEffect, useState } from "react"
import type { Editor } from "@tiptap/react"

// --- Hooks ---
import { useTiptapEditor } from "@/app/tiptap/hooks/use-tiptap-editor"

// --- Icons ---
import { AlignLeftIcon } from "@/app/tiptap/icons/align-left-icon"

// --- Tiptap UI ---
import {
  canSetTextAlign,
  isTextAlignActive,
  textAlignIcons,
  type TextAlign,
  shouldShowButton,
} from "@/app/tiptap/ui/text-align-button"

/**
 * Configuration for the text align dropdown menu functionality
 */
export interface UseTextAlignDropdownMenuConfig {
  /**
   * The Tiptap editor instance.
   */
  editor?: Editor | null
  /**
   * Available text alignments to show in the dropdown
   * @default ["left", "center", "right", "justify"]
   */
  aligns?: TextAlign[]
  /**
   * Whether the dropdown should hide when text align is not available.
   * @default false
   */
  hideWhenUnavailable?: boolean
}

/**
 * Gets the currently active text alignment from the available aligns
 */
export function getActiveTextAlign(
  editor: Editor | null,
  aligns: TextAlign[] = ["left", "center", "right", "justify"]
): TextAlign | undefined {
  if (!editor || !editor.isEditable) return undefined
  return aligns.find((align) => isTextAlignActive(editor, align))
}

export function canSetAnyTextAlign(
  editor: Editor | null,
  aligns: TextAlign[]
): boolean {
  if (!editor || !editor.isEditable) return false
  return aligns.some((align) => canSetTextAlign(editor, align))
}

export function isAnyTextAlignActive(
  editor: Editor | null,
  aligns: TextAlign[]
): boolean {
  if (!editor || !editor.isEditable) return false
  return aligns.some((align) => isTextAlignActive(editor, align))
}

/**
 * Custom hook that provides text align dropdown menu functionality for Tiptap editor
 */
export function useTextAlignDropdownMenu(
  config?: UseTextAlignDropdownMenuConfig
) {
  const {
    editor: providedEditor,
    aligns = ["left", "center", "right", "justify"],
    hideWhenUnavailable = false,
  } = config || {}

  const { editor } = useTiptapEditor(providedEditor)
  const [isVisible, setIsVisible] = useState(true)

  const activeAlign = getActiveTextAlign(editor, aligns)
  const isActive = isAnyTextAlignActive(editor, aligns)
  const canAlign = canSetAnyTextAlign(editor, aligns)

  useEffect(() => {
    if (!editor) return

    const handleSelectionUpdate = () => {
      setIsVisible(
        shouldShowButton({
          editor,
          hideWhenUnavailable,
          align: aligns[0] ?? "left",
        })
      )
    }

    handleSelectionUpdate()

    editor.on("selectionUpdate", handleSelectionUpdate)

    return () => {
      editor.off("selectionUpdate", handleSelectionUpdate)
    }
  }, [editor, hideWhenUnavailable, aligns])

  return {
    isVisible,
    activeAlign,
    isActive,
    canAlign,
    aligns,
    label: "Text align",
    Icon: activeAlign ? textAlignIcons[activeAlign] : AlignLeftIcon,
  }
}
