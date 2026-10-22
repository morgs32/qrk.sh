import { draggable } from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { GripVertical, Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "../../components/ui/button";

/** The catalog keeps interactive content; only this separate grip starts a drag. */
export function WallModuleAction(props: { wallId: string; moduleId: string; onAdd?: () => void }) {
  const { wallId, moduleId, onAdd } = props;
  const gripRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = gripRef.current;
    if (!element || onAdd !== undefined) return;
    return draggable({
      element,
      getInitialData: () => ({ kind: "wall-module", wallId, moduleId }),
    });
  }, [wallId, moduleId, onAdd]);
  return onAdd ? (
    <Button
      aria-label={`Add ${moduleId} here`}
      onClick={onAdd}
      size="icon"
      className="rounded-none"
    >
      <Plus aria-hidden="true" />
    </Button>
  ) : (
    <Button
      ref={gripRef}
      aria-label={`Drag ${moduleId} into Wall`}
      variant="ghost"
      type="button"
      className="size-7 cursor-grab rounded-none p-0 active:cursor-grabbing"
    >
      <GripVertical className="size-4" aria-hidden="true" />
    </Button>
  );
}
