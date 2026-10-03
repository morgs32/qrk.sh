import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { CompactTable } from './CompactTable';

const meta = {
  title: 'Components/CompactTable',
  component: CompactTable,
  decorators: [
    (Story) => (
      <div style={{ width: 420, maxWidth: '100%' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    caption: 'List v1',
    rows: [
      { id: 'invoice', label: '◉ Send Invoice' },
      { id: 'compliance', label: 'Get SOC compliant', icon: '＋' },
      { id: 'documentation', label: 'Finish documentation', icon: '↓' },
      { id: 'hackathon', label: 'Host hackathon', icon: '＋' },
      { id: 'publicist', label: 'Hire publicist', icon: '↓' },
    ],
  },
} satisfies Meta<typeof CompactTable>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ListV1: Story = {};
export const ListV2: Story = { args: { caption: 'List v2' } };
