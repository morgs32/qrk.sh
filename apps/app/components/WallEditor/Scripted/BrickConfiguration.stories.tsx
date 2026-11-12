import type { StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { SWRConfig } from "swr";
import { modulesHash } from "../../../modules/modulesHash";
import wallEditorMeta from "../WallEditor.stories";

const meta = {
  ...wallEditorMeta,
  title: "Studio/WallEditor.tsx/Scripted",
  tags: ["!dev"],
  id: "app-studio-wall-editor",
};

export default meta;

let finishUpload: ((url: string) => void) | undefined;

export const ConfigureBrick: StoryObj<typeof meta> = {
  args: { fixture: "default", emptyWall: true },
  decorators: [
    (Story) => (
      <SWRConfig
        value={{
          uploadImage: () =>
            new Promise<string>((resolve) => {
              finishUpload = resolve;
            }),
        }}
      >
        <Story />
      </SWRConfig>
    ),
  ],
  beforeEach: () => {
    finishUpload = undefined;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole("region", { name: "Images" })).toBeVisible());
    const images = within(canvas.getByRole("region", { name: "Images" }));
    expect(images.getByRole("button", { name: "Choose Image" })).toBeVisible();
    expect(images.getByRole("button", { name: "Choose Image with caption" })).toBeVisible();
    expect(images.getByRole("button", { name: "Choose Image Carousel" })).toBeVisible();
    expect(modulesHash.image.previewStates?.captionless).toEqual(
      expect.objectContaining({ caption: "" }),
    );
    expect(modulesHash.image.previewStates?.captioned).toEqual(
      expect.objectContaining({ caption: "White Bay Power Station" }),
    );
    const plainPreview = images
      .getByRole("button", { name: "Choose Image" })
      .closest<HTMLElement>("[data-catalog-module-id]");
    const captionedPreview = images
      .getByRole("button", { name: "Choose Image with caption" })
      .closest<HTMLElement>("[data-catalog-module-id]");
    if (!plainPreview || !captionedPreview) throw new Error("Missing Image previews");
    expect(within(plainPreview).queryByText("White Bay Power Station")).toBeNull();
    expect(within(captionedPreview).getByText("White Bay Power Station")).toBeVisible();
    const github = within(canvas.getByRole("region", { name: "GitHub" }));
    expect(github.getByRole("button", { name: "Choose GitHub Activity" })).toBeVisible();
    expect(github.getByRole("button", { name: "Choose GitHub Profile" })).toBeVisible();
    expect(github.getByRole("button", { name: "Choose GitHub Repo" })).toBeVisible();

    await userEvent.click(canvas.getByRole("tab", { name: "Music" }));
    expect(canvas.queryByRole("region", { name: "Images" })).toBeNull();
    await userEvent.click(canvas.getByRole("tab", { name: "All" }));
    await userEvent.click(canvas.getByRole("button", { name: "Choose Image with caption" }));
    expect(canvas.getByText("Complete the configuration before dragging.")).toBeVisible();
    expect(
      canvasElement.querySelector('[data-catalog-module-id="image"][draggable="true"]'),
    ).toBeNull();
    const imageSource = canvasElement.querySelector<HTMLElement>(
      '[data-catalog-module-id="image"]',
    );
    if (!imageSource) throw new Error("Missing configured Image preview");
    await userEvent.type(canvas.getByLabelText("Caption"), "A live caption");
    await userEvent.click(canvas.getByRole("button", { name: /^Image(?: Image)?$/ }));
    const dialog = within(canvasElement.ownerDocument.body).getByRole("dialog", { name: "Image" });
    const file = new File(
      [
        Uint8Array.from(
          atob(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmN8AAAAASUVORK5CYII=",
          ),
          (character) => character.charCodeAt(0),
        ),
      ],
      "fixture.png",
      { type: "image/png" },
    );
    await userEvent.upload(within(dialog).getByLabelText("Choose image"), file);
    const crop = await within(dialog).findByAltText("Crop preview");
    fireEvent.load(crop);
    await userEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    expect(within(dialog).getByRole("button", { name: "Uploading…" })).toBeDisabled();
    expect(imageSource).not.toHaveAttribute("draggable", "true");
    if (finishUpload === undefined) throw new Error("Upload did not start");
    const imageUrl = URL.createObjectURL(file);
    finishUpload(imageUrl);
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).queryByRole("dialog", { name: "Image" }),
      ).toBeNull(),
    );
    await waitFor(() => expect(within(imageSource).getByText("A live caption")).toBeVisible());
    expect(imageSource).not.toHaveAttribute("draggable", "true");
    const alt = canvas.getByLabelText("Alt text");
    await userEvent.type(alt, "A tiny image");
    expect(imageSource).not.toHaveAttribute("draggable", "true");
    fireEvent.blur(alt);
    await waitFor(() => expect(imageSource).toHaveAttribute("draggable", "true"));
    expect(within(imageSource).getByAltText("A tiny image")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: /^Image(?: Image)?$/ }));
    expect(imageSource).not.toHaveAttribute("draggable", "true");
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() => expect(imageSource).toHaveAttribute("draggable", "true"));
    await userEvent.click(canvas.getByRole("button", { name: "Back" }));
    URL.revokeObjectURL(imageUrl);
    const swatchButton = canvas.getByRole("button", { name: "Choose Swatch and Icon" });
    const swatchPreview = swatchButton.closest("[data-catalog-module-id]");
    const sampledColor = swatchPreview?.querySelector<HTMLElement>(".brick-content > [style]")
      ?.style.backgroundColor;
    const sampledIcon = swatchPreview?.querySelector("img")?.getAttribute("src");
    if (!sampledColor || !sampledIcon) throw new Error("Missing sampled Swatch content");
    fireEvent.click(swatchButton);
    const source = canvasElement.querySelector<HTMLElement>(
      '[data-catalog-module-id="swatch-and-icon"]',
    );
    if (!source) throw new Error("Missing configured Swatch preview");
    await waitFor(() => expect(source.getAttribute("draggable")).toBe("true"));
    expect(
      source.querySelector<HTMLElement>(".brick-content > [style]")?.style.backgroundColor,
    ).toBe(sampledColor);
    expect(source.querySelector("img")?.getAttribute("src")).toBe(sampledIcon);
    const cancelled = new DataTransfer();
    fireEvent.dragStart(source, { dataTransfer: cancelled });
    fireEvent.dragEnd(source, { dataTransfer: cancelled });
    expect(canvas.getByText("Configure Swatch and Icon")).toBeVisible();
    const wall = canvasElement.querySelector<HTMLElement>(".wall-editor");
    if (!wall) throw new Error("Missing empty Wall");
    const bounds = wall.getBoundingClientRect();
    const dataTransfer = new DataTransfer();
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(wall, {
      dataTransfer,
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2,
    });
    await waitFor(() => expect(wall.querySelector(".wall-shadow-placeholder")).not.toBeNull());
    fireEvent.drop(wall, {
      dataTransfer,
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2,
    });
    fireEvent.dragEnd(source, { dataTransfer });
    await waitFor(() => expect(canvas.getByRole("region", { name: "Images" })).toBeVisible());
    expect(wall.querySelector("[data-wall-placement-id]")).not.toBeNull();
  },
};
