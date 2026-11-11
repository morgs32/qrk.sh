import { NumberInput } from "./NumberInput";

export function SizeInput(props: {
  value: { width: number | null; height: number | null };
  onChange: (value: { width: number | null; height: number | null }) => void;
}) {
  const { value, onChange } = props;
  return (
    <div
      role="group"
      aria-label="Size"
      className="grid grid-cols-[76px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-1"
    >
      <span className="text-xs font-medium text-muted-foreground">Size</span>
      <NumberInput
        label="Width"
        prefix="W"
        min={0}
        value={value.width}
        onChange={(width) => onChange({ ...value, width })}
      />
      <NumberInput
        label="Height"
        prefix="H"
        min={0}
        value={value.height}
        onChange={(height) => onChange({ ...value, height })}
      />
    </div>
  );
}
