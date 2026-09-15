import { Button } from "../../components/ui/button";

export function FigmaOptionsForm(props: {
  value: { imagePosition: "center" | "left" | "right" | "top" | "bottom" };
  onChange: (value: { imagePosition: "center" | "left" | "right" | "top" | "bottom" }) => void;
}) {
  return (
    <div className="px-4 py-5">
      <fieldset>
        <legend className="mb-2">Image position</legend>
        {(
          ["center", "left", "right", "top", "bottom"] satisfies Array<
            typeof props.value.imagePosition
          >
        ).map((position) => (
          <Button
            key={position}
            type="button"
            variant={props.value.imagePosition === position ? "secondary" : "ghost"}
            aria-pressed={props.value.imagePosition === position}
            onClick={() => props.onChange({ imagePosition: position })}
          >
            {position[0].toUpperCase() + position.slice(1)}
          </Button>
        ))}
      </fieldset>
    </div>
  );
}
