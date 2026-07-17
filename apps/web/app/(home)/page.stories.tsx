import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ClerkProvider } from "@clerk/nextjs";

import HomeLayout from "./layout";
import HomePage from "./page";

/** Render the complete public homepage in the same route layout used by Next.js. */
function HomepageStory() {
  return (
    <ClerkProvider
      initialState={{
        sessionId: undefined,
        userId: undefined,
        user: undefined,
        organization: undefined,
      }}
    >
      <HomeLayout>
        <HomePage />
      </HomeLayout>
    </ClerkProvider>
  );
}

const meta = {
  title: "Homepage",
  component: HomepageStory,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
    },
  },
} satisfies Meta<typeof HomepageStory>;

export default meta;

export const Default: StoryObj<typeof meta> = {};
