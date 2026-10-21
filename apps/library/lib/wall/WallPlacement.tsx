import { Menu } from "@base-ui/react/menu";
import { Ellipsis, GripVertical } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { Button } from "../../components/ui/button";
import type { WallTree } from "./WallTree";

export function WallPlacement(props: {
  placement: ComponentProps<
    typeof WallTree
  >["sections"][number]["stacks"][number]["rows"][number]["placements"][number];
  scope: string;
  selected: boolean;
  onEditBrick: ComponentProps<typeof WallTree>["onEditBrick"];
  onRequestDelete: (brickId: string, triggerId: string) => void;
}) {
  const { placement, scope, selected, onEditBrick, onRequestDelete } = props;
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerId = `${scope}-placement-menu-${placement.id}`;
  return (
    <div
      data-wall-placement={placement.id}
      data-selected={selected}
      data-menu-open={menuOpen}
      style={{ minWidth: placement.minWidth }}
      className="group/placement relative flex-1 outline outline-1 -outline-offset-1 outline-transparent hover:outline-zinc-300 focus-within:outline-blue-500 data-[selected=true]:outline-blue-500 data-[menu-open=true]:outline-blue-500"
    >
      <div className="absolute right-0 top-0 z-20 flex bg-background/95 opacity-0 shadow-sm transition-opacity group-hover/placement:opacity-100 group-focus-within/placement:opacity-100 group-data-[selected=true]/placement:opacity-100 group-data-[menu-open=true]/placement:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100 [@media(pointer:coarse)]:opacity-100">
        <Button
          id={`${scope}-placement-grip-${placement.id}`}
          type="button"
          variant="ghost"
          aria-label={`Drag Brick ${placement.brickId}`}
          data-placement-grip
          className="size-7 cursor-grab rounded-none p-0 active:cursor-grabbing"
        >
          <GripVertical className="size-4" aria-hidden="true" />
        </Button>
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
                <Menu.Item
                  className="cursor-pointer px-3 py-2 outline-none data-[highlighted]:bg-muted"
                  onClick={() => onEditBrick(placement.brickId)}
                >
                  Edit
                </Menu.Item>
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
      </div>
      <div className="min-w-0 w-full">{placement.content}</div>
    </div>
  );
}
