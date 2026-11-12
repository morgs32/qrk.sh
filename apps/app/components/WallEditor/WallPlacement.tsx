import { Menu } from "@base-ui/react/menu";
import { ChevronDown, GripVertical } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { cn } from "cn";
import { Button } from "@qrk.sh/bricks/components/button";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  onRequestEditBrick?: () => void;
  onRequestDeleteBrick: (trigger: HTMLElement | null) => void;
}) {
  const { placement, brickGap, brickLabel, selected, onRequestEditBrick, onRequestDeleteBrick } = props;
  const menuTrigger = useRef<HTMLButtonElement>(null);
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
      <div className="wall-placement-content relative z-20 min-w-0 w-full">
        <BrickAction>
          <Menu.Root>
            <DropdownMenuTrigger
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
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="bottom"
              align="end"
              sideOffset={0}
              positionerClassName="z-[90]"
              className="w-max min-w-[90px] max-w-(--available-width) rounded-none border-[#dedede] bg-white p-0 font-mono text-[15px] leading-[18px] font-normal text-[#111] shadow-[2px_3px_0_#0005]"
            >
              {onRequestEditBrick === undefined ? null : (
                <DropdownMenuItem
                  className="min-h-5 cursor-pointer rounded-none px-0.5 py-px text-[15px] leading-[18px] data-highlighted:bg-[#f1f1f1] data-highlighted:text-current"
                  onClick={onRequestEditBrick}
                >
                  Edit brick
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="min-h-5 cursor-pointer rounded-none px-0.5 py-px text-[15px] leading-[18px] data-highlighted:bg-[#f1f1f1] data-highlighted:text-current data-disabled:opacity-40 text-destructive"
                onClick={() => onRequestDeleteBrick(menuTrigger.current)}
              >
                Delete brick
              </DropdownMenuItem>
            </DropdownMenuContent>
          </Menu.Root>
          <Button
            type="button"
            data-wall-drag-handle
            variant="ghost"
            className="size-(--wall-action-tag-height) cursor-grab rounded-none p-0 active:cursor-grabbing active:not-aria-[haspopup]:translate-y-0"
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
