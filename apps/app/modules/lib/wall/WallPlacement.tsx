import { Menu } from "@base-ui/react/menu";
import { Ellipsis } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { BrickAction } from "../../components/BrickAction";

export function WallPlacement(props: {
  placement: {
    id: string;
    brickId: string;
    defaultWidth: number;
    minWidth: number;
    content: ReactNode;
  };
  scope: string;
  brickGap: number;
  selected: boolean;
  onEditBrick?: (brickId: string) => void;
  onRequestDelete: (brickId: string, triggerId: string) => void;
}) {
  const { placement, scope, brickGap, selected, onEditBrick, onRequestDelete } = props;
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerId = `${scope}-placement-menu-${placement.id}`;
  // Adjacent half-gap insets preserve touching drop targets at every gap size.
  return (
    <div
      data-wall-placement-id={placement.id}
      style={{
        width: placement.defaultWidth + brickGap,
        minWidth: placement.minWidth + brickGap,
        padding: brickGap / 2,
      }}
      className={cn(
        "wall-placement group/brick relative after:pointer-events-none after:absolute after:-inset-[0.5px] after:z-[18] after:border after:border-transparent after:content-['']",
        selected && "is-selected",
        menuOpen && "is-menu-open",
      )}
    >
      <div
        className="wall-placement-content relative z-20 min-w-0 w-full"
        onClick={(event) => {
          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey ||
            !(event.target instanceof Element) ||
            // Portaled menu events bubble through React, outside this DOM subtree.
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
          onEditBrick?.(placement.brickId);
        }}
      >
        <BrickAction>
          <Menu.Root open={menuOpen} onOpenChange={setMenuOpen}>
            <Menu.Trigger
              id={triggerId}
              render={<Button variant="ghost" className="size-7 rounded-none p-0" />}
              aria-label={`Brick ${placement.brickId} actions`}
            >
              <Ellipsis className="size-4" aria-hidden="true" />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner side="bottom" align="end" sideOffset={0} className="z-[90]">
                <Menu.Popup className="w-max min-w-[90px] max-w-[var(--available-width)] max-h-[var(--available-height)] overflow-y-auto rounded-none border border-[#dedede] bg-white p-0 font-mono text-[15px] leading-[18px] font-normal text-[#111] shadow-[2px_3px_0_#0005] outline-none">
                  {onEditBrick && (
                    <Menu.Item
                      className="min-h-5 cursor-pointer select-none px-0.5 py-px outline-none data-[highlighted]:bg-[color-mix(in_srgb,#fff,#111_6%)]"
                      onClick={() => onEditBrick(placement.brickId)}
                    >
                      Edit
                    </Menu.Item>
                  )}
                  <Menu.Item
                    className="min-h-5 cursor-pointer select-none px-0.5 py-px text-destructive outline-none data-[highlighted]:bg-[color-mix(in_srgb,#fff,#111_6%)]"
                    onClick={() => onRequestDelete(placement.brickId, triggerId)}
                  >
                    Delete Brick
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </BrickAction>
        {placement.content}
      </div>
    </div>
  );
}
