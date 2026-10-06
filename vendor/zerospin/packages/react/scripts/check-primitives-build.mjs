import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'vite';

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const nativePackagePath = require.resolve('@typescript/native/package.json');
const nativePackage = JSON.parse(readFileSync(nativePackagePath, 'utf8'));
const compilerPath = join(dirname(nativePackagePath), nativePackage.bin.tsc);
const temporaryDirectory = realpathSync(
  mkdtempSync(join(tmpdir(), 'zerospin-primitives-')),
);
const styleCall = /\bstylex\.(?:create|defineVars|defineConsts)\s*\(/;
let watcher;
let watcherOutput = '';

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fileName = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(fileName) : [fileName];
  });
}

async function waitUntil(predicate, description) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    if (watcher?.exitCode !== null && watcher?.exitCode !== undefined) {
      throw new Error(`Watch exited while ${description}:\n${watcherOutput}`);
    }
    await new Promise(fulfill => setTimeout(fulfill, 50));
  }
  throw new Error(`Timed out ${description}:\n${watcherOutput}`);
}

function startBuild(directory, watching = false) {
  const child = spawn(
    process.execPath,
    [join(directory, 'scripts/build.mjs'), ...(watching ? ['--watch'] : [])],
    {
      cwd: directory,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  return child;
}

async function stopWatcher() {
  if (
    watcher === undefined ||
    watcher.exitCode !== null ||
    watcher.signalCode !== null
  )
    return;
  const closed = new Promise(fulfill => watcher.once('exit', fulfill));
  watcher.kill('SIGTERM');
  await closed;
}

async function runCompiler(args) {
  const child = spawn(process.execPath, [compilerPath, ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', contents => {
    output += contents;
  });
  child.stderr.on('data', contents => {
    output += contents;
  });
  const exitCode = await new Promise((fulfill, reject) => {
    child.once('error', reject);
    child.once('exit', fulfill);
  });
  assert.equal(exitCode, 0, `The consumer compiler failed:\n${output}`);
}

try {
  if (!process.argv.includes('--compiler-only')) {
    const publishedFiles = [
      join(packageDirectory, 'dist/primitives.js'),
      ...listFiles(join(packageDirectory, 'dist/primitives')),
    ];
    for (const fileName of publishedFiles) {
      if (fileName.endsWith('.js')) {
        const contents = readFileSync(fileName, 'utf8');
        assert(
          !styleCall.test(contents),
          `${fileName} contains uncompiled StyleX`,
        );
        assert(
          !contents.includes('@stylexjs/stylex/lib/stylex-inject'),
          `${fileName} injects CSS at runtime`,
        );
      }
      if (fileName.endsWith('.js.map')) {
        const sourceMap = JSON.parse(readFileSync(fileName, 'utf8'));
        assert(
          sourceMap.sources.length > 0,
          `${fileName} lost its original sources`,
        );
        assert(
          sourceMap.sources.every(source => /\.tsx?$/.test(source)),
          `${fileName} maps to emitted JavaScript`,
        );
      }
    }
    assert(
      readFileSync(join(packageDirectory, 'dist/primitives.css'), 'utf8').trim()
        .length > 0,
    );
    assert(existsSync(join(packageDirectory, 'dist/primitives.d.ts')));

    // Exercise the public package exports using Vite's default configuration.
    const consumerDirectory = join(temporaryDirectory, 'consumer');
    mkdirSync(join(consumerDirectory, 'node_modules/@zerospin'), {
      recursive: true,
    });
    symlinkSync(
      packageDirectory,
      join(consumerDirectory, 'node_modules/@zerospin/react'),
      'dir',
    );
    symlinkSync(
      join(packageDirectory, 'node_modules/@zerospin/shapes'),
      join(consumerDirectory, 'node_modules/@zerospin/shapes'),
      'dir',
    );
    for (const dependency of ['effect', 'react', 'vite', '@types']) {
      symlinkSync(
        join(packageDirectory, 'node_modules', dependency),
        join(consumerDirectory, 'node_modules', dependency),
        'dir',
      );
    }
    writeFileSync(
      join(consumerDirectory, 'index.html'),
      '<script type="module" src="/main.tsx"></script>',
    );
    writeFileSync(
      join(consumerDirectory, 'main.tsx'),
      [
        "import { ShapeForm, primitiveInputsMap, type IShapeFormProps } from '@zerospin/react/primitives';",
        "import '@zerospin/react/primitives.css';",
        "import { primitives, type InferDecodedRow } from '@zerospin/shapes';",
        "import { Schema } from 'effect';",
        "const shape = { date: primitives.date(), data: primitives.json({ schema: Schema.Struct({ count: Schema.Number }) }), state: primitives.enum({ values: ['open', 'closed'] }) };",
        "const defaults: InferDecodedRow<typeof shape> = { date: new Date('2026-10-03T12:30:40.123Z'), data: { count: 1 }, state: 'open' };",
        'const form = <ShapeForm shape={shape} defaultValues={defaults} onSubmit={value => {',
        '  const decoded: InferDecodedRow<typeof shape> = value;',
        '  const date: Date = value.date;',
        '  const count: number = value.data.count;',
        "  const state: 'open' | 'closed' = value.state;",
        '  // @ts-expect-error Submitted dates are decoded Dates, not strings.',
        '  const encodedDate: string = value.date;',
        '  void [decoded, date, count, state, encodedDate];',
        '}} />;',
        'const wrongDefaults: IShapeFormProps<typeof shape> = { shape, defaultValues: { ...defaults,',
        '  // @ts-expect-error JSON defaults must be decoded objects.',
        '  data: \'{"count":1}\',',
        '}, onSubmit: () => {} };',
        'Object.assign(globalThis, { form, primitiveInputsMap, wrongDefaults });',
      ].join('\n'),
    );
    writeFileSync(
      join(consumerDirectory, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          jsx: 'react-jsx',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          strict: true,
          skipLibCheck: true,
          target: 'ES2022',
          noEmit: true,
          types: ['react', 'vite/client'],
        },
        include: ['main.tsx'],
      }),
    );
    await runCompiler([
      '-p',
      join(consumerDirectory, 'tsconfig.json'),
      '--noEmit',
      '--pretty',
      'false',
    ]);
    await build({
      root: consumerDirectory,
      configFile: false,
      logLevel: 'error',
      build: { outDir: 'dist', emptyOutDir: true, minify: false },
    });
    const assets = listFiles(join(consumerDirectory, 'dist'));
    const cssAssets = assets.filter(fileName => fileName.endsWith('.css'));
    assert(cssAssets.length > 0, 'Vite removed the public stylesheet');
    assert(
      cssAssets.some(fileName =>
        readFileSync(fileName, 'utf8').includes('--background'),
      ),
      'The bundled stylesheet lost its theme fallbacks',
    );
  }

  // Isolate the compiler/watch checks from application and repository changes.
  const fixtureDirectory = join(temporaryDirectory, 'compiler');
  mkdirSync(join(fixtureDirectory, 'scripts'), { recursive: true });
  mkdirSync(join(fixtureDirectory, 'src/primitives'), { recursive: true });
  cpSync(
    join(packageDirectory, 'scripts/build.mjs'),
    join(fixtureDirectory, 'scripts/build.mjs'),
  );
  const fixtureModules = join(fixtureDirectory, 'node_modules');
  mkdirSync(fixtureModules);
  for (const entry of readdirSync(join(packageDirectory, 'node_modules'))) {
    symlinkSync(
      join(packageDirectory, 'node_modules', entry),
      join(fixtureModules, entry),
      'dir',
    );
  }
  if (!existsSync(join(fixtureModules, 'typescript'))) {
    symlinkSync(
      dirname(require.resolve('typescript/package.json')),
      join(fixtureModules, 'typescript'),
      'dir',
    );
  }
  mkdirSync(join(fixtureModules, '@typescript'), { recursive: true });
  symlinkSync(
    dirname(require.resolve('@typescript/native/package.json')),
    join(fixtureModules, '@typescript/native'),
    'dir',
  );
  writeFileSync(
    join(fixtureDirectory, 'package.json'),
    JSON.stringify({ type: 'module' }),
  );
  writeFileSync(
    join(fixtureDirectory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        composite: true,
        declaration: true,
        declarationMap: true,
        module: 'ESNext',
        moduleResolution: 'Bundler',
        outDir: 'dist',
        rootDir: 'src',
        skipLibCheck: true,
        sourceMap: true,
        strict: true,
        target: 'ES2022',
        types: ['node'],
      },
      include: ['src/**/*.ts'],
      watchOptions: {
        watchFile: 'fixedPollingInterval',
        watchDirectory: 'fixedPollingInterval',
      },
    }),
  );
  const entryPath = join(fixtureDirectory, 'src/primitives.ts');
  const preservedPath = join(fixtureDirectory, 'src/primitives/preserved.ts');
  const editedPath = join(fixtureDirectory, 'src/primitives/edited.ts');
  const stylesheetPath = join(fixtureDirectory, 'dist/primitives.css');
  const styles = color =>
    [
      "import * as stylex from '@stylexjs/stylex';",
      `export const styles = stylex.create({ marker: { color: '${color}' } });`,
    ].join('\n');
  const stylesheet = () =>
    existsSync(stylesheetPath) ? readFileSync(stylesheetPath, 'utf8') : '';
  writeFileSync(
    entryPath,
    "export { styles as preserved } from './primitives/preserved.js';\nexport { styles as edited } from './primitives/edited.js';\n",
  );
  writeFileSync(preservedPath, styles('#135724'));
  writeFileSync(editedPath, styles('#246813'));
  watcher = startBuild(fixtureDirectory, true);
  watcher.stdout.on('data', contents => {
    watcherOutput += contents;
  });
  watcher.stderr.on('data', contents => {
    watcherOutput += contents;
  });
  await waitUntil(
    () => stylesheet().includes('#135724') && stylesheet().includes('#246813'),
    'waiting for initial watch extraction',
  );
  // Native tsc finishes registering its initial file watchers after its first
  // completion message; begin edits after that startup work has settled.
  await new Promise(fulfill => setTimeout(fulfill, 1_500));

  writeFileSync(editedPath, styles('#abcdef'));
  await waitUntil(
    () => stylesheet().includes('#abcdef') && !stylesheet().includes('#246813'),
    'waiting for incremental extraction',
  );
  assert(
    stylesheet().includes('#135724'),
    'Incremental compilation dropped unchanged styles',
  );
  assert(
    !styleCall.test(
      readFileSync(join(fixtureDirectory, 'dist/primitives/edited.js'), 'utf8'),
    ),
  );
  assert(existsSync(join(fixtureDirectory, 'dist/primitives/edited.d.ts')));

  writeFileSync(
    entryPath,
    "export { styles as preserved } from './primitives/preserved.js';\n",
  );
  rmSync(editedPath);
  await waitUntil(
    () =>
      !stylesheet().includes('#abcdef') &&
      !existsSync(join(fixtureDirectory, 'dist/primitives/edited.js')),
    'waiting for removed-module cleanup',
  );
  assert(!existsSync(join(fixtureDirectory, 'dist/primitives/edited.d.ts')));
  const lastGoodCss = stylesheet();
  const lastGoodJs = readFileSync(
    join(fixtureDirectory, 'dist/primitives/preserved.js'),
    'utf8',
  );
  const previousOutputLength = watcherOutput.length;
  const invalidStyles =
    "import * as stylex from '@stylexjs/stylex';\nconst color = () => Math.random() > 0.5 ? '#999999' : '#999998';\nexport const styles = stylex.create({ marker: { color: color() } });\n";
  writeFileSync(preservedPath, invalidStyles);
  await waitUntil(
    () => /Error:/.test(watcherOutput.slice(previousOutputLength)),
    'waiting for a StyleX compilation error',
  );
  assert.equal(
    stylesheet(),
    lastGoodCss,
    'A failed watch transform replaced valid CSS',
  );
  assert.equal(
    readFileSync(
      join(fixtureDirectory, 'dist/primitives/preserved.js'),
      'utf8',
    ),
    lastGoodJs,
    'A failed watch transform published raw JavaScript',
  );

  writeFileSync(preservedPath, styles('#102030'));
  await waitUntil(
    () => stylesheet().includes('#102030') && !stylesheet().includes('#135724'),
    'waiting for watch recovery',
  );
  await stopWatcher();

  const referencedConsumer = join(temporaryDirectory, 'referenced-consumer');
  mkdirSync(join(referencedConsumer, 'src'), { recursive: true });
  writeFileSync(
    join(referencedConsumer, 'src/index.ts'),
    "export { preserved } from '../../compiler/dist/primitives.js';\n",
  );
  writeFileSync(
    join(referencedConsumer, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        composite: true,
        module: 'ESNext',
        moduleResolution: 'Bundler',
        outDir: 'dist',
        rootDir: 'src',
        skipLibCheck: true,
        target: 'ES2022',
        types: [],
      },
      include: ['src/**/*.ts'],
      references: [{ path: fixtureDirectory }],
    }),
  );
  const compiledModulePath = join(
    fixtureDirectory,
    'dist/primitives/preserved.js',
  );
  const compiledModule = readFileSync(compiledModulePath, 'utf8');
  await runCompiler([
    '-b',
    join(referencedConsumer, 'tsconfig.json'),
    '--pretty',
    'false',
  ]);
  assert.equal(
    readFileSync(compiledModulePath, 'utf8'),
    compiledModule,
    'A downstream project reference rebuilt raw StyleX over the compiled package',
  );

  writeFileSync(preservedPath, invalidStyles);
  const failingBuild = startBuild(fixtureDirectory);
  let failingOutput = '';
  failingBuild.stdout.on('data', contents => {
    failingOutput += contents;
  });
  failingBuild.stderr.on('data', contents => {
    failingOutput += contents;
  });
  const exitCode = await new Promise((fulfill, reject) => {
    failingBuild.once('error', reject);
    failingBuild.once('exit', fulfill);
  });
  assert.notEqual(
    exitCode,
    0,
    `A failing StyleX build exited successfully:\n${failingOutput}`,
  );
  assert(
    !existsSync(join(fixtureDirectory, 'dist/primitives/preserved.js')),
    'A failing build published raw StyleX',
  );
  process.stdout.write(
    `Verified ${process.argv.includes('--compiler-only') ? '' : 'typed plain Vite exports/CSS and '}ordered StyleX watch extraction, removal, failure, recovery, and downstream project references.\n`,
  );
} finally {
  await stopWatcher();
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
