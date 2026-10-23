import { Plus } from "lucide-react";
import { Button } from "../../components/ui/button";

export function WallModuleAction(props: { moduleId: string; onAdd?: () => void }) {
  const { moduleId, onAdd } = props;
  return onAdd ? (
    <Button
      aria-label={`Add ${moduleId} here`}
      onClick={onAdd}
      size="icon"
      className="rounded-none"
    >
      <Plus aria-hidden="true" />
    </Button>
  ) : null;
}
