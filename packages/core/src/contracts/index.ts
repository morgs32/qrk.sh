import { makeCommand } from './Command.ts';
import { makeVersion, upgradeVersion } from './makeVersion.ts';

export type { Command } from './Command.ts';

export const contracts = { makeCommand, makeVersion, upgradeVersion };
