import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { CustomerStrip } from './CustomerStrip';

const meta = {
  title: 'Components/Customer Strip',
  component: CustomerStrip,
} satisfies Meta<typeof CustomerStrip>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
