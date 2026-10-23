import { Dialog } from "@base-ui/react/dialog";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "../../components/ui/button";
import { WallSection } from "./WallSection";

/** Controlled wall presentation: the caller owns persistence or local story fixtures. */
export function WallTree(props: {
  breakpoint: "sm" | "md" | "lg" | "xl";
  sections: {
    id: string;
    stacks: {
      id: string;
      name: string;
      rows: {
        id: string;
        placements: { id: string; brickId: string; minWidth: number; content: ReactNode }[];
      }[];
    }[];
  }[];
  selectedBrickId?: string | null;
  isActive?: boolean;
  onEditBrick: (brickId: string) => void;
  onDeleteBrick: (brickId: string) => boolean | void;
}) {
  const {
    breakpoint,
    sections,
    selectedBrickId,
    isActive = true,
    onEditBrick,
    onDeleteBrick,
  } = props;
  const scope = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const returnFocusId = useRef<string | null>(null);
  const [deletingBrickId, setDeletingBrickId] = useState<string | null>(null);
  useEffect(() => {
    if (!isActive) {
      setDeletingBrickId(null);
    }
  }, [isActive]);

  const finalFocus = () =>
    rootRef.current?.ownerDocument.getElementById(returnFocusId.current ?? "") ??
    rootRef.current?.querySelector<HTMLElement>("button") ??
    rootRef.current;
  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className="relative min-h-full min-w-0 w-full outline-none"
      aria-label={`${breakpoint} Wall editor`}
    >
      <div>
        {sections.map((section) => (
          <WallSection
            key={section.id}
            section={section}
            scope={scope}
            selectedBrickId={selectedBrickId}
            onEditBrick={onEditBrick}
            onRequestDelete={(brickId, triggerId) => {
              returnFocusId.current = triggerId;
              setDeletingBrickId(brickId);
            }}
          />
        ))}
      </div>
      <Dialog.Root
        open={deletingBrickId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingBrickId(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-[100] bg-black/30" />
          <Dialog.Popup
            finalFocus={finalFocus}
            className="fixed left-1/2 top-1/2 z-[101] grid w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 text-foreground shadow-xl outline-none"
          >
            <Dialog.Title className="text-lg font-medium">Delete Brick?</Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground">
              This deletes the shared Brick and its Placements at all four breakpoints, then removes
              empty Rows, Stacks, and Sections.
            </Dialog.Description>
            <div className="flex justify-end gap-2">
              <Dialog.Close render={<Button variant="outline" />}>Cancel</Dialog.Close>
              <Button
                variant="destructive"
                onClick={() => {
                  if (deletingBrickId !== null && onDeleteBrick(deletingBrickId) !== false) {
                    setDeletingBrickId(null);
                  }
                }}
              >
                Delete Brick
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
