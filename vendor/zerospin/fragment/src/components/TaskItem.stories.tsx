import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { TaskItem } from './TaskItem';

const meta = {
  title: 'Components/Task Item',
  component: TaskItem,
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div className="payment-stage">
      <TaskItem />
    </div>
  ),
} satisfies Meta<typeof TaskItem>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
