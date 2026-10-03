import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { ChangelogSection } from './ChangelogSection';

const meta = {
  title: 'Components/Changelog Section',
  component: ChangelogSection,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ChangelogSection>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
