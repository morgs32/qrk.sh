import path from 'node:path';

import { config } from 'dotenv';

config({ path: path.resolve(process.cwd(), '.env') });
config({
  path: path.resolve(process.cwd(), '.env.local'),
  override: true,
});

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
