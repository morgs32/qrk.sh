import type { Meta, StoryObj } from "@storybook/react-vite";

import { BrickStory } from "../../../../.storybook/BrickStory";
import { BrickShell } from "../../../components/BrickShell";
import { behanceV1 } from "../definition/behanceV1";
import { behanceCardView } from "./BehanceCard";
import { behanceView } from "./behanceView";
import illustrationUrl from "./story-illustration.svg?url";

const meta = {
  title: "Modules/Behance",
  parameters: { layout: "fullscreen", controls: { disable: true } },
  args: { fixture: "configured" },
  render(props) {
    const { fixture } = props;
    return (
      <BrickStory
        key={fixture}
        illustrationUrl={illustrationUrl}
        definition={behanceV1}
        view={behanceView}
        fixture={fixture}
        renderSketch={(state) => (
          <BrickShell>
            <behanceCardView.Component {...state.payload} {...state.data} />
          </BrickShell>
        )}
      />
    );
  },
} satisfies Meta<{ fixture: "configured" | "unconfigured" }>;

export default meta;

export const Playground: StoryObj<typeof meta> = { name: "Breakpoint Previews" };
export const Unconfigured: StoryObj<typeof meta> = { args: { fixture: "unconfigured" } };
