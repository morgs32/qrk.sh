import { draggable } from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "../../components/ui/button";
import { DragHandle } from "../../components/DragHandle";

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
    <DragHandle ref={gripRef} aria-label={`Drag ${moduleId} into Wall`} />
  );
}
