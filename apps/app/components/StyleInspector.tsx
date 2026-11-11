import {
  FlipHorizontal2,
  FlipVertical2,
  Minus,
  Plus,
  RotateCcw,
  RotateCw,
  Scan,
  SquareDashed,
  X,
} from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

export function StyleInspector(props: { defaultCornersOpen?: boolean }) {
  const { defaultCornersOpen = false } = props;
  const id = useId();
  const [radii, setRadii] = useState(["0", "0", "0", "0"]);
  const [border, setBorder] = useState("0");
  const [shadow, setShadow] = useState("");
  const [fill, setFill] = useState("");
  const [rotation, setRotation] = useState("0");
  const [flippedHorizontally, setFlippedHorizontally] = useState(false);
  const [flippedVertically, setFlippedVertically] = useState(false);
  const hasMixedRadius = radii.some((radius) => radius !== radii[0]);

  const typography = "font-[Geist_Variable,Arial,sans-serif] text-xs text-neutral-950";
  const styleRow = "grid grid-cols-[76px_minmax(0,1fr)_28px] items-center gap-1";
  const transformRow = "grid grid-cols-[76px_minmax(0,1fr)_28px_28px] items-center gap-1";
  const label = "text-xs font-normal text-neutral-500";
  const field = "h-7 rounded-[9px] border-transparent bg-neutral-100 shadow-none";
  const fieldInput = "h-7 px-2 py-0 text-xs leading-4 md:text-xs";
  const numberInput =
    "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
  const iconButton =
    "size-7 rounded-[9px] bg-neutral-100 hover:bg-neutral-200 [&_svg:not([class*='size-'])]:size-3.5";

  return (
    <Popover defaultOpen={defaultCornersOpen}>
      <PopoverAnchor asChild>
        <aside
          aria-label="Style inspector"
          className={`w-[260px] max-w-full shrink-0 border-l border-neutral-200 bg-white pt-[18px] ${typography}`}
        >
          <Separator className="bg-neutral-200" />
          <section aria-labelledby={`${id}-styles`} className="px-4 pt-5 pb-4">
            <h2 id={`${id}-styles`} className="leading-5 font-medium">
              Styles
            </h2>
            <div className="mt-3 grid gap-3">
              <div className={styleRow}>
                <Label htmlFor={`${id}-radius`} className="text-xs">
                  Radius
                </Label>
                <InputGroup className={field}>
                  <InputGroupAddon className="pl-2 text-neutral-500">
                    <SquareDashed aria-hidden="true" className="size-3" />
                  </InputGroupAddon>
                  <InputGroupInput
                    id={`${id}-radius`}
                    type="number"
                    min={0}
                    value={hasMixedRadius ? "" : radii[0]}
                    placeholder={hasMixedRadius ? "Mixed" : undefined}
                    className={`${fieldInput} ${numberInput} !pl-1`}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      if (!value.startsWith("-")) setRadii(radii.map(() => value));
                    }}
                  />
                </InputGroup>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Edit individual corner radii"
                    className={iconButton}
                  >
                    <Scan aria-hidden="true" />
                  </Button>
                </PopoverTrigger>
              </div>
              {[
                { name: "Border", value: border, setValue: setBorder, empty: "0" },
                { name: "Shadow", value: shadow, setValue: setShadow, empty: "" },
                { name: "Fill", value: fill, setValue: setFill, empty: "" },
              ].map(({ name, value, setValue, empty }) => (
                <div key={name} className={styleRow}>
                  <Label htmlFor={`${id}-${name}`} className={label}>
                    {name}
                  </Label>
                  <InputGroup className={field}>
                    <InputGroupInput
                      id={`${id}-${name}`}
                      type={name === "Border" ? "number" : "text"}
                      min={name === "Border" ? 0 : undefined}
                      value={value}
                      placeholder="Add..."
                      className={`${fieldInput} ${numberInput} text-neutral-500 placeholder:text-neutral-500`}
                      onChange={(event) => {
                        const nextValue = event.currentTarget.value;
                        if (name !== "Border" || !nextValue.startsWith("-")) setValue(nextValue);
                      }}
                    />
                    <InputGroupAddon align="inline-end" className="pr-2">
                      <span
                        aria-hidden="true"
                        className="size-3 rounded-[2px] bg-white"
                        style={name === "Fill" ? { backgroundColor: fill } : undefined}
                      />
                    </InputGroupAddon>
                  </InputGroup>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Clear ${name.toLowerCase()}`}
                    className={`${iconButton} bg-neutral-50 text-neutral-500`}
                    onClick={() => setValue(empty)}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
          </section>
          <Separator className="bg-neutral-200" />
          <section aria-labelledby={`${id}-transforms`} className="px-4 pt-5 pb-4">
            <h2 id={`${id}-transforms`} className="leading-5 font-medium">
              Transforms
            </h2>
            <div className="mt-3 grid gap-3">
              <div className={transformRow}>
                <Label htmlFor={`${id}-rotation`} className={label}>
                  Rotate
                </Label>
                <Input
                  id={`${id}-rotation`}
                  type="number"
                  value={rotation}
                  className={`${field} ${fieldInput} ${numberInput}`}
                  onChange={(event) => setRotation(event.currentTarget.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Rotate 90 degrees clockwise"
                  className={iconButton}
                  onClick={() => setRotation((value) => String(Number(value) + 90))}
                >
                  <RotateCw aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Rotate 90 degrees counterclockwise"
                  className={iconButton}
                  onClick={() => setRotation((value) => String(Number(value) - 90))}
                >
                  <RotateCcw aria-hidden="true" />
                </Button>
              </div>
              <div role="group" aria-labelledby={`${id}-flip`} className={transformRow}>
                <span id={`${id}-flip`} className={label}>
                  Flip
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Flip horizontally"
                  aria-pressed={flippedHorizontally}
                  className={`${iconButton} col-start-3 aria-pressed:bg-neutral-300`}
                  onClick={() => setFlippedHorizontally((flipped) => !flipped)}
                >
                  <FlipHorizontal2 aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Flip vertically"
                  aria-pressed={flippedVertically}
                  className={`${iconButton} aria-pressed:bg-neutral-300`}
                  onClick={() => setFlippedVertically((flipped) => !flipped)}
                >
                  <FlipVertical2 aria-hidden="true" />
                </Button>
              </div>
            </div>
          </section>
        </aside>
      </PopoverAnchor>
      <PopoverContent
        aria-labelledby={`${id}-corner-title`}
        side="left"
        align="start"
        alignOffset={72}
        collisionPadding={8}
        className={`w-64 max-w-[calc(100vw-16px)] rounded-[10px] border-neutral-100 bg-white p-0 shadow-lg ${typography}`}
      >
        <h2 id={`${id}-corner-title`} className="px-4 py-3 leading-5 font-semibold">
          Radius
        </h2>
        <Separator className="bg-neutral-200" />
        <div className="grid gap-2 p-4">
          {[
            { name: "Top", corner: "Top left", mark: "rounded-tl-[5px] border-t border-l" },
            { name: "Right", corner: "Top right", mark: "rounded-tr-[5px] border-t border-r" },
            { name: "Bottom", corner: "Bottom right", mark: "rounded-br-[5px] border-r border-b" },
            { name: "Left", corner: "Bottom left", mark: "rounded-bl-[5px] border-b border-l" },
          ].map(({ name, corner, mark }, index) => (
            <div key={corner} className={`group ${transformRow}`}>
              <Label
                htmlFor={`${id}-corner-${index}`}
                className={`${label} group-focus-within:text-neutral-950`}
              >
                {name}
              </Label>
              <InputGroup className={field}>
                <InputGroupAddon className="pl-2">
                  <span aria-hidden="true" className={`size-2 border-neutral-500 ${mark}`} />
                </InputGroupAddon>
                <InputGroupInput
                  id={`${id}-corner-${index}`}
                  aria-label={`${name} (${corner.toLowerCase()}) radius`}
                  type="number"
                  min={0}
                  value={radii[index]}
                  className={`${fieldInput} ${numberInput}`}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    if (!value.startsWith("-")) {
                      setRadii((current) => current.with(index, value));
                    }
                  }}
                />
              </InputGroup>
              {[
                { step: 1, Icon: Plus, action: "Increase" },
                { step: -1, Icon: Minus, action: "Decrease" },
              ].map(({ step, Icon, action }) => (
                <Button
                  key={action}
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`${action} ${corner.toLowerCase()} radius`}
                  className={iconButton}
                  disabled={step < 0 && Number(radii[index]) === 0}
                  onClick={() => {
                    setRadii((current) =>
                      current.with(index, String(Math.max(0, Number(current[index]) + step))),
                    );
                  }}
                >
                  <Icon aria-hidden="true" />
                </Button>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
