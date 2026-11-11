import { NumberField } from "@base-ui/react/number-field";
import { BrickWall, Layers, Minus, Paintbrush, Plus, Rows3, Scan, X } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { HexColorInput, HexColorPicker } from "react-colorful";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InspectorNumberField } from "./InspectorNumberField";

export function StyleInspector(props: {
  children?: ReactNode;
  defaultCornersOpen?: boolean;
  layout?: "sidebar" | "drawer";
}) {
  const { children, defaultCornersOpen = false, layout = "sidebar" } = props;
  const isSidebar = layout === "sidebar";
  const id = useId();
  const [sidebarSection, setSidebarSection] = useState("Styles");
  const [radii, setRadii] = useState<(number | null)[]>([0, 0, 0, 0]);
  const [border, setBorder] = useState("0");
  const [borderColor, setBorderColor] = useState("");
  const [shadowDraft, setShadowDraft] = useState<string | null>(null);
  const [shadowColor, setShadowColor] = useState("");
  const [shadowDimensions, setShadowDimensions] = useState<(number | null)[]>([0, 0, 0, 0]);
  const [fill, setFill] = useState("");

  const hasMixedRadius = radii.some((radius) => radius !== radii[0]);

  const typography = "font-[Geist_Variable,Arial,sans-serif] text-xs text-neutral-950";
  const styleRow = "grid grid-cols-[minmax(0,1fr)_28px] items-center gap-x-1 gap-y-2";
  const styleLabel = "form-input-label col-span-2";
  const dimensions = [
    { name: "Row", dimension: "Width", Icon: Rows3 },
    { name: "Stack", dimension: "Height", Icon: Layers },
    { name: "Brick", dimension: "Width", Icon: BrickWall },
  ];
  const panel = "mt-0 min-h-24 px-5 py-4 data-[state=inactive]:hidden";
  const tab =
    "h-10 flex-none gap-1.5 rounded-none border-b-2 border-transparent px-0 py-0 font-mono text-xs data-[state=active]:border-neutral-900 data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent";
  const label = "text-xs font-normal text-black";
  const field =
    "h-(--spacing-form-input) rounded-(--radius-form-input) border-0 bg-form-input shadow-none dark:bg-form-input";
  const fieldInput = "h-(--spacing-form-input) px-2 py-0 text-xs leading-4 md:text-xs";
  const numberInput =
    "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
  const iconButton =
    "size-7 rounded-[9px] bg-white hover:bg-neutral-200 [&_svg:not([class*='size-'])]:size-3.5";

  const styles = (
    <div className={isSidebar ? "grid gap-4" : "grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-4"}>
      <div className={styleRow}>
        <Label htmlFor={`${id}-radius`} className={styleLabel}>
          Radius
        </Label>
        <InputGroup className={field}>
          <InputGroupInput
            id={`${id}-radius`}
            type="number"
            min={0}
            value={hasMixedRadius ? "" : (radii[0] ?? "")}
            placeholder={hasMixedRadius ? "Mixed" : undefined}
            className={`${fieldInput} ${numberInput}`}
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
          value: shadowDraft ?? shadowDimensions.map((dimension) => dimension ?? 0).join(", "),
          setValue: setShadowDraft,
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
                    className={`${fieldInput} ${numberInput} placeholder:text-neutral-500 ${name === "Border" ? "text-neutral-500" : "text-neutral-950"} ${name === "Fill" ? "uppercase placeholder:normal-case" : ""}`}
                    onChange={(event) => {
                      const nextValue = event.currentTarget.value;
                      if (name !== "Border" || !nextValue.startsWith("-")) {
                        setValue(nextValue);
                      }
                    }}
                    onBlur={
                      name === "Shadow"
                        ? (event) => {
                            const parts = event.currentTarget.value
                              .split(",")
                              .map((part) => part.trim());
                            const values = parts.map(Number);
                            if (
                              parts.length === 4 &&
                              parts.every(Boolean) &&
                              values.every(Number.isFinite) &&
                              values[2] >= 0
                            ) {
                              setShadowDimensions(values);
                            }
                            setShadowDraft(null);
                          }
                        : undefined
                    }
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
                          className="size-3 rounded-[2px] bg-white"
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
                    if (name === "Shadow") {
                      setShadowDraft(null);
                      setShadowDimensions([0, 0, 0, 0]);
                    } else {
                      setValue(name === "Border" ? "0" : "");
                    }
                    if (name !== "Fill") setColor("");
                  }}
                >
                  <X aria-hidden="true" className="size-3" />
                </Button>
              </div>
            </PopoverAnchor>
            <PopoverContent
              aria-labelledby={`${id}-${name}-color`}
              side={isSidebar ? "left" : "top"}
              sideOffset={isSidebar ? 12 : 68}
              align="start"
              collisionPadding={8}
              className={`w-64 max-w-[calc(100vw-16px)] rounded-[10px] border-neutral-100 bg-white p-0 shadow-lg ${typography}`}
            >
              <h2 id={`${id}-${name}-color`} className="px-4 py-3 leading-5 font-semibold">
                {name}
              </h2>
              <Separator className="bg-neutral-200" />
              <div className={`grid p-4 ${name === "Shadow" ? "gap-2" : "gap-3"}`}>
                <HexColorPicker color={hex} onChange={setColor} style={{ width: "100%" }} />
                <HexColorInput
                  aria-label={`${name} hex color`}
                  autoComplete="off"
                  color={hex}
                  onChange={setColor}
                  prefixed
                  className={`${field} w-full px-2 font-mono outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50`}
                />
                {name === "Shadow" &&
                  ["X", "Y", "Blur", "Spread"].map((dimension, index) => {
                    const fieldId = `${id}-shadow-${dimension}`;
                    return (
                      <NumberField.Root
                        key={dimension}
                        id={fieldId}
                        min={dimension === "Blur" ? 0 : undefined}
                        allowWheelScrub={false}
                        value={shadowDimensions[index]}
                        onValueChange={(value) =>
                          setShadowDimensions((current) => current.with(index, value))
                        }
                      >
                        <NumberField.Group className="grid grid-cols-[76px_minmax(0,1fr)_28px_28px] items-center gap-1">
                          <Label htmlFor={fieldId} className={label}>
                            {dimension}
                          </Label>
                          <NumberField.Input
                            render={<Input className={`${field} ${fieldInput}`} />}
                          />
                          <NumberField.Increment
                            render={<Button variant="ghost" size="icon" />}
                            aria-label={`Increase shadow ${dimension.toLowerCase()}`}
                            className={iconButton}
                          >
                            <Plus aria-hidden="true" />
                          </NumberField.Increment>
                          <NumberField.Decrement
                            render={<Button variant="ghost" size="icon" />}
                            aria-label={`Decrease shadow ${dimension.toLowerCase()}`}
                            className={iconButton}
                          >
                            <Minus aria-hidden="true" />
                          </NumberField.Decrement>
                        </NumberField.Group>
                      </NumberField.Root>
                    );
                  })}
              </div>
            </PopoverContent>
          </Popover>
        );
      })}
    </div>
  );
  const dimensionSections = dimensions.map(({ name, dimension }) => {
    const fieldId = `${id}-${name}-${dimension}`;
    return {
      name,
      content: (
        <div className="grid w-full max-w-xs gap-2">
          <Label htmlFor={fieldId} className={styleLabel}>
            {dimension}
          </Label>
          <InspectorNumberField id={fieldId} label={`${name} ${dimension.toLowerCase()}`} />
        </div>
      ),
    };
  });

  return (
    <Popover defaultOpen={defaultCornersOpen}>
      <PopoverAnchor asChild>
        <aside
          aria-label="Style inspector"
          data-slot={isSidebar ? "sidebar" : undefined}
          data-sidebar={isSidebar ? "sidebar" : undefined}
          className={`${typography} antialiased tabular-nums ${
            isSidebar
              ? "flex min-h-svh w-64 max-w-full shrink-0 flex-col border-l border-sidebar-border bg-white"
              : "w-full border-t border-neutral-200 bg-white shadow-[0_-4px_18px_-8px_rgba(0,0,0,0.18)]"
          }`}
        >
          {isSidebar ? (
            <div data-sidebar="content">
              <div className="border-b border-sidebar-border px-3 py-2">
                <Select value={sidebarSection} onValueChange={setSidebarSection}>
                  <SelectTrigger
                    aria-label="Inspector section"
                    size="sm"
                    className="-ml-1.5 gap-1.5 rounded-md border-0 bg-transparent px-1.5 py-0 text-xs font-semibold shadow-none hover:bg-sidebar-accent data-[size=sm]:h-7 dark:bg-transparent [&>svg]:size-3"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    align="start"
                    className="rounded-md bg-white text-neutral-950"
                  >
                    {[{ name: "Styles", Icon: Paintbrush }, ...dimensions].map(({ name, Icon }) => (
                      <SelectItem key={name} value={name} className="text-xs">
                        <Icon aria-hidden="true" className="size-3.5" />
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div hidden={sidebarSection !== "Styles"} className="px-3 py-4">
                {styles}
                {children}
              </div>
              {dimensionSections.map(({ name, content }) => (
                <div key={name} hidden={sidebarSection !== name} className="px-3 py-4">
                  {content}
                </div>
              ))}
            </div>
          ) : (
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
              {dimensionSections.map(({ name, content }) => (
                <TabsContent key={name} value={name} forceMount className={panel}>
                  {content}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </aside>
      </PopoverAnchor>
      <PopoverContent
        aria-labelledby={`${id}-corner-title`}
        side={isSidebar ? "left" : "top"}
        align="start"
        alignOffset={isSidebar ? 48 : 20}
        sideOffset={isSidebar ? 8 : undefined}
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
              <Label htmlFor={`${id}-corner-${index}`} className={label}>
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
