import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import ts from 'typescript';

const packages = resolve(import.meta.dirname, '../..');
const forbidden = [
  /\b(?:asyncInput|AsyncCommandInputSchema|IAsyncCommandInput|makeAsyncContract|IAsyncContractDefinition|decodeAsyncInput|validateAsyncValues)\b/u,
  /\breceipts\s*:/u,
  /kind:\s*['"]receipt['"]/u,
  /\bcompletedCommands\b/u,
  /\b(?:IAggregateActorOutput|IServiceActorOutput|AggregateActorOutputSchema|ServiceActorOutputSchema|INodeCommandInput|definitionKey|getActorOutputs)\b/u,
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
assert.deepEqual(properties, [
  'admission',
  'commandName',
  'delta',
  'execution',
  'id',
]);
const replay = await readFile(
  resolve(
    packages,
    'system-worker/src/ServiceActorVersionRepo/execute/executeTx.ts',
  ),
  'utf8',
);
assert(
  !/getRepo|makeAsync|readRpcEnvelope|config/u.test(replay),
  'Actor replay transaction must use local retained operations',
);
assert.match(replay, /row\.operations\.entries\(\)/u);
assert.match(replay, /prepareReplayAppliedOperation\(/u);
for (const path of [
  'core/src/AggregateNode/aggregateNodeTables.ts',
  'core/src/ServiceNode/serviceNodeTables.ts',
  'core/src/serviceSession/serviceSessionRepoTables.ts',
  'core/src/aggregateSession/sessionRepoDbConfig.ts',
]) {
  const history = await readFile(resolve(packages, path), 'utf8');
  assert.match(
    history,
    /\badmission:/u,
    `${path}: browser history must retain command admission`,
  );
  assert.match(
    history,
    /\bexecution:/u,
    `${path}: browser history must retain command execution`,
  );
  assert(
    !/\bfailure:/u.test(history),
    `${path}: command phases must not collapse into a single failure`,
  );
}
for (const [kind, domainIndex, domainHash] of [
  ['Aggregate', 'aggregateIndex', 'executedHash'],
  ['Service', 'serviceIndex', 'serviceHash'],
]) {
  const path = `core/src/${kind}Node/${kind.toLowerCase()}NodeTables.ts`;
  const history = await readFile(resolve(packages, path), 'utf8');
  assert.match(history, /journalIndex: integer\(\)\.primaryKey/u);
  assert.match(history, /changeIndex: integer\(\)\.notNull\(\)\.unique\(\)/u);
  assert.match(history, /nodeIndex: integer\(\)\.unique\(\)/u);
  assert.match(history, /executedIndex: integer\(\)\.unique\(\)/u);
  assert.match(history, /sessionKey: text\(\)\.notNull\(\)/u);
  assert.match(history, new RegExp(`${domainIndex}: integer`, 'u'));
  assert.match(history, new RegExp(`${domainHash}: text`, 'u'));
  assert(
    !/id: text\(\)[^\n]*primaryKey|\b(?:targetId|targetName)\b/u.test(history),
    `${path}: concrete journal identity must remain independent of command ID`,
  );
}
for (const path of [
  'core/src/aggregateSession/sessionRepoDbConfig.ts',
  'core/src/serviceSession/serviceSessionRepoTables.ts',
]) {
  const history = await readFile(resolve(packages, path), 'utf8');
  assert.equal(
    history.match(
      /sessionIndex:\s*primitives\.integer\(\{\s*primaryKey:\s*true\s*\}\)/gu,
    )?.length,
    2,
    `${path}: commands and optimism must both use the session row key`,
  );
  assert.match(history, /nextSessionIndex:\s*primitives\.integer\(\)/u);
  assert(
    !/\b(?:journalIndex|nextJournalIndex)\b/u.test(history),
    `${path}: session history must use its sole retained-row coordinate`,
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
  'PASS: command occurrences, minimal disclosed command fields, local replay, concrete terminal browser journals',
);
