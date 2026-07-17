import { exports as workerExports } from 'cloudflare:workers';

globalThis.fetch = (input, init) =>
  workerExports.default.fetch(new Request(input, init));
