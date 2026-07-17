import { readFile, rm } from 'node:fs/promises';

import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import { Effect, Layer } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';

import { writeLocalSystemWorkerFn } from './writeLocalSystemWorkerFn.js';

const layer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);
const outputDirectory = `${process.cwd()}/dist`;
const outputPath = `${outputDirectory}/index.js`;
const customOutputPath = `${process.cwd()}/system-worker.js`;

describe('writeLocalSystemWorkerFn', () => {
  afterEach(async () => {
    await rm(outputDirectory, { force: true, recursive: true });
    await rm(customOutputPath, { force: true });
  });

  it('creates dist/index.js and overwrites existing contents', async () => {
    const firstBundle = 'export const first = true;';
    const secondBundle = 'export const second = true;';

    const firstResult = await Effect.runPromise(
      writeLocalSystemWorkerFn({
        compiledSystemWorker: firstBundle,
        outputPath,
      }).pipe(Effect.provide(layer)),
    );
    const secondResult = await Effect.runPromise(
      writeLocalSystemWorkerFn({
        compiledSystemWorker: secondBundle,
        outputPath,
      }).pipe(Effect.provide(layer)),
    );

    expect(firstResult.outputPath).toBe(outputPath);
    expect(secondResult.outputPath).toBe(outputPath);
    expect(secondResult.compiledLength).toBe(secondBundle.length);

    const fileContents = await readFile(outputPath, 'utf8');
    expect(fileContents).toBe(secondBundle);
  });

  it('writes to a custom relative output path', async () => {
    const bundle = 'export const custom = true;';

    const result = await Effect.runPromise(
      writeLocalSystemWorkerFn({
        compiledSystemWorker: bundle,
        outputPath: './system-worker.js',
      }).pipe(Effect.provide(layer)),
    );

    expect(result.outputPath).toBe(customOutputPath);
    expect(result.compiledLength).toBe(bundle.length);

    const fileContents = await readFile(customOutputPath, 'utf8');
    expect(fileContents).toBe(bundle);
  });
});
