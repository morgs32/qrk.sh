import type { Meta, StoryObj } from "@storybook/react-vite";
import { BrickStory } from "../../../.storybook/BrickStory";
import { instagramV1 } from "../definition/instagramV1";
import { instagramView } from "./instagramView";
import { instagramCardView } from "./InstagramCard";
import { instagramPostGridView } from "./InstagramPostGrid";
import { instagramMediaFooterView } from "./InstagramMediaFooter";

const meta = {
  title: "Modules/Instagram",
  parameters: { layout: "fullscreen", controls: { disable: true } },
  args: { fixture: "configured" },
  render(props) {
    const { fixture } = props;
    return (
      <BrickStory
        key={fixture}
        definition={instagramV1}
        view={instagramView}
        fixture={fixture}
        renderSketch={(state) => {
          const { data } = state;
          if (data === null) return null;
          return (
            <instagramCardView.Component username={data.username}>
              <instagramPostGridView.Component
                postImageUrls={data.postImageUrls}
                username={data.username}
              />
              <instagramMediaFooterView.Component
                followersText={data.followersText}
                username={data.username}
              />
            </instagramCardView.Component>
          );
        }}
      />
    );
  },
} satisfies Meta<{ fixture: "configured" | "unconfigured" }>;

export default meta;

export const Playground: StoryObj<typeof meta> = { name: "Breakpoint Previews" };
export const Unconfigured: StoryObj<typeof meta> = { args: { fixture: "unconfigured" } };
