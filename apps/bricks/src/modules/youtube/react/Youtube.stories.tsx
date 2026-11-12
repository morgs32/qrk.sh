import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { YoutubeForm } from "./YoutubeForm";
import { youtubeView } from "./youtubeView";

const meta = {
  title: "Modules/YouTube",
  parameters: { layout: "fullscreen" },
  render() {
    const [state, setState] = useState<Parameters<typeof YoutubeForm>[0]["state"]>(null);
    return <main className="qrk-bricks flex flex-wrap gap-6 bg-background p-6">
      <div className="w-[480px] max-w-full"><youtubeView.Render state={null} variantId="default" spec={youtubeView.variants.default.spec} /></div>
      <div className="w-72"><YoutubeForm state={state} onSave={(next) => { setState(next); return { _tag: "Success", success: undefined }; }} /><p>Saved: {state?.content?.kind ?? "none"}</p></div>
    </main>;
  },
} satisfies Meta;
export default meta;
export const Playground: StoryObj<typeof meta> = {};
export const SelectPlaylist: StoryObj<typeof meta> = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("YouTube link"), "https://youtube.com/watch?v=M7lc1UVf-VE&list=PLabc123&t=90");
    await userEvent.click(canvas.getByRole("combobox", { name: "Show" }));
    await userEvent.click(within(canvasElement.ownerDocument.body).getByRole("option", { name: "Playlist" }));
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(canvas.getByText("Saved: playlist")).toBeInTheDocument();
    await expect(canvas.getByRole("combobox", { name: "Show" })).toHaveTextContent("Playlist");
    await expect(canvas.getByLabelText("YouTube link")).toHaveValue("https://www.youtube.com/watch?v=M7lc1UVf-VE&list=PLabc123&t=90");
  },
};
