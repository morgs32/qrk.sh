import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { NeonPath } from './NeonPath';

const meta = {
  title: 'Components/Neon Path',
  component: NeonPath,
  parameters: {
    layout: 'fullscreen',
    controls: { disable: true },
  },
  decorators: [
    (Story) => (
      <div
        style={{
          display: 'grid',
          placeItems: 'center',
          minHeight: '100vh',
          background: '#060b10',
        }}
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NeonPath>;

export default meta;
type IStory = StoryObj<typeof meta>;

export const Default: IStory = {};
