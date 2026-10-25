import { Menu } from "@base-ui/react/menu";
import { Ellipsis } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { BrickAction } from "../../components/BrickAction";

export function WallPlacement(props: {
  placement: { id: string; brickId: string; minWidth: number; content: ReactNode };
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
      style={{ minWidth: placement.minWidth + brickGap, padding: brickGap / 2 }}
      className={cn(
        "wall-placement group/brick relative flex-1 after:pointer-events-none after:absolute after:-inset-[0.5px] after:z-[18] after:border after:content-[''] focus-within:after:z-[19] focus-within:after:border-blue-500",
        selected && "is-selected",
        menuOpen && "is-menu-open",
        selected || menuOpen ? "after:z-[19] after:border-blue-500" : "after:border-transparent",
      )}
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
