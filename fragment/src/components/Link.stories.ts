import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { Link } from './Link';

const meta = {
  title: 'Components/Link',
  component: Link,
  args: {
    children: 'Documentation',
    href: 'https://fragment.dev/docs',
  },
} satisfies Meta<typeof Link>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Underlined: Story = {};

export const Plain: Story = {
  args: { underlined: false },
};
