import type { Meta, StoryObj } from "@storybook/react-vite";
import { BrickBreakpointPreviews } from "../../.storybook/BrickBreakpointPreviews";
import { MediaFooter } from "../components/brick/MediaFooter";
import { imageCardView } from "./ImageCard";
import { imageCoverView } from "./ImageCover";

const meta = {
  title: "Modules/Image",
  parameters: { layout: "fullscreen", controls: { disable: true } },
  args: { fixture: "configured" },
  render(props) {
    const { fixture } = props;
    return (
      <BrickBreakpointPreviews
        key={fixture}
        moduleId="image"
        fixture={fixture}
        renderSketch={(state) => {
          return (
            <imageCardView.Component>
              <imageCoverView.Component
                imagePosition="center"
                imageUrl={state.imageUrl}
                title={state.title}
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
