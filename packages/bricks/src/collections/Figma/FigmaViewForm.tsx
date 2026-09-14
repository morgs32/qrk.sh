import { Button } from "../../ui/button";

export function FigmaViewForm(props: {
  value: { imagePosition: "center" | "left" | "right" | "top" | "bottom" };
  onChange: (value: { imagePosition: "center" | "left" | "right" | "top" | "bottom" }) => void;
}) {
  return (
    <fieldset className="px-6 py-4">
      <legend>Image position</legend>
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
  );
}
