import { Pencil, GripVertical } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { BrickAction } from "../../components/BrickAction";

export function WallPlacement(props: {
  placement: {
    id: string;
    brickId: string;
    widthWeight: number;
    minWidth: number;
    content: ReactNode;
  };
  brickGap: number;
  selected: boolean;
  onEditBrick?: (brickId: string) => void;
}) {
  const { placement, brickGap, selected, onEditBrick } = props;
  // Adjacent half-gap insets preserve touching drop targets at every gap size.
  return (
    <div
      data-wall-placement-id={placement.id}
      style={{
        flexGrow: placement.widthWeight,
        minWidth: placement.minWidth + brickGap,
        padding: brickGap / 2,
      }}
      className={cn("wall-placement group/brick relative", selected && "is-selected")}
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
          {onEditBrick === undefined ? null : (
            <Button
              type="button"
              variant="ghost"
              className="size-7 rounded-none p-0"
              aria-label={`Edit Brick ${placement.brickId}`}
              onClick={() => onEditBrick(placement.brickId)}
            >
              <Pencil className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
            </Button>
          )}
          <Button
            type="button"
            data-wall-drag-handle
            variant="ghost"
            className="size-7 cursor-grab rounded-none p-0 active:cursor-grabbing"
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
