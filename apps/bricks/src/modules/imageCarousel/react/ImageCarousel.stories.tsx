import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { BrickWrapper } from "../../../components/BrickWrapper";
import { imageCarouselView } from "./imageCarouselView";
import { ImageCarouselForm } from "./ImageCarouselForm";

const initialState = {
  interval: 5,
  slides: [
    {
      id: "mountains",
      imageUrl:
        "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=800&q=80",
      alt: "Mountain landscape",
      crop: null,
    },
    {
      id: "coast",
      imageUrl:
        "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=800&q=80",
      alt: "Lake and mountains",
      crop: null,
    },
  ],
};

const meta = {
  title: "Modules/Image Carousel",
  parameters: { layout: "fullscreen" },
  render() {
    const [state, setState] =
      useState<Parameters<typeof ImageCarouselForm>[0]["state"]>(initialState);
    return (
      <main className="qrk-bricks flex flex-wrap gap-6 bg-background p-6">
        <div className="w-[480px] max-w-full">
          <BrickWrapper className="h-[360px] [&_.brick-content]:h-full">
            <imageCarouselView.Render
              state={state}
              variantId="default"
              spec={imageCarouselView.variants.default.spec}
            />
          </BrickWrapper>
        </div>
        <div className="w-72">
          <ImageCarouselForm
            state={state}
            onSave={(next) => {
              setState(next);
              return { _tag: "Success", success: undefined };
            }}
          />
        </div>
      </main>
    );
  },
} satisfies Meta;
export default meta;

export const Playground: StoryObj<typeof meta> = {};
export const Controls: StoryObj<typeof meta> = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(
        canvas.getByRole("button", { name: "Stop slide rotation" }),
      ).toBeInTheDocument(),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Stop slide rotation" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Start slide rotation" }),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Next image" }));
    await waitFor(() =>
      expect(
        canvas.getByRole("button", { name: "Show image 2" }),
      ).toHaveAttribute("aria-current", "true"),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Show image 1" }));
    await waitFor(() =>
      expect(
        canvas.getByRole("button", { name: "Show image 1" }),
      ).toHaveAttribute("aria-current", "true"),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Move image 2 up" }),
    );
    await waitFor(() =>
      expect(
        canvas.getByRole("img", { name: "Lake and mountains" }),
      ).toBeInTheDocument(),
    );
  },
};
