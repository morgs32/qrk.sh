import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";

const IMAGE_POSITIONS = [
  "top-left",
  "top-center",
  "top-right",
  "center-left",
  "center",
  "center-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;

type ImagePosition = (typeof IMAGE_POSITIONS)[number];

const DOT_ALIGN: Record<ImagePosition, string> = {
  "top-left": "items-start justify-start",
  "top-center": "items-start justify-center",
  "top-right": "items-start justify-end",
  "center-left": "items-center justify-start",
  center: "items-center justify-center",
  "center-right": "items-center justify-end",
  "bottom-left": "items-end justify-start",
  "bottom-center": "items-end justify-center",
  "bottom-right": "items-end justify-end",
};

export function ImageBreakpointOptionsForm(props: {
  value: { imagePosition: ImagePosition };
  onChange: (value: { imagePosition: ImagePosition }) => void;
}) {
  return (
    <div className="py-5">
      <fieldset>
        <legend className="mb-2">Image position</legend>
        <ToggleGroup
          type="single"
          variant="outline"
          value={props.value.imagePosition}
          onValueChange={(next) => {
            const position = IMAGE_POSITIONS.find((entry) => entry === next);
            if (position === undefined) return;
            props.onChange({ imagePosition: position });
          }}
          className="grid w-fit grid-cols-3 gap-2"
        >
          {IMAGE_POSITIONS.map((position) => (
            <ToggleGroupItem
              key={position}
              value={position}
              aria-label={position}
              className="size-10 rounded-xl p-1.5"
            >
              <span className={`flex size-full ${DOT_ALIGN[position]}`}>
                <span className="size-2 rounded-full bg-neutral-500" />
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </fieldset>
    </div>
  );
}
