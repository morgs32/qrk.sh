import type { Plugin } from '@vitest/pretty-format';

import type { ICommand } from '../types.ts';

export const commandSerializer: Plugin = {
  serialize(val: ICommand) {
    return `[Command ${val.id}: ${val.commandName}]`;
  },
  test(val) {
    return (
      Boolean(val) &&
      typeof val === 'object' &&
      'id' in val &&
      'commandName' in val
    );
  },
};
