import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

// Read declarations, never execute worker classes or their configuration modules.
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const modules = new Map();
const values = new Map();
function moduleFor(file) {
  const absolute = path.resolve(root, file);
  if (modules.has(absolute)) return modules.get(absolute);
  const source = ts.createSourceFile(
    absolute,
    fs.readFileSync(absolute, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const declarations = new Map();
  const imports = new Map();
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          declarations.set(declaration.name.text, declaration.initializer);
        }
      }
    }
    if (
      ts.isImportDeclaration(statement) &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      for (const item of statement.importClause.namedBindings.elements) {
        imports.set(item.name.text, {
          file: statement.moduleSpecifier.text,
          name: item.propertyName?.text ?? item.name.text,
        });
      }
    }
  }
  const module = { source, declarations, imports, absolute };
  modules.set(absolute, module);
  return module;
}
function resolveImport(file, from) {
  const sourcePath = file.startsWith('@zerospin/')
    ? path.join(
        root,
        'packages',
        file.slice('@zerospin/'.length).split('/')[0],
        'src',
        ...file.slice('@zerospin/'.length).split('/').slice(1),
      )
    : path.resolve(path.dirname(from), file);
  const stem = sourcePath.replace(/\.(js|ts)$/, '');
  for (const candidate of [
    sourcePath,
    `${stem}.ts`,
    `${sourcePath}.ts`,
    `${sourcePath}/index.ts`,
  ]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  throw new Error(`Cannot resolve ${file} from ${from}`);
}
function identifier(name, module) {
  const key = `${module.absolute}:${name}`;
  if (values.has(key)) return values.get(key);
  const declaration = module.declarations.get(name);
  const imported = module.imports.get(name);
  const value = declaration
    ? evaluate(declaration, module)
    : imported
      ? identifier(
          imported.name,
          moduleFor(resolveImport(imported.file, module.absolute)),
        )
      : name;
  values.set(key, value);
  return value;
}
function sourceOf(node, module) {
  return {
    path: path.relative(root, module.absolute),
    line:
      module.source.getLineAndCharacterOfPosition(node.getStart(module.source))
        .line + 1,
  };
}
function object(node, module) {
  const result = {};
  for (const entry of node.properties) {
    if (ts.isSpreadAssignment(entry)) {
      Object.assign(result, evaluate(entry.expression, module));
    } else if (ts.isPropertyAssignment(entry)) {
      const name = entry.name
        .getText(module.source)
        .replace(/^['"]|['"]$/g, '');
      result[name] =
        name === 'schema'
          ? entry.initializer.getText(module.source)
          : evaluate(entry.initializer, module);
    } else if (ts.isShorthandPropertyAssignment(entry)) {
      result[entry.name.text] = identifier(entry.name.text, module);
    } else {
      throw new Error(
        `Unsupported object property ${entry.getText(module.source)}`,
      );
    }
  }
  return result;
}
function drizzleColumn(node, module) {
  const text = node.getText(module.source);
  return {
    kind: text.startsWith('integer')
      ? text.includes("mode: 'boolean'")
        ? 'boolean'
        : 'integer'
      : text.includes("mode: 'json'")
        ? 'json'
        : 'text',
    nullable: !text.includes('.notNull()') && !text.includes('.primaryKey()'),
    primaryKey: text.includes('.primaryKey()'),
    unique: text.includes('.unique()'),
  };
}
function evaluate(node, module) {
  if (!node) return undefined;
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    return evaluate(node.expression, module);
  }
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
    return ts.isNumericLiteral(node) ? Number(node.text) : node.text;
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isIdentifier(node)) return identifier(node.text, module);
  if (ts.isObjectLiteralExpression(node)) return object(node, module);
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map(item => evaluate(item, module));
  }
  if (ts.isPropertyAccessExpression(node)) {
    const value = evaluate(node.expression, module);
    if (
      typeof value === 'object' &&
      value !== null &&
      node.name.text in value
    ) {
      return value[node.name.text];
    }
    throw new Error(`Unresolved property ${node.getText(module.source)}`);
  }
  if (ts.isCallExpression(node)) {
    const functionName = ts.isPropertyAccessExpression(node.expression)
      ? node.expression.name.text
      : node.expression.getText(module.source);
    if (node.expression.getText(module.source).includes('primitives.')) {
      return {
        kind: functionName,
        ...(node.arguments[0] ? evaluate(node.arguments[0], module) : {}),
      };
    }
    if (functionName === 'defineModel') {
      return evaluate(node.arguments[0], module);
    }
    if (functionName === 'makeTable') {
      return {
        ...evaluate(node.arguments[0], module),
        source: sourceOf(node, module),
      };
    }
    if (functionName === 'makeDbConfig') {
      return evaluate(node.arguments[0], module);
    }
    if (functionName === 'makeModelVersion') {
      const identity = evaluate(node.arguments[0], module);
      const props = evaluate(node.arguments[1], module);
      const table = {
        name: identity.name,
        shape: {
          id: { kind: 'primaryKey', abbreviation: identity.abbreviation },
          modelName: { kind: 'text' },
          createdAt: { kind: 'date' },
          updatedAt: { kind: 'date' },
          version: { kind: 'text' },
          ...props.attributes,
        },
        indexes: props.indexes,
        source: sourceOf(node, module),
      };
      return { table };
    }
    if (functionName === 'sqliteTable') {
      const shape = {};
      for (const property of node.arguments[1].properties) {
        shape[property.name.text] = drizzleColumn(property.initializer, module);
      }
      return {
        name: evaluate(node.arguments[0], module),
        shape,
        source: sourceOf(node, module),
      };
    }
  }
  throw new Error(
    `Unsupported schema expression ${node.getText(module.source)}`,
  );
}
function column(name, descriptor) {
  if (!descriptor || !descriptor.kind) {
    throw new Error(`Invalid descriptor for ${name}`);
  }
  const result = {
    name,
    type:
      descriptor.kind === 'enum'
        ? descriptor.values.join(' | ')
        : descriptor.kind === 'json'
          ? 'json'
          : descriptor.kind === 'primaryKey' ||
              descriptor.kind === 'foreignKey' ||
              descriptor.kind === 'ref' ||
              descriptor.kind === 'cursor'
            ? 'text'
            : descriptor.kind === 'date'
              ? 'timestamp_ms'
              : descriptor.kind,
  };
  if (descriptor.kind === 'primaryKey' || descriptor.primaryKey) {
    result.primaryKey = true;
  }
  if (descriptor.nullable) result.nullable = true;
  if (descriptor.unique || descriptor.kind === 'primaryKey') {
    result.unique = true;
  }
  if (descriptor.kind === 'ref') {
    const tableName =
      typeof descriptor.table === 'string'
        ? descriptor.table
        : descriptor.table.name;
    const primary =
      typeof descriptor.table === 'string'
        ? descriptor.column
        : Object.entries(descriptor.table.shape).find(
            ([, item]) => item.kind === 'primaryKey' || item.primaryKey,
          )?.[0];
    if (!tableName || !primary) throw new Error(`Unresolved reference ${name}`);
    result.reference = { table: tableName, column: primary };
    if (
      typeof descriptor.table !== 'string' &&
      descriptor.table.shape[primary].kind === 'integer'
    ) {
      result.type = 'integer';
    }
  }
  return result;
}
function tablesFrom(file, symbol) {
  return identifier(symbol, moduleFor(file));
}
function capture(table) {
  return {
    name: table.name,
    columns: Object.entries(table.shape).map(([name, descriptor]) =>
      column(name, descriptor),
    ),
    source: table.source,
    indexes: table.indexes ?? [],
  };
}
const configs = {
  system: ['SystemRepo/systemRepoDbConfig.ts', 'systemRepoDbConfig'],
  log: ['SystemLogRepo/systemLogRepoDbConfig.ts', 'systemLogRepoDbConfig'],
  ac: ['AggregateChain/aggregateChainDbConfig.ts', 'aggregateChainDbConfig'],
  avr: [
    'AggregateVersionRepo/aggregateVersionRepoDbConfig.ts',
    'aggregateVersionRepoDbConfig',
  ],
  avc: [
    'AggregateVersionChain/aggregateVersionChainDbConfig.ts',
    'aggregateVersionChainDbConfig',
  ],
  aavr: [
    'AggregateActorVersionRepo/aggregateActorVersionRepoDbConfig.ts',
    'aggregateActorVersionRepoDbConfig',
  ],
  aavc: [
    'AggregateActorVersionChain/aggregateActorVersionChainDbConfig.ts',
    'aggregateActorVersionChainDbConfig',
  ],
  sc: ['ServiceChain/serviceChainDbConfig.ts', 'serviceChainDbConfig'],
  svr: [
    'ServiceVersionRepo/serviceVersionRepoDbConfig.ts',
    'serviceVersionRepoDbConfig',
  ],
  svc: [
    'ServiceVersionChain/serviceVersionChainDbConfig.ts',
    'serviceVersionChainDbConfig',
  ],
  savr: [
    'ServiceActorVersionRepo/serviceActorVersionRepoDbConfig.ts',
    'serviceActorVersionRepoDbConfig',
  ],
  savc: [
    'ServiceActorVersionChain/serviceActorVersionChainDbConfig.ts',
    'serviceActorVersionChainDbConfig',
  ],
};
const result = {};
for (const [repo, [file, symbol]] of Object.entries(configs)) {
  result[repo] = Object.values(
    tablesFrom(`packages/system-worker/src/${file}`, symbol).tables,
  ).map(capture);
}
result['aggregate-session'] = Object.values(
  tablesFrom(
    'packages/core/src/aggregateSession/sessionRepoDbConfig.ts',
    'sessionRepoDbConfig',
  ).tables,
).map(capture);
result.session = Object.values(
  tablesFrom(
    'packages/core/src/serviceSession/serviceSessionRepoTables.ts',
    'serviceSessionRepoTables',
  ),
).map(capture);
result.node = ['nodeMetadata', 'nodeCommands'].map(symbol =>
  capture(tablesFrom('packages/core/src/Node/nodeTables.ts', symbol)),
);
const models = {
  product: ['services/marketplace/models/product/ProductV1.ts', 'productV1'],
  cart: ['services/marketplace/models/cart/CartV1.ts', 'cartV1'],
  cartItem: [
    'services/marketplace/models/cartItem/CartItemV1.ts',
    'cartItemV1',
  ],
  purchase: ['aggregates/user/models/purchase/PurchaseV1.ts', 'purchaseV1'],
  purchaseItem: [
    'aggregates/user/models/purchaseItem/PurchaseItemV1.ts',
    'purchaseItemV1',
  ],
  promotionReservation: [
    'services/promotion/models.ts',
    'promotionReservationV1',
  ],
};
result.models = Object.entries(models).map(([, [file, symbol]]) =>
  capture(tablesFrom(`examples/shopping/src/zerospin/${file}`, symbol).table),
);
const output = path.join(root, 'visualizer/src/data/schema-snapshot.json');
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(
  `Captured ${Object.values(result).flat().length} table declarations without executing source modules.`,
);
