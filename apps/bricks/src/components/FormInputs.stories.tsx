import { Dialog } from "@base-ui/react/dialog";
import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  BrickWall,
  Copy,
  Layers,
  Rows3,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { BorderInput } from "./BorderInput";
import { Button } from "./button";
import { ButtonGroupInput } from "./ButtonGroupInput";
import { Checkbox } from "./checkbox";
import { ColorInput } from "./ColorInput";
import { DialogContent } from "./dialog";
import { DropdownInput } from "./DropdownInput";
import { ImageUploadInput } from "./ImageUploadInput";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "./field";
import { Input } from "./Input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./input-group";
import { TextInput } from "./TextInput";
import { NumberInput } from "./NumberInput";
import { PositionInput } from "./PositionInput";
import { RadiusInput } from "./RadiusInput";
import { ShadowInput } from "./ShadowInput";
import { SizeInput } from "./SizeInput";
import { Slider } from "./slider";
import { StudioSidebar } from "./StudioSidebar";
import { TextboxInput } from "./TextboxInput";

const meta = {
  title: "Components/Form Inputs",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

export const Catalog: StoryObj<typeof meta> = {
  render: function RenderCatalog() {
    const [imageUrl, setImageUrl] = useState("");
    const [imageCrop, setImageCrop] =
      useState<Parameters<typeof ImageUploadInput>[0]["crop"]>(null);
    const objectUrl = useRef<string>(null);
    const siteObjectUrls = useRef(new Map<string, string>());
    const [siteImages, setSiteImages] = useState<Record<string, string>>({});
    const settingsId = useId();
    const [fit, setFit] = useState("cover");
    const [align, setAlign] = useState("center");

    useEffect(() => {
      const urls = siteObjectUrls.current;
      return () => {
        if (objectUrl.current !== null) URL.revokeObjectURL(objectUrl.current);
        for (const url of urls.values()) URL.revokeObjectURL(url);
        urls.clear();
      };
    }, []);

    const [color, setColor] = useState("#b73737");
    const pickerColor = /^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(color) ? color : "#ffffff";
    const [dimensions, setDimensions] = useState<Record<string, number | null>>({});
    const [position, setPosition] = useState<Parameters<typeof PositionInput>[0]["value"]>({
      x: 0,
      y: 0,
    });
    const [size, setSize] = useState<Parameters<typeof SizeInput>[0]["value"]>({
      width: 0,
      height: 0,
    });
    const [radius, setRadius] = useState<Parameters<typeof RadiusInput>[0]["value"]>({
      topLeft: 0,
      topRight: 0,
      bottomRight: 0,
      bottomLeft: 0,
    });
    const [border, setBorder] = useState<Parameters<typeof BorderInput>[0]["value"]>({
      width: 0,
      color: "",
    });
    const [shadow, setShadow] = useState<Parameters<typeof ShadowInput>[0]["value"]>({
      x: 0,
      y: 0,
      blur: 0,
      spread: 0,
      color: "",
    });
    const sections = [
      {
        title: "TextInput.tsx",
        content: (
          <FieldGroup>
            {[
              { label: "Text", type: "text", placeholder: "Title" },
              { label: "URL", type: "url", placeholder: "https://example.com" },
              { label: "Search", type: "search", placeholder: "Search" },
              { label: "File", type: "file" },
            ].map(({ label, type, placeholder }) => (
              <TextInput key={type} label={label} type={type} placeholder={placeholder} />
            ))}
          </FieldGroup>
        ),
      },
      {
        title: "TextboxInput.tsx",
        content: (
          <Field>
            <FieldLabel htmlFor={`${settingsId}-description`} className="min-h-0">
              Description
            </FieldLabel>
            <TextboxInput
              id={`${settingsId}-description`}
              defaultValue={"A place for project updates.\nNew posts every Friday."}
            />
          </Field>
        ),
      },
      {
        title: "NumberInput.tsx",
        content: [
          { label: "Row width", Icon: Rows3 },
          { label: "Stack height", Icon: Layers },
          { label: "Brick width", Icon: BrickWall },
        ].map(({ label, Icon }) => (
          <NumberInput
            key={label}
            steppers
            label={label}
            min={0}
            leadingIcon={<Icon className="size-3" />}
            value={dimensions[label] ?? null}
            onChange={(value) => setDimensions((current) => ({ ...current, [label]: value }))}
          />
        )),
      },
      {
        title: "PositionInput.tsx",
        content: <PositionInput value={position} onChange={setPosition} />,
      },
      { title: "SizeInput.tsx", content: <SizeInput value={size} onChange={setSize} /> },
      { title: "RadiusInput.tsx", content: <RadiusInput value={radius} onChange={setRadius} /> },
      { title: "BorderInput.tsx", content: <BorderInput value={border} onChange={setBorder} /> },
      { title: "ShadowInput.tsx", content: <ShadowInput value={shadow} onChange={setShadow} /> },
      {
        title: "ImageUploadInput.tsx",
        content: (
          <ImageUploadInput
            label="Edit"
            imageUrl={imageUrl}
            crop={imageCrop}
            getFrameAspectRatio={() => 4 / 3}
            onApply={(source) => {
              setImageUrl(source.imageUrl);
              setImageCrop(source.crop);
            }}
            uploadImage={async (file) => {
              if (objectUrl.current !== null) URL.revokeObjectURL(objectUrl.current);
              objectUrl.current = URL.createObjectURL(file);
              return objectUrl.current;
            }}
          />
        ),
      },
      {
        title: "DropdownInput.tsx",
        content: (
          <DropdownInput
            label="Fit"
            value={fit}
            onChange={setFit}
            options={[
              { value: "cover", label: "Cover" },
              { value: "contain", label: "Contain" },
              { value: "fill", label: "Fill" },
            ]}
          />
        ),
      },
      {
        title: "ButtonGroupInput.tsx",
        content: (
          <ButtonGroupInput
            label="Align"
            value={align}
            onChange={setAlign}
            options={[
              { value: "left", label: "Align Left", icon: <AlignLeft aria-hidden="true" /> },
              { value: "center", label: "Align Center", icon: <AlignCenter aria-hidden="true" /> },
              { value: "right", label: "Align Right", icon: <AlignRight aria-hidden="true" /> },
              {
                value: "justify",
                label: "Align Justify",
                icon: <AlignJustify aria-hidden="true" />,
              },
            ]}
          />
        ),
      },
      {
        title: "ColorInput.tsx",
        content: (
          <ColorInput
            value={color}
            pickerColor={pickerColor}
            onChange={setColor}
            onCommit={setColor}
          />
        ),
      },
      {
        title: "Site Settings",
        content: (
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldLabel htmlFor={`${settingsId}-cards`}>Cards</FieldLabel>
              <FieldContent>
                <Checkbox
                  id={`${settingsId}-cards`}
                  className="mt-1.5"
                  aria-describedby={`${settingsId}-cards-help`}
                />
                <FieldDescription id={`${settingsId}-cards-help`}>
                  Show each brick as a card
                </FieldDescription>
              </FieldContent>
            </Field>
            <Field orientation="horizontal">
              <FieldLabel id={`${settingsId}-gap`}>Brick gap</FieldLabel>
              <FieldContent>
                <Slider
                  className="flex items-center gap-2"
                  thumbLabelledBy={`${settingsId}-gap`}
                  thumbDescribedBy={`${settingsId}-gap-help`}
                  thumbAlignment="edge"
                  min={0}
                  max={12}
                  step={1}
                  defaultValue={0}
                >
                  <SliderPrimitive.Value className="w-7 shrink-0 text-right text-xs tabular-nums">
                    {(_formattedValues, [gap]) => `${gap}px`}
                  </SliderPrimitive.Value>
                </Slider>
                <FieldDescription id={`${settingsId}-gap-help`}>
                  Space between bricks, from 0 to 12 pixels
                </FieldDescription>
              </FieldContent>
            </Field>
            <Field orientation="horizontal">
              <FieldLabel htmlFor={`${settingsId}-sticky`}>Sticky navbar</FieldLabel>
              <FieldContent>
                <Checkbox
                  id={`${settingsId}-sticky`}
                  className="mt-1.5"
                  aria-describedby={`${settingsId}-sticky-help`}
                  defaultChecked
                />
                <FieldDescription id={`${settingsId}-sticky-help`}>
                  Keep the navbar visible while scrolling
                </FieldDescription>
              </FieldContent>
            </Field>
            {[
              { label: "Logo", help: "PNG or SVG, up to 48px tall recommended" },
              { label: "Light favicon", help: "64 × 64 pixels" },
              { label: "Dark favicon", help: "64 × 64 pixels" },
            ].map(({ label, help }) => (
              <ImageUploadInput
                key={label}
                label={label}
                description={help}
                imageUrl={siteImages[label] ?? ""}
                crop={null}
                onApply={({ imageUrl }) =>
                  setSiteImages((current) => ({ ...current, [label]: imageUrl }))
                }
                uploadImage={async (file) => {
                  const previousUrl = siteObjectUrls.current.get(label);
                  if (previousUrl !== undefined) URL.revokeObjectURL(previousUrl);
                  const url = URL.createObjectURL(file);
                  siteObjectUrls.current.set(label, url);
                  return url;
                }}
              />
            ))}
          </FieldGroup>
        ),
      },
    ];

    return (
      <div className="flex min-h-svh justify-end bg-white">
        <StudioSidebar label="Form inputs" sections={sections} />
      </div>
    );
  },
};

export const FieldHeights: StoryObj<typeof meta> = {
  render: () => (
    <div className="grid w-80 gap-3 p-4">
      <Input aria-label="Name" />
      <Input variant="sm" aria-label="Compact name" />
      <InputGroup>
        <InputGroupInput
          aria-label="Subdomain"
          aria-describedby="example-subdomain-suffix"
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
        />
        <InputGroupAddon align="inline-end" className="pe-2">
          <span id="example-subdomain-suffix">.qrk.sh</span>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup variant="sm">
        <InputGroupInput aria-label="Share URL" value="https://example.qrk.sh" readOnly />
        <InputGroupAddon align="inline-end">
          <Button type="button" aria-label="Copy share URL" variant="ghost" size="icon-xs">
            <Copy aria-hidden />
          </Button>
        </InputGroupAddon>
      </InputGroup>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const name = canvas.getByRole("textbox", { name: "Name" });
    const compactName = canvas.getByRole("textbox", { name: "Compact name" });
    const subdomain = canvas.getByRole("textbox", { name: "Subdomain" });
    const shareUrl = canvas.getByRole("textbox", { name: "Share URL" });
    const copy = canvas.getByRole("button", { name: "Copy share URL" });

    await expect(name.getBoundingClientRect().height).toBe(36);
    await expect(compactName.getBoundingClientRect().height).toBe(28);
    await expect(subdomain.getBoundingClientRect().height).toBe(36);
    await expect(shareUrl.getBoundingClientRect().height).toBe(28);
    await expect(copy.getBoundingClientRect().height).toBe(24);
    await expect(subdomain).toHaveAccessibleDescription(".qrk.sh");
    await userEvent.click(canvas.getByText(".qrk.sh"));
    await expect(subdomain).toHaveFocus();
    await userEvent.type(subdomain, "invalid slug");
    await expect(subdomain).toBeInvalid();
    await userEvent.clear(subdomain);
    await userEvent.type(subdomain, "valid-slug");
    await expect(subdomain).toBeValid();
    await userEvent.click(copy);
    await expect(copy).toHaveFocus();
  },
};

export const CompactDialog: StoryObj<typeof meta> = {
  render: () => (
    <Dialog.Root>
      <Dialog.Trigger render={<Button type="button" />}>Open dialog</Dialog.Trigger>
      <DialogContent>
        <Dialog.Title>Site details</Dialog.Title>
        <Input aria-label="Site name" />
      </DialogContent>
    </Dialog.Root>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const documentBody = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("button", { name: "Open dialog" });
    await userEvent.click(trigger);
    const dialog = await documentBody.findByRole("dialog", { name: "Site details" });
    await expect(getComputedStyle(dialog).padding).toBe("16px");
    await waitFor(() =>
      expect(documentBody.getByRole("textbox", { name: "Site name" })).toHaveFocus(),
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
