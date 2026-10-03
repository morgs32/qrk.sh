import type { ISystemConfig } from '@zerospin/core/system/types';

/** The application config module is supplied by the worker bundler. */
declare const config: ISystemConfig;
// oxlint-disable-next-line import/no-default-export -- Matches the injected runtime config module.
export default config;
