import type { Meta, StoryObj } from "@storybook/react-vite";
import { BrickStory } from "../../../../.storybook/BrickStory";
import { imageV4 } from "../definition/imageV4";
import { imageView } from "./imageView";
import { MediaFooter } from "../../../components/MediaFooter";
import { imageCardView } from "./ImageCard";
import { imageCoverView } from "./ImageCover";
import illustrationUrl from "./story-illustration.svg?url";

const meta = {
  title: "Modules/Image",
  parameters: { layout: "fullscreen", controls: { disable: true } },
  args: { fixture: "configured" },
  render(props) {
    const { fixture } = props;
    return (
      <BrickStory
        illustrationUrl={illustrationUrl}
        key={fixture}
        definition={imageV4}
        view={imageView}
        fixture={fixture}
        renderSketch={(state) => {
          return (
            <imageCardView.Component round={state.round}>
              <imageCoverView.Component
                imagePosition="center"
                imageUrl={state.imageUrl}
                title={state.altText}
                crop={state.crop}
                round={state.round}
              />
              <MediaFooter heading={state.caption} />
            </imageCardView.Component>
          );
        }}
      />
    );
  },
} satisfies Meta<{ fixture: "configured" | "unconfigured" }>;

export default meta;

export const Playground: StoryObj<typeof meta> = { name: "Breakpoint Previews" };
export const Unconfigured: StoryObj<typeof meta> = { args: { fixture: "unconfigured" } };
