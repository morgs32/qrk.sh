# @zerospin/logger Telemetry Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove, inside a brand-new self-contained package `@zerospin/logger`, that Effect spans/logs can be captured into a per-invocation collector, carried across a simulated RPC boundary in an `IRpcEnvelope`, re-parented via `ITraceContext`, and reconstructed into an arbitrarily nested trace tree with span links.

**Architecture:** A custom Effect `Tracer` and `Logger` (installed via `Layer.setTracer` + `Logger.add`) write completed spans and log records into a mutable `TelemetryCollector`. A `runBoundary` helper plays the callee side of an RPC (fresh collector, optional external parent span, envelope out); `decodeEnvelope` plays the caller side (merge telemetry, unwrap result). An in-memory `TraceStore` + `buildTraceTree` prove the persistence/query model without any Durable Object.

**Tech Stack:** Effect 3.21.4 only (`Tracer.make`, `Tracer.externalSpan`, `Effect.withParentSpan`, `Logger.make`), vitest, Nx + pnpm. **No** `@zerospin/core`, no capnweb, no drizzle, no OTel dependencies.

**What this spike must prove (the risky claims):**
1. `Effect.fn` / `Effect.withSpan` spans flow through a custom tracer with correct parentage and timing.
2. `Effect.log*` records capture the current span's `traceId`/`spanId` plus `annotateLogs` annotations from inside a `Logger.make` logger.
3. A callee runtime can parent its spans under a caller's span using only `{ traceId, parentSpanId }` reconstructed via `Tracer.externalSpan` — one trace across two runtimes.
4. Child telemetry merges into the caller's collector through the envelope; a transport failure can be recorded as a `'lost'` span.
5. Span links (`priorTraceId`/`priorSpanId`, `'causedBy' | 'retryOf'`) serialize through the tracer and support forward ("what did this cause?") and backward ("why did this run?") queries.
6. An adjacency list (`parentSpanId`) reconstructs an arbitrarily nested tree in application code.

## Global Constraints

- Everything lives in `packages/logger` (package name `@zerospin/logger`, `private: true`). Do not modify any other package — zero blast radius is the point of the spike.
- Effect version: `3.21.4`. The only runtime dependency surface is `effect` (peer).
- Imports between files inside the package use the `.ts` extension (matches `packages/core` style, `"module": "NodeNext"` + `allowImportingTsExtensions` is not set, so use `.ts` in source with the same pattern `packages/core` uses — sibling imports like `./types.ts`).
- Settled naming (do not rename — these graduate verbatim later): `IRpcEnvelope` with fields `result` + `telemetry`; `ITelemetryBatch` with `spans` + `logs` + `links`; `ITraceContext` with `traceId` + `parentSpanId`; link target fields `priorTraceId` / `priorSpanId`; link kinds `'causedBy' | 'retryOf'`; span statuses `'ok' | 'error' | 'lost'`; ID prefixes `trc_` / `spn_`; collector method `flush()` (never "drain").
- Type names are `I`-prefixed. Timestamps on wire records are epoch milliseconds (`number`).
- Tests are plain vitest specs (`*.spec.ts`), node environment, run via `pnpm nx test @zerospin/logger`.
- No retention/trimming logic anywhere.

---

## File Structure

```
packages/logger/
  package.json                      @zerospin/logger, private, effect peer dep
  tsconfig.json                     mirrors packages/error/tsconfig.json
  tsconfig.etc.json                 typecheck-everything config (ts script)
  vitest.config.ts                  node environment
  src/
    index.ts                        re-exports the public surface
    types.ts                        ids, records, batch, envelope, trace context
    makeTelemetryIds.ts             sync trc_/spn_ generators
    TelemetryCollector.ts           Context.Tag + makeTelemetryCollector
    makeTelemetryTracer.ts          Tracer.make → CollectorSpan → collector
    makeTelemetryLogger.ts          Logger.make → ILogRecord → collector
    makeTelemetryLayer.ts           setTracer + Logger.add + collector service
    boundary.ts                     runBoundary, decodeEnvelope, currentTraceContext
    TraceStore.ts                   in-memory store + buildTraceTree
    *.spec.ts                       one spec per unit + boundary/store integration
```

---

### Task 1: Scaffold the package

**Files:**
- Create: `packages/logger/package.json`
- Create: `packages/logger/tsconfig.json`
- Create: `packages/logger/tsconfig.etc.json`
- Create: `packages/logger/vitest.config.ts`
- Create: `packages/logger/src/index.ts`
- Test: `packages/logger/src/index.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a workspace package Nx can run `test` / `ts` / `lint` targets on. All later tasks add files under `packages/logger/src/`.

Note: `pnpm-workspace.yaml` already globs `packages/*`, so no workspace config change is needed — just `pnpm install` after creating `package.json`.

- [ ] **Step 1: Create package.json**

Create `packages/logger/package.json` (mirrors `packages/error/package.json`, trimmed):

```json
{
  "name": "@zerospin/logger",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.js"
    }
  },
  "scripts": {
    "clean": "rimraf dist tsconfig.tsbuildinfo",
    "lib": "pnpm run clean && tsc -b tsconfig.json",
    "ts": "tsc -p tsconfig.etc.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest watch",
    "lint": "oxlint . --format stylish"
  },
  "devDependencies": {
    "@effect/language-service": "^0.85.1",
    "@types/node": "^25.6.2",
    "effect": "^3.21.4",
    "rimraf": "^6.1.3",
    "typescript": "6.0.3",
    "vitest": "^4.1.5"
  },
  "peerDependencies": {
    "effect": "^3.17.11"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Copy `packages/error/tsconfig.json` verbatim into `packages/logger/tsconfig.json` (it extends `../../tsconfig.base.json`, `rootDir: ./src`, `outDir: ./dist`, excludes `**/*.spec.ts`).

- [ ] **Step 3: Create tsconfig.etc.json**

Create `packages/logger/tsconfig.etc.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "composite": false,
    "incremental": false,
    "noEmit": true
  },
  "include": ["src/**/*.ts"],
  "exclude": []
}
```

- [ ] **Step 4: Create vitest.config.ts**

Create `packages/logger/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**'],
    globals: true,
  },
});
```

- [ ] **Step 5: Create the smoke entrypoint and spec**

Create `packages/logger/src/index.ts`:

```ts
export const packageName = '@zerospin/logger';
```

Create `packages/logger/src/index.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { packageName } from './index.ts';

