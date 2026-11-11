import type { Meta, StoryObj } from "@storybook/react-vite";
import { BrickStory } from "../../../../.storybook/BrickStory";
import { imageV2 } from "../definition/imageV2";
import { imageView } from "./imageView";
import { MediaFooter } from "../../../components/MediaFooter";
import { imageCardView } from "./ImageCard";
import { imageCoverView } from "./ImageCover";

const meta = {
  title: "Modules/Image",
  parameters: { layout: "fullscreen", controls: { disable: true } },
  args: { fixture: "configured" },
  render(props) {
    const { fixture } = props;
    return (
      <BrickStory
        key={fixture}
        definition={imageV2}
        view={imageView}
        fixture={fixture}
        renderSketch={(state) => {
          return (
            <imageCardView.Component>
              <imageCoverView.Component
                imagePosition="center"
                imageUrl={state.imageUrl}
                title={state.title}
                crop={state.crop}
              />
              <MediaFooter heading={state.title} />
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
