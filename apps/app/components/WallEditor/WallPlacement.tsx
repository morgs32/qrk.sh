import { Menu } from "@base-ui/react/menu";
import { ChevronDown, GripVertical } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { cn } from "cn";
import { Button } from "../../modules/components/ui/button";
import { BrickAction } from "../../modules/components/BrickAction";

export function WallPlacement(props: {
  placement: {
    id: string;
    brickId: string;
    width: number;
    minWidth: number;
    content: ReactNode;
  };
  brickGap: number;
  brickLabel: string;
  selected: boolean;
  onEditBrick?: (brickId: string) => void;
  onRequestDeleteBrick: (trigger: HTMLElement | null) => void;
}) {
  const { placement, brickGap, brickLabel, selected, onEditBrick, onRequestDeleteBrick } = props;
  const menuTrigger = useRef<HTMLElement>(null);
  // Adjacent half-gap insets preserve touching drop targets at every gap size.
  return (
    <div
      data-wall-placement-id={placement.id}
      style={{
        flex: "0 0 auto",
        width: placement.width + brickGap,
        minWidth: placement.minWidth + brickGap,
        padding: brickGap / 2,
      }}
      className={cn("wall-placement group/brick relative", selected && "is-selected")}
    >
      <div
        className="wall-placement-content relative z-20 min-w-0 w-full"
        role={onEditBrick === undefined ? undefined : "group"}
        tabIndex={onEditBrick === undefined ? undefined : 0}
        aria-label={onEditBrick === undefined ? undefined : `Edit Brick ${placement.brickId}`}
        aria-keyshortcuts={onEditBrick === undefined ? undefined : "Enter Space"}
        onKeyDown={(event) => {
          if (
            onEditBrick === undefined ||
            event.defaultPrevented ||
            event.target !== event.currentTarget ||
            (event.key !== "Enter" && event.key !== " ")
          )
            return;
          event.preventDefault();
          if (!event.repeat) onEditBrick(placement.brickId);
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
              '.brick-action, a, button, input, textarea, select, label, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="link"], [role^="menuitem"], audio, video, canvas',
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
          <Menu.Root>
            <Menu.Trigger
              ref={menuTrigger}
              className="wall-action-tag wall-action-tag-button min-w-0"
              aria-label={`${brickLabel} actions`}
            >
              <span className="min-w-0 truncate" title={brickLabel}>
                {brickLabel}
              </span>
              <ChevronDown
                className="wall-action-tag-chevron"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner side="bottom" align="end" sideOffset={0} className="z-[90]">
                <Menu.Popup className="wall-action-menu">
                  <Menu.Item
                    className="wall-action-menu-item text-destructive"
                    onClick={() => onRequestDeleteBrick(menuTrigger.current)}
                  >
                    Delete brick
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
          <Button
            type="button"
            data-wall-drag-handle
            variant="ghost"
            className="size-(--wall-action-tag-height) cursor-grab rounded-none p-0 active:cursor-grabbing"
            aria-label={`Move Brick ${placement.brickId}`}
          >
            <GripVertical className="size-4" aria-hidden="true" />
          </Button>
        </BrickAction>
        {placement.content}
      </div>
    </div>
  );
}
