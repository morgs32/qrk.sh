import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { Dropdown } from '@zerospin/fragment-ui/Dropdown';
import { fn } from 'storybook/test';

const meta = {
  title: 'Components/Dropdown',
  component: Dropdown,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div
        style={{
          width: 90,
          maxWidth: '100%',
          padding: '24px 0 160px',
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        <Story />
      </div>
    ),
  ],
  args: {
    label: 'Add+',
    items: [
      { id: 'claude', label: 'Claude', onClick: fn() },
      { id: 'cursor', label: 'Cursor', onClick: fn() },
      { id: 'opencode', label: 'OpenCode', onClick: fn() },
      { id: 'url', label: 'URL', onClick: fn() },
    ],
  },
} satisfies Meta<typeof Dropdown>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Open: Story = { args: { defaultOpen: true } };

export const Closed: Story = {};

export const Disabled: Story = { args: { disabled: true } };

export const DisabledItem: Story = {
  args: {
    defaultOpen: true,
    items: meta.args.items.map(item => ({
      ...item,
      disabled: item.id === 'cursor',
    })),
  },
};

export const Interactive: Story = {
  render: function InteractiveDropdown(args) {
    const [action, setAction] = useState({ label: 'None', count: 0 });

    return (
      <div
        style={{
          width: 240,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
        }}
      >
        <Dropdown
          {...args}
          items={args.items.map(item => ({
            ...item,
            onClick: () => {
              item.onClick();
              setAction(previous => ({
                label: item.label,
                count: previous.count + 1,
              }));
            },
          }))}
        />
        <output
          aria-live="polite"
          style={{ marginTop: 24, fontFamily: 'monospace', fontSize: 12 }}
        >
          Last action: {action.label}. Invocations: {action.count}.
        </output>
      </div>
    );
  },
};

export const Controlled: Story = {
  render: function ControlledDropdown(args) {
    const [open, setOpen] = useState(false);

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
        }}
      >
        <Dropdown {...args} open={open} onOpenChange={setOpen} />
        <output
          aria-live="polite"
          style={{ marginTop: 24, fontFamily: 'monospace', fontSize: 12 }}
        >
          Menu: {open ? 'open' : 'closed'}
        </output>
      </div>
    );
  },
};