describe('@zerospin/logger', () => {
  it('exists', () => {
    expect(packageName).toBe('@zerospin/logger');
  });
});
```

- [ ] **Step 6: Install and run**

Run: `pnpm install && pnpm nx test @zerospin/logger`
Expected: PASS (1 test). If vitest cannot resolve the `.ts` import extension, add `"allowImportingTsExtensions": true` to `tsconfig.json` `compilerOptions` (vitest transpiles; `tsc -b` still emits because specs are excluded from the build config — if `tsc` complains under `tsconfig.etc.json`, set `"noEmit": true` there, which is already the case).

- [ ] **Step 7: Commit**

```bash
git add packages/logger
git commit -m "chore(logger): scaffold @zerospin/logger spike package"
```

---

### Task 2: Wire types, ID makers, and TelemetryCollector

**Files:**
- Create: `packages/logger/src/types.ts`
- Create: `packages/logger/src/makeTelemetryIds.ts`
- Create: `packages/logger/src/TelemetryCollector.ts`
- Modify: `packages/logger/src/index.ts`
- Test: `packages/logger/src/TelemetryCollector.spec.ts`

**Interfaces:**
- Consumes: nothing outside `effect`.
- Produces (exact names later tasks use): `ITraceId`, `ISpanId`, `ILogLevel`, `ISpanStatus`, `ISpanLinkKind`, `ITraceContext`, `ISpanRecord`, `ILogRecord`, `ISpanLinkRecord`, `ITelemetryBatch`, `emptyTelemetryBatch()`, `IEitherEncoded<A, E>`, `IRpcEnvelope<A, E>`, `makeTraceId()`, `makeSpanId()`, `TelemetryCollector` (Context.Tag), `ITelemetryCollector` (`addSpan` / `addLog` / `addLinks` / `merge` / `flush`), `makeTelemetryCollector()`.

- [ ] **Step 1: Write the failing test**

Create `packages/logger/src/TelemetryCollector.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { makeSpanId, makeTraceId } from './makeTelemetryIds.ts';
import { makeTelemetryCollector } from './TelemetryCollector.ts';
import { emptyTelemetryBatch, type ILogRecord, type ISpanRecord } from './types.ts';

const spanRecord: ISpanRecord = {
  spanId: 'spn_a1',
  traceId: 'trc_a1',
  parentSpanId: null,
  name: 'test.span',
  status: 'ok',
  startedAt: 1000,
  endedAt: 2000,
  attributes: null,
};

const logRecord: ILogRecord = {
  createdAt: 1500,
  level: 'info',
  message: 'hello',
  source: 'test.span',
  payload: null,
  traceId: 'trc_a1',
  spanId: 'spn_a1',
};

