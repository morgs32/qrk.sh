import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";

import { SpotifyForm } from "./SpotifyForm";
import { spotifyView } from "./spotifyView";

const meta = {
  title: "Modules/Spotify",
  parameters: { layout: "fullscreen" },
  render() {
    const [state, setState] = useState<Parameters<typeof SpotifyForm>[0]["state"]>(null);
    return (
      <main className="qrk-bricks flex flex-wrap gap-6 bg-background p-6">
        <div className="w-[480px] max-w-full">
          <spotifyView.Render
            state={null}
            variantId="default"
            spec={spotifyView.variants.default.spec}
          />
        </div>
        <div className="w-72">
          <SpotifyForm
            state={state}
            onSave={(next) => {
              setState(next);
              return { _tag: "Success", success: undefined };
            }}
          />
          <p>Saved link: {state?.url ?? "none"}</p>
        </div>
      </main>
    );
  },
} satisfies Meta;

export default meta;

export const Playground: StoryObj<typeof meta> = {};

export const SaveDirectLink: StoryObj<typeof meta> = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByLabelText("Spotify link"),
      "https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6?si=example",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      canvas.getByText("Saved link: https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6"),
    ).toBeInTheDocument();
  },
};
