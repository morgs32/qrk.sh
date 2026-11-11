"use client";

import { createContext, useContext, type ReactNode } from "react";

export const BrickDetailsContext = createContext<(() => void) | null>(null);

export function BrickDetailsTrigger(props: { label: string; children: ReactNode }) {
  const { label, children } = props;
  const openDetails = useContext(BrickDetailsContext);
  if (openDetails === null) return children;

  return (
    <div
      className="flex flex-col [&>*]:flex-[1_0_auto]"
      role="group"
      tabIndex={0}
      aria-label={label}
      aria-keyshortcuts="Enter Space"
      onKeyDown={(event) => {
        if (
          event.defaultPrevented ||
          event.target !== event.currentTarget ||
          (event.key !== "Enter" && event.key !== " ")
        )
          return;
        event.preventDefault();
        if (!event.repeat) openDetails();
      }}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          !(event.target instanceof Element) ||
          !event.currentTarget.contains(event.target) ||
          event.target.closest(
            'a, button, input, textarea, select, label, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="link"], [role^="menuitem"], audio, video, canvas',
          )
        )
          return;
        const selection = event.currentTarget.ownerDocument.getSelection();
        if (
          selection !== null &&
          !selection.isCollapsed &&
          selection.rangeCount > 0 &&
          selection.getRangeAt(0).intersectsNode(event.currentTarget)
        )
          return;
        openDetails();
      }}
    >
      {children}
    </div>
  );
}
