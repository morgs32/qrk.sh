import type { Meta, StoryObj } from "@storybook/react-vite";
import { BrickBreakpointPreviews } from "../../.storybook/BrickBreakpointPreviews";
import { linkCardView } from "./LinkCard";
import { linkCopyView } from "./LinkCopy";
import { linkHeroImageView } from "./LinkHeroImage";

const meta = {
  title: "Modules/Link",
  parameters: { layout: "fullscreen", controls: { disable: true } },
  args: { fixture: "configured" },
  render(props) {
    const { fixture } = props;
    return (
      <BrickBreakpointPreviews
        key={fixture}
        moduleId="link"
        fixture={fixture}
        renderSketch={(state) => {
          const { data } = state;
          if (data === null) return null;
          return (
            <linkCardView.Component>
              <linkCopyView.Component
                iconUrl={data.iconUrl}
                siteName={data.siteName}
                title={data.title}
                url={data.url}
              />
              <linkHeroImageView.Component imageUrl={data.imageUrl} />
            </linkCardView.Component>
          );
        }}
      />
    );
  },
} satisfies Meta<{ fixture: "configured" | "unconfigured" }>;

export default meta;

export const Playground: StoryObj<typeof meta> = { name: "Breakpoint Previews" };
export const Unconfigured: StoryObj<typeof meta> = { args: { fixture: "unconfigured" } };
