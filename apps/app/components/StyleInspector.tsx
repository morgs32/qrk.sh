import { BrickWall, Layers, Paintbrush, Rows3, Scan, SquareDashed, X } from "lucide-react";
import { useId, useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InspectorNumberField } from "./InspectorNumberField";

export function StyleInspector(props: {
  defaultCornersOpen?: boolean;
  layout?: "sidebar" | "drawer";
}) {
  const { defaultCornersOpen = false, layout = "sidebar" } = props;
  const id = useId();
  const [radii, setRadii] = useState<(number | null)[]>([0, 0, 0, 0]);
  const [border, setBorder] = useState("0");
  const [borderColor, setBorderColor] = useState("");
  const [shadow, setShadow] = useState("");
  const [shadowColor, setShadowColor] = useState("");
  const [fill, setFill] = useState("");

  if (layout === "sidebar") {
    return (
      <aside
        aria-label="Style inspector"
        data-slot="sidebar"
        data-sidebar="sidebar"
        className="flex min-h-svh w-64 max-w-full shrink-0 flex-col border-l border-sidebar-border bg-sidebar text-sidebar-foreground"
      >
        <div
          data-slot="sidebar-content"
          data-sidebar="content"
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto"
        />
      </aside>
    );
  }

  const hasMixedRadius = radii.some((radius) => radius !== radii[0]);

  const typography = "font-[Geist_Variable,Arial,sans-serif] text-xs text-neutral-950";
  const styleRow = "grid grid-cols-[minmax(0,1fr)_28px] items-center gap-x-1 gap-y-2";
  const styleLabel =
    "col-span-2 font-mono text-[10px] font-normal tracking-wide text-neutral-600 uppercase";
  const dimensions = [
    { name: "Row", dimension: "Width", Icon: Rows3 },
    { name: "Stack", dimension: "Height", Icon: Layers },
    { name: "Brick", dimension: "Width", Icon: BrickWall },
  ];
  const panel = "mt-0 min-h-24 px-5 py-4 data-[state=inactive]:hidden";
  const tab =
    "h-10 flex-none gap-1.5 rounded-none border-b-2 border-transparent px-0 py-0 font-mono text-xs data-[state=active]:border-neutral-900 data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent";
  const label = "text-xs font-normal text-neutral-500";
  const field = "h-7 rounded-[9px] border-transparent bg-neutral-100 shadow-none";
  const fieldInput = "h-7 px-2 py-0 text-xs leading-4 md:text-xs";
  const numberInput =
    "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
  const iconButton =
    "size-7 rounded-[9px] bg-neutral-100 hover:bg-neutral-200 [&_svg:not([class*='size-'])]:size-3.5";

  const styles = (
    <div className="grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-4">
      <div className={styleRow}>
        <Label htmlFor={`${id}-radius`} className={styleLabel}>
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
                setRadii((current) => current.map(() => (value === "" ? null : valueAsNumber)));
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
                <Label htmlFor={`${id}-${name}`} className={styleLabel}>
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
                  <InputGroupAddon align="inline-end" className="py-0 pr-0.5 has-[>button]:mr-0">
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
              side="top"
              sideOffset={68}
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
  );
  const dimensionSections = dimensions.map(({ name, dimension }) => {
    const fieldId = `${id}-${name}-${dimension}`;
    return (
      <TabsContent key={name} value={name} forceMount className={panel}>
        <div className="grid w-full max-w-xs gap-2">
          <Label htmlFor={fieldId} className={styleLabel}>
            {dimension}
          </Label>
          <InspectorNumberField id={fieldId} label={`${name} ${dimension.toLowerCase()}`} />
        </div>
      </TabsContent>
    );
  });

  return (
    <Popover defaultOpen={defaultCornersOpen}>
      <PopoverAnchor asChild>
        <aside
          aria-label="Style inspector"
          className={`${typography} w-full border-t border-neutral-200 bg-white shadow-[0_-4px_18px_-8px_rgba(0,0,0,0.18)] antialiased tabular-nums`}
        >
          <Tabs defaultValue="Styles" className="gap-0">
            <TabsList
              aria-label="Inspector sections"
              className="h-10 w-full justify-start gap-5 overflow-x-auto rounded-none border-b border-neutral-200 bg-transparent px-5 py-0"
            >
              <TabsTrigger value="Styles" className={tab}>
                <Paintbrush aria-hidden="true" className="size-3.5" />
                Styles
              </TabsTrigger>
              {dimensions.map(({ name, Icon }) => (
                <TabsTrigger key={name} value={name} className={tab}>
                  <Icon aria-hidden="true" className="size-3.5" />
                  {name}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="Styles" forceMount className={panel}>
              {styles}
            </TabsContent>
            {dimensionSections}
          </Tabs>
        </aside>
      </PopoverAnchor>
      <PopoverContent
        aria-labelledby={`${id}-corner-title`}
        side="top"
        align="start"
        alignOffset={20}
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
              <InspectorNumberField
                id={`${id}-corner-${index}`}
                label={`${corner} radius`}
                leadingIcon={
                  <span aria-hidden="true" className={`size-2 border-neutral-500 ${mark}`} />
                }
                selectOnFocus
                value={radii[index]}
                onValueChange={(value) => setRadii((current) => current.with(index, value))}
              />
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
