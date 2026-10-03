import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { InstallCommandCard } from './InstallCommandCard';

const meta = {
  title: 'Components/Install Command Card',
  component: InstallCommandCard,
  args: {
    label: 'macOS / Linux',
    command: 'curl -fsSL https://vite.plus | bash',
  },
  decorators: [Story => (
    <div style={{ maxWidth: 575, padding: 24 }}>
      <Story />
    </div>
  )],
} satisfies Meta<typeof InstallCommandCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MacOsAndLinux: Story = {};

export const Windows: Story = {
  args: {
    label: 'Windows (PowerShell)',
    command: 'irm https://vite.plus/ps1 | iex',
  },
};
