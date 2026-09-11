import * as sdk from '@zerospin/sdk';

import { system } from './src/zerospin/system';

export default sdk.makeSystemConfig(system, {
  systemId: 'sys_shopping_20260907_pinned_replicas',
});
