import type { Meta, StoryObj } from "@storybook/react-vite";
import { BrickBreakpointPreviews } from "../../.storybook/BrickBreakpointPreviews";
import { BrickShell } from "../components/brick/BrickShell";
import { activityCalendarView } from "./ActivityCalendar";

const meta = {
  title: "Modules/GitHub Activity",
  parameters: { layout: "fullscreen", controls: { disable: true } },
  args: { fixture: "configured" },
  render(props) {
    const { fixture } = props;
    return (
      <BrickBreakpointPreviews
        key={fixture}
        moduleId="github-activity"
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
