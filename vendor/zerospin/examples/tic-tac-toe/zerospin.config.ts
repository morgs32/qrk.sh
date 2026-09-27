import { makeSystemConfig } from '@zerospin/core/system/make/makeSystemConfig';

import { system } from './src/system';
export default makeSystemConfig(system, { systemId: 'sys_tictactoe' });
