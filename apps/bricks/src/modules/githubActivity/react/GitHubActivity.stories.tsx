import type { Meta, StoryObj } from "@storybook/react-vite";
import { BrickStory } from "../../../../.storybook/BrickStory";
import { githubActivityV1 } from "../definition/githubActivityV1";
import { githubActivityView } from "./githubActivityView";
import { BrickShell } from "../../../components/BrickShell";
import { activityCalendarView } from "./ActivityCalendar";

const meta = {
  title: "Modules/GitHub Activity",
  parameters: { layout: "fullscreen", controls: { disable: true } },
  args: { fixture: "configured" },
  render(props) {
    const { fixture } = props;
    return (
      <BrickStory
        key={fixture}
        definition={githubActivityV1}
        view={githubActivityView}
        fixture={fixture}
        renderSketch={(state) => {
          const { data } = state;
          if (data === null) return null;
          return (
            <BrickShell className="bg-white">
              <activityCalendarView.Component contributions={data.contributions} />
            </BrickShell>
          );
        }}
      />
    );
  },
} satisfies Meta<{ fixture: "configured" | "unconfigured" }>;

export default meta;

export const Playground: StoryObj<typeof meta> = { name: "Breakpoint Previews" };
export const Unconfigured: StoryObj<typeof meta> = { args: { fixture: "unconfigured" } };
