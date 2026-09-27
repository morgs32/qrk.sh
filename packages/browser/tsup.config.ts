import { defineConfig } from 'tsup';
export default defineConfig({
  entry: { nodeWorker: 'src/SharedWorker.ts' },
  format: ['esm'],
  platform: 'browser',
  target: 'es2022',
  outDir: 'dist',
  outExtension: () => ({ js: '.bundle.js' }),
  clean: false,
  dts: false,
  splitting: false,
  noExternal: [/.*/],
});
