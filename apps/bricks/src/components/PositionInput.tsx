import { NumberInput } from "./NumberInput";

export function PositionInput(props: {
  value: { x: number | null; y: number | null };
  onChange: (value: { x: number | null; y: number | null }) => void;
}) {
  const { value, onChange } = props;
  return (
    <div
      role="group"
      aria-label="Position"
      className="grid grid-cols-[100px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-1"
    >
      <span className="text-xs font-medium text-muted-foreground">Position</span>
      <NumberInput
        label="Position X"
        prefix="X"
        value={value.x}
        onChange={(x) => onChange({ ...value, x })}
      />
      <NumberInput
        label="Position Y"
        prefix="Y"
        value={value.y}
        onChange={(y) => onChange({ ...value, y })}
      />
    </div>
  );
}