describe('TelemetryCollector', () => {
  it('collects spans, logs, and links and flushes them once', () => {
    const collector = makeTelemetryCollector();
    collector.addSpan(spanRecord);
    collector.addLog(logRecord);
    collector.addLinks([
      {
        traceId: 'trc_a1',
        spanId: 'spn_a1',
        priorTraceId: 'trc_prior',
        priorSpanId: 'spn_prior',
        kind: 'causedBy',
      },
    ]);

    const batch = collector.flush();
    expect(batch.spans).toEqual([spanRecord]);
    expect(batch.logs).toEqual([logRecord]);
    expect(batch.links).toHaveLength(1);
    expect(collector.flush()).toEqual(emptyTelemetryBatch());
  });

  it('merges a child batch', () => {
    const collector = makeTelemetryCollector();
    collector.merge({ spans: [spanRecord], logs: [logRecord], links: [] });
    const batch = collector.flush();
    expect(batch.spans).toHaveLength(1);
    expect(batch.logs).toHaveLength(1);
  });

  it('makes prefixed unique ids', () => {
    expect(makeTraceId()).toMatch(/^trc_[0-9a-f]{32}$/);
    expect(makeSpanId()).toMatch(/^spn_[0-9a-f]{16}$/);
    expect(makeSpanId()).not.toEqual(makeSpanId());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test @zerospin/logger -- src/TelemetryCollector.spec.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create types.ts**

```ts
export type ITraceId = `trc_${string}`;
export type ISpanId = `spn_${string}`;

export type ILogLevel = 'debug' | 'info' | 'warn' | 'error';
export type ISpanStatus = 'ok' | 'error' | 'lost';
export type ISpanLinkKind = 'causedBy' | 'retryOf';

/** Trace context carried in an RPC request; the callee parents its root span to this. */
export type ITraceContext = Readonly<{
  traceId: ITraceId;
  parentSpanId: ISpanId;
}>;

/** Completed span crossing the wire; timestamps are epoch milliseconds. */
export type ISpanRecord = Readonly<{
  spanId: ISpanId;
  traceId: ITraceId;
  parentSpanId: ISpanId | null;
  name: string;
  status: ISpanStatus;
  startedAt: number;
  endedAt: number;
  attributes: Readonly<Record<string, unknown>> | null;
}>;

export type ILogRecord = Readonly<{
  createdAt: number;
  level: ILogLevel;
  message: string;
  source: string;
  payload: unknown | null;
  traceId: ITraceId | null;
  spanId: ISpanId | null;
}>;

/** Backward-in-time causal edge: the owning span was caused by / retries the prior span. */
export type ISpanLinkRecord = Readonly<{
  traceId: ITraceId;
  spanId: ISpanId;
  priorTraceId: ITraceId;
  priorSpanId: ISpanId;
  kind: ISpanLinkKind;
}>;

export type ITelemetryBatch = Readonly<{
  spans: readonly ISpanRecord[];
  logs: readonly ILogRecord[];
  links: readonly ISpanLinkRecord[];
}>;

export const emptyTelemetryBatch = (): ITelemetryBatch => ({
  spans: [],
  logs: [],
  links: [],
});

/** Spike stand-in for the production Schema-encoded Either. */
export type IEitherEncoded<A, E> =
  | Readonly<{ _tag: 'Right'; right: A }>
  | Readonly<{ _tag: 'Left'; left: E }>;

/** Wire shape of every cross-boundary RPC response: encoded domain Either plus telemetry. */
export type IRpcEnvelope<A, E = unknown> = Readonly<{
  result: IEitherEncoded<A, E>;
  telemetry: ITelemetryBatch;
}>;
```

- [ ] **Step 4: Create makeTelemetryIds.ts**

```ts
import type { ISpanId, ITraceId } from './types.ts';

const hex = (byteLength: number): string => {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, '0');
  }
  return out;
};

/*
 * Synchronous on purpose: the Effect tracer allocates span ids inside
 * Tracer.span(), a sync call, so Effect-based id factories are unusable here.
 */
export const makeTraceId = (): ITraceId => `trc_${hex(16)}`;

export const makeSpanId = (): ISpanId => `spn_${hex(8)}`;
```

- [ ] **Step 5: Create TelemetryCollector.ts**

```ts
import { Context } from 'effect';

import type {
  ILogRecord,
  ISpanLinkRecord,
  ISpanRecord,
  ITelemetryBatch,
} from './types.ts';

export type ITelemetryCollector = {
  addSpan: (span: ISpanRecord) => void;
  addLog: (log: ILogRecord) => void;
  addLinks: (links: readonly ISpanLinkRecord[]) => void;
  merge: (batch: ITelemetryBatch) => void;
  flush: () => ITelemetryBatch;
};

export class TelemetryCollector extends Context.Tag('TelemetryCollector')<
  TelemetryCollector,
  ITelemetryCollector
>() {}

export const makeTelemetryCollector = (): ITelemetryCollector => {
  let spans: ISpanRecord[] = [];
  let logs: ILogRecord[] = [];
  let links: ISpanLinkRecord[] = [];

  return {
    addSpan: span => {
      spans.push(span);
    },
    addLog: log => {
      logs.push(log);
    },
    addLinks: newLinks => {
      links.push(...newLinks);
    },
    merge: batch => {
      spans.push(...batch.spans);
      logs.push(...batch.logs);
      links.push(...batch.links);
    },
    flush: () => {
      const batch: ITelemetryBatch = { spans, logs, links };
      spans = [];
      logs = [];
      links = [];
      return batch;
    },
  };
};
```

- [ ] **Step 6: Re-export from index.ts**

Replace `packages/logger/src/index.ts`:

```ts
export * from './makeTelemetryIds.ts';
export * from './TelemetryCollector.ts';
export * from './types.ts';
```

Update `packages/logger/src/index.spec.ts` to match:

```ts
import { describe, expect, it } from 'vitest';

import { makeTraceId } from './index.ts';

describe('@zerospin/logger', () => {
  it('exports the telemetry surface', () => {
    expect(makeTraceId()).toMatch(/^trc_/);
  });
});
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm nx test @zerospin/logger`
Expected: PASS (4 tests across 2 files).

- [ ] **Step 8: Commit**

```bash
git add packages/logger
git commit -m "feat(logger): wire types, id makers, and TelemetryCollector"
```

---

### Task 3: Collector-backed Effect tracer

**Files:**
- Create: `packages/logger/src/makeTelemetryTracer.ts`
- Modify: `packages/logger/src/index.ts` (add `export * from './makeTelemetryTracer.ts';`)
- Test: `packages/logger/src/makeTelemetryTracer.spec.ts`

**Interfaces:**
- Consumes: Task 2 (`ITelemetryCollector`, `makeSpanId`/`makeTraceId`, record types); `Tracer.make`, `Tracer.Span`, `Tracer.SpanStatus`, `Tracer.SpanLink`, `Tracer.SpanKind`, `Tracer.AnySpan` from `effect` (all confirmed present in 3.21.4).
- Produces: `makeTelemetryTracer(collector: ITelemetryCollector): Tracer.Tracer`. Used by Tasks 4–5.

- [ ] **Step 1: Write the failing test**

Create `packages/logger/src/makeTelemetryTracer.spec.ts`:

```ts
import { Effect, Layer, Tracer } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeTelemetryTracer } from './makeTelemetryTracer.ts';
import { makeTelemetryCollector } from './TelemetryCollector.ts';

describe('makeTelemetryTracer', () => {
  it('records parent/child spans sharing one trace', async () => {
    const collector = makeTelemetryCollector();
    const layer = Layer.setTracer(makeTelemetryTracer(collector));

    const child = Effect.fn('test.child')(function* () {
      yield* Effect.void;
      return 1;
    });
    const parent = Effect.fn('test.parent')(function* () {
      return yield* child();
    });

    await Effect.runPromise(parent().pipe(Effect.provide(layer)));

    const { spans } = collector.flush();
    expect(spans.map(span => span.name).sort()).toEqual([
      'test.child',
      'test.parent',
    ]);
    const parentSpan = spans.find(span => span.name === 'test.parent')!;
    const childSpan = spans.find(span => span.name === 'test.child')!;
    expect(parentSpan.parentSpanId).toBeNull();
    expect(childSpan.parentSpanId).toBe(parentSpan.spanId);
    expect(childSpan.traceId).toBe(parentSpan.traceId);
    expect(parentSpan.status).toBe('ok');
    expect(parentSpan.endedAt).toBeGreaterThanOrEqual(parentSpan.startedAt);
  });

  it('marks failed spans as error and captures attributes', async () => {
    const collector = makeTelemetryCollector();
    const layer = Layer.setTracer(makeTelemetryTracer(collector));

    const failing = Effect.fail(new Error('boom')).pipe(
      Effect.withSpan('test.failing'),
      Effect.annotateSpans({ systemId: 'sys_123' }),
    );
    await Effect.runPromise(failing.pipe(Effect.ignore, Effect.provide(layer)));

    const { spans } = collector.flush();
    expect(spans).toHaveLength(1);
    expect(spans[0]!.status).toBe('error');
    expect(spans[0]!.attributes).toMatchObject({ systemId: 'sys_123' });
  });

  it('serializes span links with kind from link attributes', async () => {
    const collector = makeTelemetryCollector();
    const layer = Layer.setTracer(makeTelemetryTracer(collector));

    const linked = Effect.void.pipe(
      Effect.withSpan('test.linked', {
        links: [
          {
            _tag: 'SpanLink',
            span: Tracer.externalSpan({
              traceId: 'trc_prior',
              spanId: 'spn_prior',
            }),
            attributes: { kind: 'retryOf' },
          },
        ],
      }),
    );
    await Effect.runPromise(linked.pipe(Effect.provide(layer)));

    const { links, spans } = collector.flush();
    expect(links).toEqual([
      {
        traceId: spans[0]!.traceId,
        spanId: spans[0]!.spanId,
        priorTraceId: 'trc_prior',
        priorSpanId: 'spn_prior',
        kind: 'retryOf',
      },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test @zerospin/logger -- src/makeTelemetryTracer.spec.ts`
Expected: FAIL — cannot resolve `./makeTelemetryTracer.ts`.

- [ ] **Step 3: Implement the tracer**

Create `packages/logger/src/makeTelemetryTracer.ts`:

```ts
import { Exit, Option, Tracer, type Context } from 'effect';

import { makeSpanId, makeTraceId } from './makeTelemetryIds.ts';
import type { ITelemetryCollector } from './TelemetryCollector.ts';
import type {
  ISpanId,
  ISpanLinkKind,
  ISpanLinkRecord,
  ISpanRecord,
  ITraceId,
} from './types.ts';

const nanosToMillis = (nanos: bigint): number => Number(nanos / 1_000_000n);

class CollectorSpan implements Tracer.Span {
  readonly _tag = 'Span' as const;
  readonly spanId: string;
  readonly traceId: string;
  readonly sampled = true;
  readonly attributes = new Map<string, unknown>();
  status: Tracer.SpanStatus;
  links: ReadonlyArray<Tracer.SpanLink>;

  constructor(
    readonly name: string,
    readonly parent: Option.Option<Tracer.AnySpan>,
    readonly context: Context.Context<never>,
    links: ReadonlyArray<Tracer.SpanLink>,
    private readonly startTime: bigint,
    readonly kind: Tracer.SpanKind,
    private readonly collector: ITelemetryCollector,
  ) {
    this.spanId = makeSpanId();
    this.traceId = Option.match(parent, {
      onNone: () => makeTraceId(),
      onSome: parentSpan => parentSpan.traceId,
    });
    this.links = links;
    this.status = { _tag: 'Started', startTime };
  }

  attribute(key: string, value: unknown): void {
    this.attributes.set(key, value);
  }

  event(): void {
    // Effect.log* records are captured by makeTelemetryLogger; span events would duplicate them.
  }

  addLinks(links: ReadonlyArray<Tracer.SpanLink>): void {
    this.links = [...this.links, ...links];
  }

  end(endTime: bigint, exit: Exit.Exit<unknown, unknown>): void {
    this.status = { _tag: 'Ended', startTime: this.startTime, endTime, exit };
    const spanRecord: ISpanRecord = {
      // Ids are always minted by makeTelemetryIds or received as ITraceContext.
      spanId: this.spanId as ISpanId,
      traceId: this.traceId as ITraceId,
      parentSpanId: Option.match(this.parent, {
        onNone: () => null,
        onSome: parentSpan => parentSpan.spanId as ISpanId,
      }),
      name: this.name,
      status: Exit.isSuccess(exit) ? 'ok' : 'error',
      startedAt: nanosToMillis(this.startTime),
      endedAt: nanosToMillis(endTime),
      attributes:
        this.attributes.size > 0 ? Object.fromEntries(this.attributes) : null,
    };
    this.collector.addSpan(spanRecord);

    if (this.links.length > 0) {
      const linkRecords: ISpanLinkRecord[] = this.links.map(link => ({
        traceId: spanRecord.traceId,
        spanId: spanRecord.spanId,
        priorTraceId: link.span.traceId as ITraceId,
        priorSpanId: link.span.spanId as ISpanId,
        kind:
          (link.attributes['kind'] as ISpanLinkKind | undefined) ?? 'causedBy',
      }));
      this.collector.addLinks(linkRecords);
    }
  }
}

export const makeTelemetryTracer = (
  collector: ITelemetryCollector,
): Tracer.Tracer =>
  Tracer.make({
    span: (name, parent, context, links, startTime, kind) =>
      new CollectorSpan(name, parent, context, links, startTime, kind, collector),
    context: f => f(),
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test @zerospin/logger -- src/makeTelemetryTracer.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/logger
git commit -m "feat(logger): collector-backed Effect tracer"
```

---

### Task 4: Collector-backed Effect logger

**Files:**
- Create: `packages/logger/src/makeTelemetryLogger.ts`
- Modify: `packages/logger/src/index.ts` (add export)
- Test: `packages/logger/src/makeTelemetryLogger.spec.ts`

**Interfaces:**
- Consumes: Task 2; `Logger.make`, `FiberRef.currentContext`, `FiberRefs.getOrDefault`, `Tracer.ParentSpan` (`Context.Tag<ParentSpan, AnySpan>`), `Cause`, `Inspectable.toStringUnknown` from `effect`.
- Produces: `makeTelemetryLogger(collector: ITelemetryCollector): Logger.Logger<unknown, void>`. Used by Task 5.

- [ ] **Step 1: Write the failing test**

Create `packages/logger/src/makeTelemetryLogger.spec.ts`:

```ts
import { Effect, Layer, Logger } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeTelemetryLogger } from './makeTelemetryLogger.ts';
import { makeTelemetryTracer } from './makeTelemetryTracer.ts';
import { makeTelemetryCollector } from './TelemetryCollector.ts';

describe('makeTelemetryLogger', () => {
  it('captures logs with span ids, level, and annotations', async () => {
    const collector = makeTelemetryCollector();
    const layer = Layer.mergeAll(
      Layer.setTracer(makeTelemetryTracer(collector)),
      Logger.add(makeTelemetryLogger(collector)),
    );

    const program = Effect.gen(function* () {
      yield* Effect.logInfo('started');
      yield* Effect.logWarning('careful');
    }).pipe(
      Effect.annotateLogs({ systemId: 'sys_123' }),
      Effect.withSpan('test.op'),
    );

    await Effect.runPromise(program.pipe(Effect.provide(layer)));

    const { logs, spans } = collector.flush();
    expect(logs).toHaveLength(2);
    const [info, warn] = logs;
    expect(info!.level).toBe('info');
    expect(info!.message).toBe('started');
    expect(info!.source).toBe('test.op');
    expect(info!.payload).toMatchObject({ systemId: 'sys_123' });
    expect(info!.traceId).toBe(spans[0]!.traceId);
    expect(info!.spanId).toBe(spans[0]!.spanId);
    expect(warn!.level).toBe('warn');
  });

  it('captures logs outside any span with null trace ids', async () => {
    const collector = makeTelemetryCollector();
    const layer = Logger.add(makeTelemetryLogger(collector));

    await Effect.runPromise(
      Effect.logError('lonely').pipe(Effect.provide(layer)),
    );

    const { logs } = collector.flush();
    expect(logs).toHaveLength(1);
    expect(logs[0]!.level).toBe('error');
    expect(logs[0]!.traceId).toBeNull();
    expect(logs[0]!.spanId).toBeNull();
    expect(logs[0]!.source).toBe('effect');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test @zerospin/logger -- src/makeTelemetryLogger.spec.ts`
Expected: FAIL — cannot resolve `./makeTelemetryLogger.ts`.

- [ ] **Step 3: Implement the logger**

Create `packages/logger/src/makeTelemetryLogger.ts`:

```ts
import {
  Cause,
  Context,
  FiberRef,
  FiberRefs,
  Logger,
  Option,
  Tracer,
} from 'effect';
import { toStringUnknown } from 'effect/Inspectable';

import type { ITelemetryCollector } from './TelemetryCollector.ts';
import type { ILogLevel, ISpanId, ITraceId } from './types.ts';

const levelFromLabel = (label: string): ILogLevel => {
  switch (label) {
    case 'FATAL':
    case 'ERROR':
      return 'error';
    case 'WARN':
      return 'warn';
    case 'DEBUG':
    case 'TRACE':
    case 'ALL':
      return 'debug';
    default:
      return 'info';
  }
};

export const makeTelemetryLogger = (
  collector: ITelemetryCollector,
): Logger.Logger<unknown, void> =>
  Logger.make(options => {
    const fiberContext = FiberRefs.getOrDefault(
      options.context,
      FiberRef.currentContext,
    );
    const span = Option.getOrNull(
      Context.getOption(fiberContext, Tracer.ParentSpan),
    );

    const payload: Record<string, unknown> = Object.fromEntries(
      options.annotations,
    );
    if (!Cause.isEmpty(options.cause)) {
      payload['cause'] = Cause.pretty(options.cause);
    }

    collector.addLog({
      createdAt: options.date.getTime(),
      level: levelFromLabel(options.logLevel.label),
      message: Array.isArray(options.message)
        ? options.message.map(part => toStringUnknown(part)).join(' ')
        : toStringUnknown(options.message),
      source: span !== null && span._tag === 'Span' ? span.name : 'effect',
      payload: Object.keys(payload).length > 0 ? payload : null,
      traceId: span !== null ? (span.traceId as ITraceId) : null,
      spanId: span !== null ? (span.spanId as ISpanId) : null,
    });
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test @zerospin/logger -- src/makeTelemetryLogger.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/logger
git commit -m "feat(logger): collector-backed Effect logger"
```

---

### Task 5: makeTelemetryLayer

**Files:**
- Create: `packages/logger/src/makeTelemetryLayer.ts`
- Modify: `packages/logger/src/index.ts` (add export)
- Test: `packages/logger/src/makeTelemetryLayer.spec.ts`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces: `makeTelemetryLayer(collector: ITelemetryCollector): Layer.Layer<TelemetryCollector>`. Task 6's `runBoundary` provides it; `decodeEnvelope` reads `TelemetryCollector` from it.

- [ ] **Step 1: Write the failing test**

Create `packages/logger/src/makeTelemetryLayer.spec.ts`:

```ts
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeTelemetryLayer } from './makeTelemetryLayer.ts';
import { makeTelemetryCollector, TelemetryCollector } from './TelemetryCollector.ts';

describe('makeTelemetryLayer', () => {
  it('provides collector service and captures spans plus logs together', async () => {
    const collector = makeTelemetryCollector();

    const program = Effect.gen(function* () {
      const service = yield* TelemetryCollector;
      expect(service).toBe(collector);
      yield* Effect.logInfo('inside');
    }).pipe(Effect.withSpan('test.layer'));

    await Effect.runPromise(
      program.pipe(Effect.provide(makeTelemetryLayer(collector))),
    );

    const batch = collector.flush();
    expect(batch.spans.map(span => span.name)).toEqual(['test.layer']);
    expect(batch.logs).toHaveLength(1);
    expect(batch.logs[0]!.spanId).toBe(batch.spans[0]!.spanId);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test @zerospin/logger -- src/makeTelemetryLayer.spec.ts`
Expected: FAIL — cannot resolve `./makeTelemetryLayer.ts`.

- [ ] **Step 3: Implement the layer**

Create `packages/logger/src/makeTelemetryLayer.ts`:

```ts
import { Layer, Logger } from 'effect';

import { makeTelemetryLogger } from './makeTelemetryLogger.ts';
import { makeTelemetryTracer } from './makeTelemetryTracer.ts';
import {
  TelemetryCollector,
  type ITelemetryCollector,
} from './TelemetryCollector.ts';

/** One layer per boundary invocation: tracer + logger + collector service. */
export const makeTelemetryLayer = (
  collector: ITelemetryCollector,
): Layer.Layer<TelemetryCollector> =>
  Layer.mergeAll(
    Layer.succeed(TelemetryCollector, collector),
    Layer.setTracer(makeTelemetryTracer(collector)),
    Logger.add(makeTelemetryLogger(collector)),
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test @zerospin/logger -- src/makeTelemetryLayer.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/logger
git commit -m "feat(logger): makeTelemetryLayer combining tracer, logger, and collector"
```

---

### Task 6: RPC boundary simulation — envelope, trace context, merge, lost spans

This task is the heart of the spike: two independent Effect runtimes ("caller" and "callee") connected only by a plain async function returning an `IRpcEnvelope`, producing one coherent trace.

**Files:**
- Create: `packages/logger/src/boundary.ts`
- Modify: `packages/logger/src/index.ts` (add export)
- Test: `packages/logger/src/boundary.spec.ts`

**Interfaces:**
- Consumes: Tasks 2 and 5; `Tracer.externalSpan`, `Effect.withParentSpan`, `Effect.currentSpan`, `Effect.serviceOption` from `effect`.
- Produces:
  - `runBoundary<A, E>(props: { program: Effect.Effect<A, E>; traceContext?: ITraceContext }): Promise<IRpcEnvelope<A, E>>` — the callee side.
  - `decodeEnvelope<A, E>(envelope: IRpcEnvelope<A, E>): Effect.Effect<A, E>` — the caller side (merges telemetry into the ambient `TelemetryCollector` when present).
  - `currentTraceContext: Effect.Effect<ITraceContext | null>` — outbound context from the live span.

- [ ] **Step 1: Write the failing test**

Create `packages/logger/src/boundary.spec.ts`:

```ts
import { Effect, Either } from 'effect';
import { describe, expect, it } from 'vitest';

import { currentTraceContext, decodeEnvelope, runBoundary } from './boundary.ts';
import { makeSpanId } from './makeTelemetryIds.ts';
import { makeTelemetryLayer } from './makeTelemetryLayer.ts';
import { makeTelemetryCollector, TelemetryCollector } from './TelemetryCollector.ts';
import type { IRpcEnvelope, ITraceContext } from './types.ts';

/** Simulated remote repo: a separate Effect runtime reachable only via a Promise. */
const calleeRpc = (props: {
  value: number;
  traceContext: ITraceContext | null;
}): Promise<IRpcEnvelope<number, never>> =>
  runBoundary({
    traceContext: props.traceContext ?? undefined,
    program: Effect.gen(function* () {
      yield* Effect.logInfo('callee working');
      return props.value * 2;
    }).pipe(Effect.withSpan('Callee.double')),
  });

describe('boundary', () => {
  it('produces one trace across two runtimes and merges telemetry', async () => {
    const callerCollector = makeTelemetryCollector();

    const program = Effect.gen(function* () {
      const traceContext = yield* currentTraceContext;
      const envelope = yield* Effect.promise(() =>
        calleeRpc({ value: 21, traceContext }),
      );
      return yield* decodeEnvelope(envelope);
    }).pipe(Effect.withSpan('Caller.op'));

    const value = await Effect.runPromise(
      program.pipe(Effect.provide(makeTelemetryLayer(callerCollector))),
    );
    expect(value).toBe(42);

    const batch = callerCollector.flush();
    const callerSpan = batch.spans.find(span => span.name === 'Caller.op')!;
    const calleeSpan = batch.spans.find(span => span.name === 'Callee.double')!;

    // one trace, cross-runtime parentage
    expect(calleeSpan.traceId).toBe(callerSpan.traceId);
    expect(calleeSpan.parentSpanId).toBe(callerSpan.spanId);

    // callee log merged into caller collector, tagged with callee span
    const calleeLog = batch.logs.find(log => log.message === 'callee working')!;
    expect(calleeLog.traceId).toBe(callerSpan.traceId);
    expect(calleeLog.spanId).toBe(calleeSpan.spanId);
  });

  it('starts a fresh trace when no context is sent', async () => {
    const envelope = await calleeRpc({ value: 1, traceContext: null });
    expect(envelope.result).toEqual({ _tag: 'Right', right: 2 });
    expect(envelope.telemetry.spans).toHaveLength(1);
    expect(envelope.telemetry.spans[0]!.parentSpanId).toBeNull();
  });

  it('returns domain failures as Left while keeping telemetry', async () => {
    const envelope = await runBoundary({
      program: Effect.fail('domain-error' as const).pipe(
        Effect.withSpan('Callee.failing'),
      ),
    });
    expect(envelope.result).toEqual({ _tag: 'Left', left: 'domain-error' });
    expect(envelope.telemetry.spans[0]!.status).toBe('error');

    const callerCollector = makeTelemetryCollector();
    const exit = await Effect.runPromiseExit(
      decodeEnvelope(envelope).pipe(
        Effect.provide(makeTelemetryLayer(callerCollector)),
      ),
    );
    expect(exit._tag).toBe('Failure');
    expect(
      callerCollector.flush().spans.map(span => span.name),
    ).toEqual(['Callee.failing']);
  });

  it('records a lost span when the transport fails', async () => {
    const callerCollector = makeTelemetryCollector();

    const program = Effect.gen(function* () {
      const traceContext = yield* currentTraceContext;
      const attempt = yield* Effect.tryPromise(() =>
        Promise.reject<IRpcEnvelope<number, never>>(new Error('socket died')),
      ).pipe(Effect.either);

      if (Either.isLeft(attempt)) {
        const collector = yield* TelemetryCollector;
        collector.addSpan({
          spanId: makeSpanId(),
          traceId: traceContext!.traceId,
          parentSpanId: traceContext!.parentSpanId,
          name: 'Callee.double',
          status: 'lost',
          startedAt: 0,
          endedAt: 0,
          attributes: { transportError: String(attempt.left) },
        });
        return null;
      }
      return yield* decodeEnvelope(attempt.right);
    }).pipe(Effect.withSpan('Caller.op'));

    await Effect.runPromise(
      program.pipe(Effect.provide(makeTelemetryLayer(callerCollector))),
    );

    const batch = callerCollector.flush();
    const lost = batch.spans.find(span => span.status === 'lost')!;
    const caller = batch.spans.find(span => span.name === 'Caller.op')!;
    expect(lost.parentSpanId).toBe(caller.spanId);
    expect(lost.traceId).toBe(caller.traceId);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test @zerospin/logger -- src/boundary.spec.ts`
Expected: FAIL — cannot resolve `./boundary.ts`.

- [ ] **Step 3: Implement the boundary helpers**

Create `packages/logger/src/boundary.ts`:

```ts
import { Effect, Either, Option, Tracer } from 'effect';

import { makeTelemetryLayer } from './makeTelemetryLayer.ts';
import {
  makeTelemetryCollector,
  TelemetryCollector,
} from './TelemetryCollector.ts';
import type {
  IRpcEnvelope,
  ISpanId,
  ITraceContext,
  ITraceId,
} from './types.ts';

/**
 * Callee side of an RPC boundary: fresh collector + telemetry layer, optional
 * re-parenting under the caller's span, encoded Either + flushed telemetry out.
 */
export const runBoundary = async <A, E>(props: {
  program: Effect.Effect<A, E>;
  traceContext?: ITraceContext;
}): Promise<IRpcEnvelope<A, E>> => {
  const { program, traceContext } = props;
  const collector = makeTelemetryCollector();

  const parented =
    traceContext === undefined
      ? program
      : program.pipe(
          Effect.withParentSpan(
            Tracer.externalSpan({
              traceId: traceContext.traceId,
              spanId: traceContext.parentSpanId,
            }),
          ),
        );

  const either = await Effect.runPromise(
    parented.pipe(
      Effect.either,
      Effect.provide(makeTelemetryLayer(collector)),
    ),
  );

  return {
    result: Either.isRight(either)
      ? { _tag: 'Right', right: either.right }
      : { _tag: 'Left', left: either.left },
    telemetry: collector.flush(),
  };
};

/**
 * Caller side: merge the envelope's telemetry into the ambient collector
 * (when one is provided), then unwrap the encoded Either.
 */
export const decodeEnvelope = <A, E>(
  envelope: IRpcEnvelope<A, E>,
): Effect.Effect<A, E> =>
  Effect.gen(function* () {
    const maybeCollector = yield* Effect.serviceOption(TelemetryCollector);
    if (Option.isSome(maybeCollector)) {
      maybeCollector.value.merge(envelope.telemetry);
    }
    if (envelope.result._tag === 'Left') {
      return yield* Effect.fail(envelope.result.left);
    }
    return envelope.result.right;
  });

/** Outbound trace context from the live span, or null when unspanned. */
export const currentTraceContext: Effect.Effect<ITraceContext | null> =
  Effect.currentSpan.pipe(
    Effect.map(span => ({
      // Ids are always minted by makeTelemetryIds within this tracer.
      traceId: span.traceId as ITraceId,
      parentSpanId: span.spanId as ISpanId,
    })),
    Effect.orElseSucceed(() => null),
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test @zerospin/logger -- src/boundary.spec.ts`
Expected: PASS (4 tests). If the cross-runtime parentage assertion fails because `Effect.withParentSpan` composes differently around `Effect.withSpan`, swap the composition in `calleeRpc` (apply `withParentSpan` *outside* the program that contains `withSpan`, which is what `runBoundary` already does) — the assertion itself is the spike finding, so record the outcome either way.

- [ ] **Step 5: Commit**

```bash
git add packages/logger
git commit -m "feat(logger): RPC boundary simulation with envelope merge and lost spans"
```

---

### Task 7: TraceStore — persistence model and tree reconstruction

Proves the flat-table + adjacency-list claim: one store of spans/logs/links supports `getTrace`, infinite nesting, and forward/backward causal queries, entirely in application code.

**Files:**
- Create: `packages/logger/src/TraceStore.ts`
- Modify: `packages/logger/src/index.ts` (add export)
- Test: `packages/logger/src/TraceStore.spec.ts`

**Interfaces:**
- Consumes: Tasks 2 and 6.
- Produces:
  - `ITraceStore` with `append(batch)`, `getTrace(traceId): ITelemetryBatch`, `getCausedBy(traceId): readonly ISpanLinkRecord[]` (links whose `priorTraceId` matches — the forward/downstream query).
  - `makeTraceStore(): ITraceStore`.
  - `ISpanTreeNode` = `{ span, logs, children }`; `buildTraceTree(batch: ITelemetryBatch): readonly ISpanTreeNode[]`.

- [ ] **Step 1: Write the failing test**

Create `packages/logger/src/TraceStore.spec.ts`:

```ts
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { currentTraceContext, decodeEnvelope, runBoundary } from './boundary.ts';
import { makeTelemetryLayer } from './makeTelemetryLayer.ts';
import { makeTelemetryCollector } from './TelemetryCollector.ts';
import { buildTraceTree, makeTraceStore } from './TraceStore.ts';
import type { ITelemetryBatch } from './types.ts';

const runNestedTrace = async (): Promise<ITelemetryBatch> => {
  const collector = makeTelemetryCollector();
  const program = Effect.gen(function* () {
    const traceContext = yield* currentTraceContext;
    const envelope = yield* Effect.promise(() =>
      runBoundary({
        traceContext: traceContext ?? undefined,
        program: Effect.gen(function* () {
          yield* Effect.logInfo('deep work');
          yield* Effect.void.pipe(Effect.withSpan('Callee.inner'));
        }).pipe(Effect.withSpan('Callee.outer')),
      }),
    );
    return yield* decodeEnvelope(envelope);
  }).pipe(Effect.withSpan('Caller.root'));

  await Effect.runPromise(
    program.pipe(Effect.provide(makeTelemetryLayer(collector))),
  );
  return collector.flush();
};

describe('TraceStore', () => {
  it('reconstructs a nested tree from a real two-runtime run', async () => {
    const store = makeTraceStore();
    const batch = await runNestedTrace();
    store.append(batch);

    const traceId = batch.spans[0]!.traceId;
    const tree = buildTraceTree(store.getTrace(traceId));

    expect(tree).toHaveLength(1);
    const root = tree[0]!;
    expect(root.span.name).toBe('Caller.root');
    expect(root.children.map(node => node.span.name)).toEqual([
      'Callee.outer',
    ]);
    expect(
      root.children[0]!.children.map(node => node.span.name),
    ).toEqual(['Callee.inner']);
    // 'deep work' was logged in Callee.outer's span
    expect(root.children[0]!.logs.map(log => log.message)).toEqual([
      'deep work',
    ]);
  });

  it('answers forward and backward causal queries via links', () => {
    const store = makeTraceStore();
    store.append({
      spans: [
        {
          spanId: 'spn_api',
          traceId: 'trc_api',
          parentSpanId: null,
          name: 'FrontendApi.push',
          status: 'ok',
          startedAt: 0,
          endedAt: 10,
          attributes: null,
        },
        {
          spanId: 'spn_delivery',
          traceId: 'trc_drain',
          parentSpanId: null,
          name: 'AccountBlockRepo.processSubscriber',
          status: 'ok',
          startedAt: 100,
          endedAt: 110,
          attributes: null,
        },
      ],
      logs: [],
      links: [
        {
          traceId: 'trc_drain',
          spanId: 'spn_delivery',
          priorTraceId: 'trc_api',
          priorSpanId: 'spn_api',
          kind: 'causedBy',
        },
      ],
    });

    // backward: the drain trace carries its own links
    expect(store.getTrace('trc_drain').links[0]!.priorSpanId).toBe('spn_api');
    // forward: what did the API trace cause?
    const downstream = store.getCausedBy('trc_api');
    expect(downstream).toHaveLength(1);
    expect(downstream[0]!.spanId).toBe('spn_delivery');
  });

  it('tolerates orphan spans whose parent is not in the batch', () => {
    const tree = buildTraceTree({
      spans: [
        {
          spanId: 'spn_orphan',
          traceId: 'trc_x',
          parentSpanId: 'spn_gone',
          name: 'orphan',
          status: 'ok',
          startedAt: 0,
          endedAt: 1,
          attributes: null,
        },
      ],
      logs: [],
      links: [],
    });
    expect(tree).toHaveLength(1);
    expect(tree[0]!.span.name).toBe('orphan');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test @zerospin/logger -- src/TraceStore.spec.ts`
Expected: FAIL — cannot resolve `./TraceStore.ts`.

- [ ] **Step 3: Implement the store and tree builder**

Create `packages/logger/src/TraceStore.ts`:

```ts
import type {
  ILogRecord,
  ISpanLinkRecord,
  ISpanRecord,
  ITelemetryBatch,
  ITraceId,
} from './types.ts';

export type ITraceStore = {
  append: (batch: ITelemetryBatch) => void;
  getTrace: (traceId: ITraceId) => ITelemetryBatch;
  /** Forward query: links in other traces that cite this trace as their cause. */
  getCausedBy: (traceId: ITraceId) => readonly ISpanLinkRecord[];
};

export const makeTraceStore = (): ITraceStore => {
  const spans: ISpanRecord[] = [];
  const logs: ILogRecord[] = [];
  const links: ISpanLinkRecord[] = [];

  return {
    append: batch => {
      spans.push(...batch.spans);
      logs.push(...batch.logs);
      links.push(...batch.links);
    },
    getTrace: traceId => ({
      spans: spans
        .filter(span => span.traceId === traceId)
        .toSorted((a, b) => a.startedAt - b.startedAt),
      logs: logs
        .filter(log => log.traceId === traceId)
        .toSorted((a, b) => a.createdAt - b.createdAt),
      links: links.filter(link => link.traceId === traceId),
    }),
    getCausedBy: traceId =>
      links.filter(link => link.priorTraceId === traceId),
  };
};

export type ISpanTreeNode = Readonly<{
  span: ISpanRecord;
  logs: readonly ILogRecord[];
  children: readonly ISpanTreeNode[];
}>;

/** Adjacency-list reconstruction; spans whose parent is missing become roots. */
export const buildTraceTree = (
  batch: ITelemetryBatch,
): readonly ISpanTreeNode[] => {
  const spanIds = new Set(batch.spans.map(span => span.spanId));
  const logsBySpanId = new Map<string, ILogRecord[]>();
  for (const log of batch.logs) {
    if (log.spanId === null) {
      continue;
    }
    const existing = logsBySpanId.get(log.spanId) ?? [];
    existing.push(log);
    logsBySpanId.set(log.spanId, existing);
  }

  const build = (span: ISpanRecord): ISpanTreeNode => ({
    span,
    logs: logsBySpanId.get(span.spanId) ?? [],
    children: batch.spans
      .filter(candidate => candidate.parentSpanId === span.spanId)
      .toSorted((a, b) => a.startedAt - b.startedAt)
      .map(build),
  });

  return batch.spans
    .filter(
      span => span.parentSpanId === null || !spanIds.has(span.parentSpanId),
    )
    .toSorted((a, b) => a.startedAt - b.startedAt)
    .map(build);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test @zerospin/logger -- src/TraceStore.spec.ts`
Expected: PASS (3 tests). If `toSorted` is unavailable in the node target, replace each call with `[...array].sort(...)`.

- [ ] **Step 5: Full package verification**

Run: `pnpm nx test @zerospin/logger && pnpm nx run @zerospin/logger:ts && pnpm nx run @zerospin/logger:lint`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/logger
git commit -m "feat(logger): in-memory TraceStore with tree reconstruction and causal queries"
```

---

## Spike exit criteria

The spike succeeds when all six "risky claims" at the top have a green test demonstrating them. Write the outcome (especially any surprises around `withParentSpan` composition, logger span capture, or `Effect.fn` span naming) as a short summary in the PR/commit description — that record is the spike's actual deliverable.

## Graduation path (NOT part of this plan)

When the spike proves out, production adoption means:
- Move `types/ids/collector/tracer/logger/layer` into `@zerospin/core` (or keep `@zerospin/logger` as a real dependency), swapping `IEitherEncoded` for the existing `Schema.EitherEncoded` + `ZerospinError` encoding in `encodeRpc`/`decodeRpc`.
- `runBoundary` logic folds into repo RPC methods via `encodeRpc(program, collector)`; `decodeEnvelope` logic folds into `decodeRpc`.
- LogRepo gains `spans`/`spanLinks` tables + `appendTelemetry`/`getTrace` (requires making `migrateDb` idempotent/additive and running it on every DO construction — today it is bare `CREATE TABLE`, gated to run once by the `_isBootstrapped` flag).
- `TraceStore` becomes the LogRepo query layer; `buildTraceTree` remains consumer-owned.
- Then: `ITraceContext` threading, origin stamping (`originTraceId`/`originSpanId`), drain span links, autonomous flush.
