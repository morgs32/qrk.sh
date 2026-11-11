import type { Meta, StoryObj } from "@storybook/react-vite";
import { BrickBreakpointPreviews } from "../../.storybook/BrickBreakpointPreviews";
import { figmaCardView } from "./FigmaCard";
import { figmaThumbnailBandView } from "./FigmaThumbnailBand";
import { figmaMediaFooterView } from "./FigmaMediaFooter";

const meta = {
  title: "Modules/Figma Thumbnail",
  parameters: { layout: "fullscreen", controls: { disable: true } },
  args: { fixture: "configured" },
  render(props) {
    const { fixture } = props;
    return (
      <BrickBreakpointPreviews
        key={fixture}
        moduleId="figma-thumbnail"
        fixture={fixture}
        renderSketch={(state) => {
          const { data } = state;
          if (data === null) return null;
          return (
            <figmaCardView.Component>
              <figmaThumbnailBandView.Component
                imagePosition="left"
                thumbnail_height={data.thumbnail_height}
                thumbnail_url={data.thumbnail_url}
                thumbnail_width={data.thumbnail_width}
                title={data.title}
              />
              <figmaMediaFooterView.Component title={data.title} url={data.url} />
            </figmaCardView.Component>
          );
        }}
      />
    );
  },
} satisfies Meta<{ fixture: "configured" | "unconfigured" }>;

export default meta;

export const Playground: StoryObj<typeof meta> = { name: "Breakpoint Previews" };
export const Unconfigured: StoryObj<typeof meta> = { args: { fixture: "unconfigured" } };
