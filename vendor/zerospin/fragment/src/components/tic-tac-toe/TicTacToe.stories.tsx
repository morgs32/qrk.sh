import type { Meta, StoryObj } from '@storybook/tanstack-react';

import TicTacToe from './TicTacToe';

const meta = {
  title: 'Components/Tic Tac Toe',
  component: TicTacToe,
  parameters: { layout: 'centered' },
  decorators: [(Story) => <div style={{ width: 210, maxWidth: '100%' }}><Story /></div>],
} satisfies Meta<typeof TicTacToe>;

export default meta;
type IStory = StoryObj<typeof meta>;

export const Default: IStory = {};
