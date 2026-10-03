import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { BlogSection } from './BlogSection';

const meta = {
  title: 'Components/Blog Section',
  component: BlogSection,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof BlogSection>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
