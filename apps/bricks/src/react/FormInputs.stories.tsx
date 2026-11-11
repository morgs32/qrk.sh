import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  BrickWall,
  Layers,
  Rows3,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { BorderInput } from "./BorderInput";
import { ButtonGroupInput } from "./ButtonGroupInput";
import { ColorInput } from "./ColorInput";
import { DropdownInput } from "./DropdownInput";
import { ImageUploadInput } from "./ImageUploadInput";
import { Input } from "./Input";
import { NumberInput } from "./NumberInput";
import { PositionInput } from "./PositionInput";
import { RadiusInput } from "./RadiusInput";
import { ShadowInput } from "./ShadowInput";
import { SizeInput } from "./SizeInput";
import { StudioSidebar } from "./StudioSidebar";

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
    const [fit, setFit] = useState("cover");
    const [align, setAlign] = useState("center");

    useEffect(
      () => () => {
        if (objectUrl.current !== null) URL.revokeObjectURL(objectUrl.current);
      },
      [],
    );

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
        title: "Input.tsx",
        content: [
          { label: "Text", type: "text", placeholder: "Title" },
          { label: "URL", type: "url", placeholder: "https://example.com" },
          { label: "Search", type: "search", placeholder: "Search" },
          { label: "File", type: "file" },
        ].map(({ label, type, placeholder }) => (
          <label key={type} className="group grid gap-1.5">
            <span className="select-none text-xs leading-none font-medium text-muted-foreground group-focus-within:text-primary">
              {label}
            </span>
            <Input type={type} placeholder={placeholder} />
          </label>
        )),
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
    ];

    return (
      <div className="qrk-bricks flex min-h-svh justify-end bg-white">
        <StudioSidebar label="Form inputs" sections={sections} />
      </div>
    );
  },
};
