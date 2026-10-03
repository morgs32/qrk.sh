import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import ts from 'typescript';

const packages = resolve(import.meta.dirname, '../..');
const forbidden = [
  /\breceipts\s*:/u,
  /kind:\s*['"]receipt['"]/u,
  /\bcompletedCommands\b/u,
  /SourceReceiptOperationsSchema/u,
  /resolveReceiptOperations/u,
  /\b(?:aggregateCommandsOutbox|actorOutputsOutbox|executionOutbox|originalResultsOutbox|commandOutbox|IForwardedCommand)\b/u,
  /\b(?:IRedactedCommand|RedactedCommandSchema|redactedCommandOutbox)\b/u,
];
for (const project of ['core', 'browser', 'system-worker', 'devtools', 'sdk']) {
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await inspect(file);
      } else if (/\.tsx?$/u.test(file)) {
        const source = await readFile(file, 'utf8');
        for (const pattern of forbidden) {
          assert(
            !pattern.test(source),
            `${file}: superseded command receipt contract ${pattern}`,
          );
        }
      }
    }
  }
  await inspect(resolve(packages, project, 'src'));
}
const source = await readFile(
  resolve(packages, 'core/src/contracts/BrowserCommandSchema.ts'),
  'utf8',
);
const parsed = ts.createSourceFile(
  'BrowserCommandSchema.ts',
  source,
  ts.ScriptTarget.Latest,
  true,
);
let properties;
function visit(node) {
  if (
    ts.isVariableDeclaration(node) &&
    node.name.getText(parsed) === 'BrowserCommandSchema'
  ) {
    const argument = node.initializer.arguments[0];
    properties = argument.properties
      .map(property => property.name.getText(parsed))
      .sort();
  }
  ts.forEachChild(node, visit);
}
visit(parsed);
assert.deepEqual(properties, ['commandName', 'delta', 'failure', 'id']);
const replay = await readFile(
  resolve(
    packages,
    'system-worker/src/ServiceActorVersionRepo/execute/readImportedOperations.ts',
  ),
  'utf8',
);
assert(
  !/getRepo|makeAsync|readRpcEnvelope|config/u.test(replay),
  'Imported replay must use local retained operations',
);
for (const path of [
  'core/src/Node/nodeTables.ts',
  'core/src/aggregateSession/sessionRepoDbConfig.ts',
]) {
  const history = await readFile(resolve(packages, path), 'utf8');
  assert(
    !/\b(?:admission|execution):/u.test(history),
    `${path}: browser history retains phase summaries`,
  );
}
const queue = await readFile(
  resolve(packages, 'system-worker/src/makeOutboxQueue/makeOutboxQueue.ts'),
  'utf8',
);
assert(
  !/acknowledgedAt|retention/u.test(queue),
  'Outboxes must delete acknowledged rows',
);
const actorRows = await readFile(
  resolve(
    packages,
    'core/src/aggregateSession/aggregateBrowserCommandsTable.ts',
  ),
  'utf8',
);
assert(
  !/output:\s*primitives/u.test(actorRows),
  'Browser outbox commands must be flat',
);
console.log(
  'PASS: command occurrences, minimal browser commands, local replay, terminal browser journals',
);
