import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ComponentProps, useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { GooglePlaceLookup } from "../../modules/mapPlace/react/GooglePlaceLookup";
import { MaterialSymbolsIconLookup } from "../../modules/swatchAndIcon/react/MaterialSymbolsIconLookup";
import { ButtonGroupInput } from "../ButtonGroupInput";
import { ShadowInput } from "../ShadowInput";

const meta = {
  title: "Components/Form Inputs/Scripted",
  parameters: { controls: { disable: true } },
} satisfies Meta;
export default meta;

export const PlaceSearch: StoryObj<typeof meta> = {
  render: function RenderPlaceSearch() {
    const [value, setValue] = useState("");
    return <GooglePlaceLookup value={value} onChange={setValue} searchPlaces={searchPlaces} />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const popup = within(canvasElement.ownerDocument.body);
    const input = canvas.getByRole("combobox", { name: "Place" });
    const stale = Promise.withResolvers<Awaited<ReturnType<typeof searchPlaces>>>();
    searchPlaces.mockReset();
    searchPlaces
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValue({ _tag: "Right", right: [place] });

    await userEvent.type(input, "old");
    await waitFor(() => expect(searchPlaces).toHaveBeenCalledOnce(), { timeout: 2000 });
    await userEvent.clear(input);
    await userEvent.type(input, "park");
    const option = await popup.findByRole("option", { name: /Central Park/ });
    expect(searchPlaces.mock.calls[0]?.[1].aborted).toBe(true);
    stale.resolve({ _tag: "Right", right: [{ ...place, mainText: "Stale result" }] });
    await stale.promise;
    expect(popup.queryByRole("option", { name: /Stale result/ })).not.toBeInTheDocument();

    await userEvent.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", option.id);
    await userEvent.keyboard("{Escape}");
    expect(input).toHaveAttribute("aria-expanded", "false");

    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() => expect(input).toHaveAttribute("aria-expanded", "true"));
    await userEvent.keyboard("{Enter}");
    expect(input).toHaveValue("Central Park");
    await userEvent.click(canvas.getByRole("button", { name: "Clear place search" }));
    expect(input).toHaveValue("");
  },
};

const place = {
  placeId: "central-park",
  mainText: "Central Park",
  secondaryText: "New York",
  description: "Central Park, New York",
};
const searchPlaces = fn<NonNullable<ComponentProps<typeof GooglePlaceLookup>["searchPlaces"]>>();

export const IconSelection: StoryObj<typeof meta> = {
  render: function RenderIconSelection() {
    const [value, setValue] = useState("");
    return <MaterialSymbolsIconLookup value={value} onChange={(icon) => setValue(icon.hash)} />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("searchbox", { name: "Search icons" });
    await userEvent.type(input, "ar");
    const results = within(
      await canvas.findByRole("group", { name: "Material Symbols icon results" }),
    );
    const firstPageCount = results.getAllByRole("button").length;
    await userEvent.click(canvas.getByRole("button", { name: /^Load more/ }));
    expect(results.getAllByRole("button").length).toBeGreaterThan(firstPageCount);

    await userEvent.clear(input);
    await userEvent.type(input, "star");
    const result = await canvas.findByRole("button", { name: "star, Material Symbols Sharp Line" });
    await userEvent.tab();
    expect(result).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(result).toHaveAttribute("aria-current", "true");
  },
};

export const AlignAndShadow: StoryObj<typeof meta> = {
  render: function RenderAlignAndShadow() {
    const [align, setAlign] = useState("");
    const [shadow, setShadow] = useState<ComponentProps<typeof ShadowInput>["value"]>({
      x: 0,
      y: 0,
      blur: 0,
      spread: 0,
      color: "",
    });
    return (
      <>
        <ButtonGroupInput
          label="Align"
          value={align}
          onChange={setAlign}
          options={[
            { value: "left", label: "Left", icon: "L" },
            { value: "right", label: "Right", icon: "R" },
          ]}
        />
        <ShadowInput value={shadow} onChange={setShadow} />
      </>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const left = canvas.getByRole("radio", { name: "Left" });
    const right = canvas.getByRole("radio", { name: "Right" });
    expect(left).not.toBeChecked();
    await userEvent.click(left);
    await userEvent.keyboard("{ArrowRight}");
    expect(right).toBeChecked();
    expect(left).not.toBeChecked();

    const shadow = canvas.getByRole("textbox", { name: "Shadow" });
    await userEvent.clear(shadow);
    await userEvent.type(shadow, "0, 2, nope, 0");
    await userEvent.tab();
    expect(shadow).toHaveValue("0, 2, nope, 0");
    expect(shadow).toBeInvalid();
    expect(shadow).toHaveAccessibleDescription(/Enter four numbers/);
    await userEvent.clear(shadow);
    await userEvent.type(shadow, "1,2,3,4");
    await userEvent.tab();
    expect(shadow).toHaveValue("1, 2, 3, 4");
    expect(shadow).toBeValid();
  },
};
