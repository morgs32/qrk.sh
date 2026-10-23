import { Menu } from "@base-ui/react/menu";
import { Ellipsis } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "cn";
import { DropIndicator } from "@atlaskit/pragmatic-drag-and-drop-react-drop-indicator/box";
import { Button } from "../../components/ui/button";
import { BrickAction } from "../../components/BrickAction";

export function WallPlacement(props: {
  placement: { id: string; brickId: string; minWidth: number; content: ReactNode };
  scope: string;
  selected: boolean;
  dropEdge?: "left" | "right" | null;
  onEditBrick?: (brickId: string) => void;
  onRequestDelete: (brickId: string, triggerId: string) => void;
}) {
  const { placement, scope, selected, dropEdge, onEditBrick, onRequestDelete } = props;
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerId = `${scope}-placement-menu-${placement.id}`;
  return (
    <div
      data-wall-placement-id={placement.id}
      style={{ minWidth: placement.minWidth }}
      className={cn(
        "wall-placement group/brick relative flex-1 outline outline-1 -outline-offset-1 focus-within:outline-blue-500",
        selected && "is-selected",
        menuOpen && "is-menu-open",
        selected || menuOpen ? "outline-blue-500" : "outline-transparent hover:outline-zinc-300",
      )}
    >
      {dropEdge && (
        <span
          aria-hidden="true"
          data-wall-drop-indicator={dropEdge}
          className="pointer-events-none absolute inset-y-0 inset-x-px z-30"
        >
          <DropIndicator edge={dropEdge} type="terminal-no-bleed" />
        </span>
      )}
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
            <Menu.Positioner side="bottom" align="end" sideOffset={4} className="z-[90]">
              <Menu.Popup className="min-w-36 border bg-background p-1 text-sm text-foreground shadow-md outline-none">
                {onEditBrick && (
                  <Menu.Item
                    className="cursor-pointer px-3 py-2 outline-none data-[highlighted]:bg-muted"
                    onClick={() => onEditBrick(placement.brickId)}
                  >
                    Edit
                  </Menu.Item>
                )}
                <Menu.Item
                  className="cursor-pointer px-3 py-2 text-destructive outline-none data-[highlighted]:bg-muted"
                  onClick={() => onRequestDelete(placement.brickId, triggerId)}
                >
                  Delete Brick
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </BrickAction>
      <div className="min-w-0 w-full">{placement.content}</div>
    </div>
  );
}
