import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    sharedWorker: 'src/sharedWorker.entry.ts',
  },
  format: ['esm'],
  platform: 'browser',
  target: 'es2022',
  outDir: 'dist',
  outExtension: () => ({ js: '.bundle.js' }),
  clean: false,
  dts: false,
  splitting: false,
  treeshake: true,
  noExternal: [/.*/],
});
