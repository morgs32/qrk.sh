import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { CharacterStatusIndicator } from './CharacterStatusIndicator';

const meta = {
  title: 'Components/Character Status Indicator',
  component: CharacterStatusIndicator,
  parameters: {
    layout: 'centered',
  },
  args: { className: '' },
  argTypes: {
    className: {
      options: ['', 'is-complete'],
      control: {
        type: 'inline-radio',
        labels: { '': 'Default', 'is-complete': 'Complete' },
      },
    },
  },
} satisfies Meta<typeof CharacterStatusIndicator>;

export default meta;
type IStory = StoryObj<typeof meta>;

export const Default: IStory = {};
