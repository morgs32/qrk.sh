import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const bricks = fileURLToPath(new URL("../", import.meta.url)).replace(/[\\/]$/, "");
const workspace = resolve(bricks, "../..");
const exports = JSON.parse(readFileSync(join(bricks, "package.json"), "utf8")).exports;
const packageName = "@qrk.sh/bricks";
const bricksWorker = join(bricks, "worker");
const apiEntrypoint = join(workspace, "apps/api/Worker.ts");
const sourceExtensions = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
const excludes = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/.wrangler/**",
  "**/storybook-static/**",
  "**/vendor/**",
];
const projects = ["apps", "packages"].flatMap((folder) =>
  readdirSync(join(workspace, folder), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(workspace, folder, entry.name))
    .filter((directory) => existsSync(join(directory, "package.json"))),
);
const hosts = projects.filter(
  (directory) => directory !== bricks && inside(directory, join(workspace, "apps")),
);
const hostNames = hosts
  .map((directory) => JSON.parse(readFileSync(join(directory, "package.json"), "utf8")).name)
  .filter(Boolean);
const packageEdges = new Map();
const errors = [];

function inside(file, directory) {
  const path = relative(directory, file);
  return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(".." + sep));
}

function moduleReferences(file) {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest);
  const references = [];
  function visit(node) {
    let specifier;
    let typeOnly = false;
    if (ts.isImportDeclaration(node)) {
      specifier = node.moduleSpecifier;
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      typeOnly =
        clause?.isTypeOnly ||
        (!clause?.name &&
          bindings &&
          ts.isNamedImports(bindings) &&
          bindings.elements.length > 0 &&
          bindings.elements.every((element) => element.isTypeOnly));
    } else if (ts.isExportDeclaration(node)) {
      specifier = node.moduleSpecifier;
      const bindings = node.exportClause;
      typeOnly =
        node.isTypeOnly ||
        (bindings &&
          ts.isNamedExports(bindings) &&
          bindings.elements.length > 0 &&
          bindings.elements.every((element) => element.isTypeOnly));
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      specifier = node.moduleReference.expression;
      typeOnly = node.isTypeOnly;
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      specifier = node.argument.literal;
      typeOnly = true;
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      specifier = node.arguments[0];
    }
    if (specifier && ts.isStringLiteralLike(specifier)) {
      const { line } = source.getLineAndCharacterOfPosition(specifier.getStart(source));
      references.push({ specifier: specifier.text, typeOnly, line: line + 1 });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return references;
}

function compilerOptions(directory) {
  const config = join(directory, "tsconfig.json");
  if (!existsSync(config)) return { moduleResolution: ts.ModuleResolutionKind.Bundler };
  const { config: json, error } = ts.readConfigFile(config, ts.sys.readFile);
  if (error) throw new Error(ts.flattenDiagnosticMessageText(error.messageText, "\n"));
  return {
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    ...ts.parseJsonConfigFileContent(json, ts.sys, directory, undefined, config).options,
  };
}

for (const project of projects) {
  const options = compilerOptions(project);
  const cache = ts.createModuleResolutionCache(
    project,
    ts.sys.useCaseSensitiveFileNames ? (file) => file : (file) => file.toLowerCase(),
    options,
  );
  for (const file of ts.sys.readDirectory(project, sourceExtensions, excludes)) {
    const ownedByBricks = inside(file, bricks);
    const edges = [];
    for (const reference of moduleReferences(file)) {
      const { specifier, line, typeOnly } = reference;
      const publicImport = specifier === packageName || specifier.startsWith(packageName + "/");
      const resolved = ts.resolveModuleName(specifier, file, options, ts.sys, cache).resolvedModule;
      const resolvedFile = resolved?.resolvedFileName;
      const target =
        resolvedFile && existsSync(resolvedFile) ? realpathSync(resolvedFile) : resolvedFile;
      const path =
        specifier.startsWith(".") || isAbsolute(specifier)
          ? resolve(dirname(file), specifier.split(/[?#]/, 1)[0])
          : undefined;
      const location = `${relative(workspace, file)}:${line}`;
      if (publicImport) {
        const key = specifier === packageName ? "." : "." + specifier.slice(packageName.length);
        const entry = exports[key];
        if (!Object.hasOwn(exports, key)) {
          errors.push(`${location} uses undeclared Bricks export ${specifier}`);
        } else if (typeof entry === "object" && Object.hasOwn(entry, "workerd")) {
          if (file !== apiEntrypoint) {
            errors.push(
              `${location} imports Worker-only Bricks export ${specifier} outside API's Worker entrypoint`,
            );
          } else if (target !== resolve(bricks, entry.workerd)) {
            errors.push(`${location} fails to resolve Bricks Worker export ${specifier}`);
          }
        } else if (typeof entry === "object" && !typeOnly) {
          errors.push(`${location} imports type-only Bricks export ${specifier} at runtime`);
        } else if (
          target &&
          target !== resolve(bricks, typeof entry === "string" ? entry : entry.types)
        ) {
          errors.push(
            `${location} redirects Bricks export ${specifier} to ${relative(workspace, target)}`,
          );
        }
      } else if (
        !ownedByBricks &&
        [target, path].some((candidate) => candidate && inside(candidate, bricks))
      ) {
        errors.push(`${location} bypasses Bricks exports through ${specifier}`);
      }
      if (ownedByBricks) {
        if (
          !inside(file, bricksWorker) &&
          [target, path].some((candidate) => candidate && inside(candidate, bricksWorker))
        ) {
          errors.push(`${location} imports Bricks Worker code through ${specifier}`);
        }
        if (
          hostNames.some((name) => specifier === name || specifier.startsWith(name + "/")) ||
          [target, path].some(
            (candidate) => candidate && hosts.some((host) => inside(candidate, host)),
          )
        ) {
          errors.push(`${location} imports host code from Bricks through ${specifier}`);
        }
      }
      if (ownedByBricks || inside(project, join(workspace, "packages")))
        edges.push({ ...reference, target });
    }
    if (edges.length > 0) packageEdges.set(realpathSync(file), edges);
  }
}

const checked = new Set();
function checkReactFree(file) {
  if (checked.has(file)) return;
  checked.add(file);
  for (const { specifier, target, typeOnly, line } of packageEdges.get(file) ?? []) {
    if (typeOnly) continue;
    const isReact = /^(react(?:-dom)?|@json-render\/react)(\/|$)/.test(specifier);
    if (isReact && specifier !== "@json-render/react/schema") {
      errors.push(
        `${relative(workspace, file)}:${line} imports React runtime in a definition or Worker graph through ${specifier}`,
      );
    }
    if (target && packageEdges.has(target)) checkReactFree(target);
  }
}
for (const file of packageEdges.keys()) {
  const [source, owner, module, directory] = relative(bricks, file).split(sep);
  if (
    source === "worker" ||
    (source === "src" && owner === "definition") ||
    (source === "src" &&
      owner === "modules" &&
      (module === "backendLibrary.ts" || directory === "definition"))
  ) {
    checkReactFree(file);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
}
