import { NumberField } from "@base-ui/react/number-field";
import { ChevronDown, ChevronUp, Scan, SquareDashed, X } from "lucide-react";
import { Fragment, useId, useState } from "react";
import { HexColorInput, HexColorPicker } from "react-colorful";

import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

export function StyleInspector(props: { defaultCornersOpen?: boolean }) {
  const { defaultCornersOpen = false } = props;
  const id = useId();
  const [radii, setRadii] = useState<(number | null)[]>([0, 0, 0, 0]);
  const [border, setBorder] = useState("0");
  const [borderColor, setBorderColor] = useState("");
  const [shadow, setShadow] = useState("");
  const [shadowColor, setShadowColor] = useState("");
  const [fill, setFill] = useState("");
  const hasMixedRadius = radii.some((radius) => radius !== radii[0]);

  const typography = "font-[Geist_Variable,Arial,sans-serif] text-xs text-neutral-950";
  const styleRow = "grid grid-cols-[76px_minmax(0,1fr)_28px] items-center gap-1";
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
                    value={hasMixedRadius ? "" : (radii[0] ?? "")}
                    placeholder={hasMixedRadius ? "Mixed" : undefined}
                    className={`${fieldInput} ${numberInput} !pl-1`}
                    onChange={(event) => {
                      const { value, valueAsNumber } = event.currentTarget;
                      if (value === "" || valueAsNumber >= 0) {
                        setRadii((current) =>
                          current.map(() => (value === "" ? null : valueAsNumber)),
                        );
                      }
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
                {
                  name: "Border",
                  value: border,
                  setValue: setBorder,
                  color: borderColor,
                  setColor: setBorderColor,
                },
                {
                  name: "Shadow",
                  value: shadow,
                  setValue: setShadow,
                  color: shadowColor,
                  setColor: setShadowColor,
                },
                { name: "Fill", value: fill, setValue: setFill, color: fill, setColor: setFill },
              ].map(({ name, value, setValue, color, setColor }) => {
                const hex = /^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(color) ? color : "#ffffff";
                return (
                  <Popover key={name}>
                    <PopoverAnchor asChild>
                      <div className={styleRow}>
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
                              if (name !== "Border" || !nextValue.startsWith("-")) {
                                setValue(nextValue);
                              }
                            }}
                          />
                          <InputGroupAddon
                            align="inline-end"
                            className="py-0 pr-0.5 has-[>button]:mr-0"
                          >
                            <PopoverTrigger asChild>
                              <InputGroupButton
                                size="icon-xs"
                                aria-label={`Pick ${name.toLowerCase()} color`}
                                className="rounded-md hover:bg-neutral-200"
                              >
                                <span
                                  aria-hidden="true"
                                  className="size-3 rounded-[2px] bg-white ring-1 ring-black/10 ring-inset"
                                  style={{ backgroundColor: color }}
                                />
                              </InputGroupButton>
                            </PopoverTrigger>
                          </InputGroupAddon>
                        </InputGroup>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Clear ${name.toLowerCase()}`}
                          className={`${iconButton} bg-neutral-50 text-neutral-500`}
                          onClick={() => {
                            setValue(name === "Border" ? "0" : "");
                            if (name !== "Fill") setColor("");
                          }}
                        >
                          <X aria-hidden="true" />
                        </Button>
                      </div>
                    </PopoverAnchor>
                    <PopoverContent
                      aria-labelledby={`${id}-${name}-color`}
                      side="left"
                      sideOffset={21}
                      align="start"
                      collisionPadding={8}
                      className={`w-64 max-w-[calc(100vw-16px)] rounded-[10px] border-neutral-100 bg-white p-0 shadow-lg ${typography}`}
                    >
                      <h2 id={`${id}-${name}-color`} className="px-4 py-3 leading-5 font-semibold">
                        {name}
                      </h2>
                      <Separator className="bg-neutral-200" />
                      <div className="grid gap-3 p-4">
                        <HexColorPicker color={hex} onChange={setColor} style={{ width: "100%" }} />
                        <HexColorInput
                          aria-label={`${name} hex color`}
                          autoComplete="off"
                          color={hex}
                          onChange={setColor}
                          prefixed
                          className={`${field} w-full border px-2 font-mono outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50`}
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                );
              })}
            </div>
          </section>
          {[
            { name: "Row", dimension: "Width" },
            { name: "Stack", dimension: "Height" },
          ].map(({ name, dimension }) => (
            <Fragment key={name}>
              <Separator className="bg-neutral-200" />
              <section aria-labelledby={`${id}-${name}`} className="px-4 pt-5 pb-4">
                <h2 id={`${id}-${name}`} className="leading-5 font-medium">
                  {name}
                </h2>
                <div className={`mt-3 ${styleRow}`}>
                  <Label htmlFor={`${id}-${dimension}`} className={label}>
                    {dimension}
                  </Label>
                  <NumberField.Root id={`${id}-${dimension}`} min={0} allowWheelScrub={false}>
                    <NumberField.Group render={<InputGroup className={field} />}>
                      <NumberField.Input render={<InputGroupInput className={fieldInput} />} />
                    </NumberField.Group>
                  </NumberField.Root>
                </div>
              </section>
            </Fragment>
          ))}
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
            <div
              key={corner}
              className="group grid grid-cols-[76px_minmax(0,1fr)] items-center gap-1"
            >
              <Label
                htmlFor={`${id}-corner-${index}`}
                className={`${label} group-focus-within:text-neutral-950`}
              >
                {name}
              </Label>
              <NumberField.Root
                id={`${id}-corner-${index}`}
                min={0}
                allowWheelScrub={false}
                value={radii[index]}
                onValueChange={(value) => setRadii((current) => current.with(index, value))}
              >
                <NumberField.Group render={<InputGroup className={field} />}>
                  <InputGroupAddon className="pl-2">
                    <span aria-hidden="true" className={`size-2 border-neutral-500 ${mark}`} />
                  </InputGroupAddon>
                  <NumberField.Input
                    render={<InputGroupInput className={fieldInput} />}
                    aria-label={`${name} (${corner.toLowerCase()}) radius`}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <InputGroupAddon align="inline-end" className="grid gap-0 py-0 pr-1">
                    <NumberField.Increment
                      render={<Button variant="ghost" size="icon" />}
                      aria-label={`Increase ${corner.toLowerCase()} radius`}
                      className="h-[13px] w-6 rounded-sm text-neutral-600 hover:bg-neutral-200"
                    >
                      <ChevronUp aria-hidden="true" className="size-3" />
                    </NumberField.Increment>
                    <NumberField.Decrement
                      render={<Button variant="ghost" size="icon" />}
                      aria-label={`Decrease ${corner.toLowerCase()} radius`}
                      className="h-[13px] w-6 rounded-sm text-neutral-600 hover:bg-neutral-200"
                    >
                      <ChevronDown aria-hidden="true" className="size-3" />
                    </NumberField.Decrement>
                  </InputGroupAddon>
                </NumberField.Group>
              </NumberField.Root>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
