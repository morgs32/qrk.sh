import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { transformSync } from '@babel/core';
import stylexPlugin from '@stylexjs/babel-plugin';
import ts from 'typescript';

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = join(packageDirectory, 'tsconfig.json');
const outputDirectory = join(packageDirectory, 'dist');
const primitivesOutputDirectory = join(outputDirectory, 'primitives');
const watching = process.argv.includes('--watch');
const require = createRequire(import.meta.url);
const nativePackagePath = require.resolve('@typescript/native/package.json');
const nativePackage = JSON.parse(readFileSync(nativePackagePath, 'utf8'));
const compilerPath = join(dirname(nativePackagePath), nativePackage.bin.tsc);
const canonicalPath = fileName =>
  ts.sys.useCaseSensitiveFileNames
    ? resolve(fileName)
    : resolve(fileName).toLowerCase();

function listFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const entryPath = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}

function writeAtomically(fileName, contents) {
  mkdirSync(dirname(fileName), { recursive: true });
  const temporaryPath = `${fileName}.${process.pid}.tmp`;
  try {
    writeFileSync(temporaryPath, contents);
    renameSync(temporaryPath, fileName);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

function remapSourceMap(contents, stagedPath, publishedPath) {
  const sourceMap = JSON.parse(contents);
  const sourceRoot = sourceMap.sourceRoot ?? '';
  sourceMap.sources = sourceMap.sources.map(source =>
    relative(
      dirname(publishedPath),
      resolve(dirname(stagedPath), sourceRoot, source),
    )
      .split(sep)
      .join('/'),
  );
  delete sourceMap.sourceRoot;
  sourceMap.file = basename(publishedPath).slice(0, -'.map'.length);
  return sourceMap;
}

const parsedConfig = ts.getParsedCommandLineOfConfigFile(
  configPath,
  {},
  {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: diagnostic => {
      throw new Error(
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      );
    },
  },
);
if (parsedConfig === undefined || parsedConfig.errors.length > 0) {
  throw new Error(
    parsedConfig?.errors
      .map(diagnostic =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      )
      .join('\n') ?? 'Could not read React tsconfig.json',
  );
}

// TypeScript's JavaScript API is version 6 in this workspace, while its tsc CLI
// is native version 7. Use the actual CLI for checking, declarations, and watch.
// This API only parses configuration; it never builds referenced projects.
const sourceDirectory = parsedConfig.options.rootDir;
const buildInfoPath = ts.getTsBuildInfoEmitOutputFilePath(parsedConfig.options);
const stageDirectory = mkdtempSync(join(tmpdir(), 'zerospin-react-stylex-'));
const stagedOutputDirectory = join(stageDirectory, 'dist');
const stagedBuildInfoPath = join(stageDirectory, 'tsconfig.tsbuildinfo');
const stagedConfigPath = join(stageDirectory, 'tsconfig.json');
const packageJson = JSON.parse(
  readFileSync(join(packageDirectory, 'package.json'), 'utf8'),
);
writeFileSync(
  join(stageDirectory, 'package.json'),
  JSON.stringify({ name: packageJson.name, type: 'module' }),
);
symlinkSync(
  join(packageDirectory, 'node_modules'),
  join(stageDirectory, 'node_modules'),
  'dir',
);
writeFileSync(
  stagedConfigPath,
  JSON.stringify({
    extends: configPath,
    compilerOptions: {
      outDir: stagedOutputDirectory,
      rootDir: sourceDirectory,
      tsBuildInfoFile: stagedBuildInfoPath,
    },
    references:
      parsedConfig.projectReferences?.map(reference => ({
        path: reference.path,
      })) ?? [],
  }),
);

function compileAndPublish() {
  // Buildinfo describes the successful compiler generation. Using its source
  // list also excludes stale outputs that tsc leaves after source-file deletion.
  const buildInfo = JSON.parse(readFileSync(stagedBuildInfoPath, 'utf8'));
  const currentConfig = ts.getParsedCommandLineOfConfigFile(
    configPath,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: diagnostic => {
        throw new Error(
          ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        );
      },
    },
  );
  const sourcePaths = new Map(
    currentConfig.fileNames.map(fileName => [
      canonicalPath(fileName),
      fileName,
    ]),
  );
  const currentArtifacts = new Set();
  for (const fileName of buildInfo.fileNames) {
    const absolutePath = sourcePaths.get(
      canonicalPath(resolve(dirname(stagedBuildInfoPath), fileName)),
    );
    if (absolutePath === undefined || /\.d\.[cm]?ts$/.test(absolutePath))
      continue;
    const sourcePath = relative(sourceDirectory, absolutePath);
    const javascriptExtension = sourcePath.endsWith('.mts')
      ? '.mjs'
      : sourcePath.endsWith('.cts')
        ? '.cjs'
        : '.js';
    const declarationExtension = sourcePath.endsWith('.mts')
      ? '.d.mts'
      : sourcePath.endsWith('.cts')
        ? '.d.cts'
        : '.d.ts';
    const sourceBase = sourcePath.replace(/\.[cm]?tsx?$/, '');
    for (const extension of [
      javascriptExtension,
      `${javascriptExtension}.map`,
      declarationExtension,
      `${declarationExtension}.map`,
    ]) {
      currentArtifacts.add(
        join(stagedOutputDirectory, `${sourceBase}${extension}`),
      );
    }
  }

  // Snapshot all raw output first. Babel resolves .stylex imports in the staged
  // package, whose name and dist-relative paths produce stable published hashes.
  const emitted = new Map();
  for (const fileName of listFiles(stagedOutputDirectory).sort()) {
    if (!currentArtifacts.has(fileName)) continue;
    const publishedPath = join(
      outputDirectory,
      relative(stagedOutputDirectory, fileName),
    );
    const contents = readFileSync(fileName, 'utf8');
    emitted.set(
      publishedPath,
      fileName.endsWith('.map')
        ? JSON.stringify(remapSourceMap(contents, fileName, publishedPath))
        : contents,
    );
  }

  const rules = [];
  const compiled = new Map(emitted);
  for (const [fileName, contents] of emitted) {
    if (
      !fileName.endsWith('.js') ||
      !(
        fileName === join(outputDirectory, 'primitives.js') ||
        fileName.startsWith(`${primitivesOutputDirectory}${sep}`)
      )
    )
      continue;
    const inputMap = emitted.get(`${fileName}.map`);
    const result = transformSync(contents, {
      babelrc: false,
      configFile: false,
      filename: join(
        stagedOutputDirectory,
        relative(outputDirectory, fileName),
      ),
      inputSourceMap: inputMap === undefined ? false : JSON.parse(inputMap),
      sourceMaps: inputMap !== undefined,
      plugins: [
        [
          stylexPlugin,
          {
            dev: false,
            runtimeInjection: false,
            styleResolution: 'property-specificity',
            unstable_moduleResolution: {
              type: 'commonJS',
              rootDir: stagedOutputDirectory,
            },
          },
        ],
      ],
    });
    if (result?.code === undefined || result.code === null)
      throw new Error(`StyleX did not emit ${fileName}`);
    rules.push(...(result.metadata.stylex ?? []));
    const mapComment =
      inputMap === undefined
        ? ''
        : `\n//# sourceMappingURL=${basename(fileName)}.map`;
    compiled.set(
      fileName,
      `${result.code.replace(/\n?\/\/# sourceMappingURL=.*$/m, '')}${mapComment}\n`,
    );
    if (inputMap !== undefined) {
      if (result.map === undefined || result.map === null)
        throw new Error(
          `StyleX did not preserve the source map for ${fileName}`,
        );
      result.map.file = basename(fileName);
      compiled.set(`${fileName}.map`, JSON.stringify(result.map));
    }
  }
  compiled.set(
    join(outputDirectory, 'primitives.css'),
    `${stylexPlugin.processStylexRules(rules, { useLayers: false })}\n`,
  );
  const licensePath = join(
    sourceDirectory,
    'primitives',
    'LICENSE.shadcn-cssinjs',
  );
  if (existsSync(licensePath)) {
    compiled.set(
      join(primitivesOutputDirectory, 'LICENSE.shadcn-cssinjs'),
      readFileSync(licensePath, 'utf8'),
    );
  }

  // The compiler has one watcher. Each successful cycle synchronously transforms
  // the complete stylesheet before publishing any JavaScript or declarations.
  for (const [fileName, contents] of compiled)
    writeAtomically(fileName, contents);
  for (const fileName of listFiles(outputDirectory)) {
    if (!compiled.has(fileName)) rmSync(fileName);
  }
  if (buildInfoPath !== undefined) {
    // Downstream tsc -b commands must consider React current; otherwise they
    // would rebuild it directly and overwrite the compiled StyleX modules.
    const buildInfoDirectory = dirname(buildInfoPath);
    const remapBuildPath = fileName => {
      let absolutePath = canonicalPath(resolve(stageDirectory, fileName));
      const canonicalStage = canonicalPath(stageDirectory);
      if (absolutePath.startsWith(`${canonicalStage}${sep}`)) {
        absolutePath = join(
          canonicalPath(packageDirectory),
          relative(canonicalStage, absolutePath),
        );
      }
      const relativePath = relative(
        canonicalPath(buildInfoDirectory),
        absolutePath,
      )
        .split(sep)
        .join('/');
      return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
    };
    buildInfo.fileNames = buildInfo.fileNames.map(fileName =>
      /^lib\..*\.d\.ts$/.test(fileName) ? fileName : remapBuildPath(fileName),
    );
    for (const key of ['packageJsons', 'missingPackageJsons']) {
      if (buildInfo[key] !== undefined)
        buildInfo[key] = [...new Set(buildInfo[key].map(remapBuildPath))];
    }
    if (buildInfo.latestChangedDtsFile !== undefined)
      buildInfo.latestChangedDtsFile = remapBuildPath(
        buildInfo.latestChangedDtsFile,
      );
    buildInfo.options.outDir = `./${relative(buildInfoDirectory, outputDirectory).split(sep).join('/')}`;
    buildInfo.options.rootDir = `./${relative(buildInfoDirectory, sourceDirectory).split(sep).join('/')}`;
    if (parsedConfig.options.tsBuildInfoFile === undefined)
      delete buildInfo.options.tsBuildInfoFile;
    else
      buildInfo.options.tsBuildInfoFile = `./${relative(buildInfoDirectory, buildInfoPath).split(sep).join('/')}`;
    writeAtomically(buildInfoPath, JSON.stringify(buildInfo));
  }
  process.stdout.write('Compiled React primitives and primitives.css.\n');
}

rmSync(outputDirectory, { recursive: true, force: true });
if (buildInfoPath !== undefined) rmSync(buildInfoPath, { force: true });

let stopping = false;
let stdoutBuffer = '';
const compiler = spawn(
  process.execPath,
  [
    compilerPath,
    '-b',
    stagedConfigPath,
    '--pretty',
    'false',
    ...(watching ? ['--watch', '--preserveWatchOutput'] : []),
  ],
  { cwd: packageDirectory, stdio: ['ignore', 'pipe', 'pipe'] },
);
compiler.stdout.setEncoding('utf8');
compiler.stderr.setEncoding('utf8');

function publishOrReportFailure() {
  try {
    compileAndPublish();
    process.exitCode = 0;
  } catch (error) {
    process.exitCode = 1;
    process.stderr.write(
      `${error instanceof Error ? error.stack : String(error)}\n`,
    );
  }
}

compiler.stdout.on('data', contents => {
  process.stdout.write(contents);
  if (!watching) return;
  stdoutBuffer += contents;
  let lineEnd;
  while ((lineEnd = stdoutBuffer.indexOf('\n')) !== -1) {
    const line = stdoutBuffer.slice(0, lineEnd);
    stdoutBuffer = stdoutBuffer.slice(lineEnd + 1);
    const completed = /Found (\d+) errors?\. Watching for file changes\./.exec(
      line,
    );
    if (completed === null) continue;
    if (completed[1] === '0') publishOrReportFailure();
    else process.exitCode = 1;
  }
});
compiler.stderr.on('data', contents => process.stderr.write(contents));
compiler.once('error', error => {
  process.exitCode = 1;
  process.stderr.write(`${error.stack}\n`);
});
compiler.once('close', exitCode => {
  if (!stopping) {
    if (exitCode !== 0) process.exitCode = exitCode ?? 1;
    else if (!watching) publishOrReportFailure();
  }
  rmSync(stageDirectory, { recursive: true, force: true });
});
function stopCompiler(signal) {
  stopping = true;
  compiler.kill(signal);
}
process.once('SIGINT', () => stopCompiler('SIGINT'));
process.once('SIGTERM', () => stopCompiler('SIGTERM'));
