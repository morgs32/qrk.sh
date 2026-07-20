import { makeSystem } from './makeSystem.ts';

const versionedSystem = makeSystem({
  accountControllers: {},
  name: 'test',
  version: '1.2.3',
});

const systemVersion: '1.2.3' = versionedSystem.version;
void systemVersion;

// @ts-expect-error — version is required at the factory call site
makeSystem({
  accountControllers: {},
  name: 'test',
});
