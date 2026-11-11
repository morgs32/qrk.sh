import type { Meta, StoryObj } from "@storybook/react-vite";
import { BrickStory } from "../../../../.storybook/BrickStory";
import { figmaThumbnailV1 } from "../definition/figmaThumbnailV1";
import { figmaThumbnailView } from "./figmaThumbnailView";
import { figmaCardView } from "./FigmaCard";
import { figmaThumbnailBandView } from "./FigmaThumbnailBand";
import { figmaMediaFooterView } from "./FigmaMediaFooter";
import illustrationUrl from "./story-illustration.svg?url";

const meta = {
  title: "Modules/Figma Thumbnail",
  parameters: { layout: "fullscreen", controls: { disable: true } },
  args: { fixture: "configured" },
  render(props) {
    const { fixture } = props;
    return (
      <BrickStory
        illustrationUrl={illustrationUrl}
        key={fixture}
        definition={figmaThumbnailV1}
        view={figmaThumbnailView}
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
