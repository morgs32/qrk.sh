import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { TodoCommandCode } from './TodoCommandCode';

const meta = {
  title: 'Components/Todo Command Code',
  component: TodoCommandCode,
  decorators: [Story => (
    <div style={{ maxWidth: 530, padding: 24 }}>
      <Story />
    </div>
  )],
} satisfies Meta<typeof TodoCommandCode>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
