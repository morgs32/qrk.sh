# Source excerpts from the profiled bundle

These are exact selected JavaScript lines from the saved bundle; line numbers are one-based. Local checkout prefixes in source comments are replaced with repository-relative paths. The full upload bundle is omitted because it also contains deployment metadata.

## Effect.fn

ProductionWorker.js:8516

```js
var fn = /* @__PURE__ */ __name(function() {
  const nameFirst = typeof arguments[0] === "string";
  const name2 = nameFirst ? arguments[0] : "Effect.fn";
  const spanOptions = nameFirst ? arguments[1] : void 0;
  const prevLimit = getStackTraceLimit();
  let defError;
  if (prevLimit !== 0) {
    setStackTraceLimit(2);
    defError = new globalThis.Error();
    setStackTraceLimit(prevLimit);
  }
  if (nameFirst) {
    return (body, ...pipeables) => makeFn(name2, body, defError, pipeables, nameFirst, spanOptions);
  }
  return makeFn(name2, arguments[0], defError, Array.prototype.slice.call(arguments, 1), nameFirst, spanOptions);
```

## makeFn

ProductionWorker.js:31208

```js
function makeFn2(name2, options) {
  const definition = new Error();
  const definitionStack = /* @__PURE__ */ __name(() => definition.stack?.split("\n").slice(2).join("\n"), "definitionStack");
  return function(optionsOrBody, ...transforms) {
    const body = isBody(optionsOrBody) ? optionsOrBody : transforms.shift();
    if (!isBody(body)) {
      throw new TypeError("makeFn requires a function body");
    }
    const boundSelf = isBody(optionsOrBody) ? void 0 : optionsOrBody;
    const wrapped = /* @__PURE__ */ __name(function(...args2) {
      const invocation = new Error();
      let result3 = Effect_exports.suspend(() => {
        const program = body.apply(boundSelf === void 0 ? this : boundSelf.self, args2);
        return Effect_exports.isEffect(program) ? program : Effect_exports.gen(() => program);
      }).pipe((effect2) => annotateFunctionSpan(effect2, ...args2), Effect_exports.updateService(References_exports.CurrentStackFrame, (parent) => ({
```

## makeTx builder

ProductionWorker.js:42986

```js
  return function(program) {
    const definitionSource = functionSpanSource(new Error().stack?.split("\n").slice(2).join("\n"));
    return makeFn2(name2, {
      attributes: definitionSource === null ? {} : { "function.definition": definitionSource }
    })((db3, ...args2) => {
      const effect2 = Effect_exports.gen(function* () {
        const body = /* @__PURE__ */ __name((tx2) => Effect_exports.gen(() => program(tx2, ...args2)), "body");
        const context3 = yield* Effect_exports.context();
        const rollback = new Error("transaction-rollback");
        let captured;
        const exit4 = yield* Effect_exports.try({
          try: /* @__PURE__ */ __name(() => {
            if (inTxAlready) {
              throw new Error("nested-transaction-not-allowed");
            }
```

## rpcMethod

ProductionWorker.js:99847

```js
function rpcMethod(options) {
  if (!Schema_exports.isSchema(options.schema) || !options.name || !options.parseError || typeof options.parseError !== "function" && (typeof options.parseError.code !== "string" || typeof options.parseError.prefix !== "string")) {
    throw new Error("Invalid RPC method schema or parse-error policy");
  }
  const definition = functionSpanSource(
    new Error().stack?.split("\n").slice(2).join("\n")
  );
  return function(fn3, callbacks) {
    if (typeof fn3 !== "function" || typeof callbacks?.onSuccess !== "function" || typeof callbacks?.onFailure !== "function") {
      throw new Error(
        `${options.name}: invalid domain body or outcome callbacks`
      );
    }
    const annotated = /* @__PURE__ */ __name((invocation) => makeFn2(options.name, {
      root: true,
```

## GitHub activity samples

ProductionWorker.js:67409

```js
  contributions: Array.from({ length: 365 }, (_, index3) => {
    const date5 = /* @__PURE__ */ new Date();
    date5.setUTCDate(date5.getUTCDate() - (364 - index3));
    let sample = Math.imul(index3 + 1, 73244475);
    sample = Math.imul(sample ^ sample >>> 16, 73244475);
    sample = (sample ^ sample >>> 16) >>> 0;
    const count = sample % 100 < 30 ? 0 : 1 + sample % 15;
    const level = count === 0 ? 0 : count <= 3 ? 1 : count <= 7 ? 2 : count <= 11 ? 3 : 4;
    return { date: date5.toISOString().slice(0, 10), count, level };
  })
};
var githubActivityV1 = makeModuleVersion(githubActivity, {
  version: 1,
  variants: {
    default: {
```

## Actor upgrade chain

Actor9 was part of the uncommitted Stack-fit working tree used for profiling; it is not a file in this research PR. These captured declarations preserve the evidence for the chain.

### Actor3

ProductionWorker.js:72678

```js
var userActorV3 = makeAggregateActorRelease(defineAggregateActor({ name: "web" }), {
  version: 3,
  db,
  identity: identity2,
  authentication: {
    credentialsSchema: signature,
    authenticate: Effect_exports.fn("userActor.authenticate")(function* (props) {
      const { credentials } = props;
      const { env: env17 } = yield* Effect_exports.promise(() => import("cloudflare:workers"));
      const { CLERK_SECRET_KEY, CLERK_AUTHORIZED_PARTY } = yield* Schema_exports.decodeUnknownEffect(
        Schema_exports.Struct({
          CLERK_SECRET_KEY: Schema_exports.NonEmptyString,
          CLERK_AUTHORIZED_PARTY: Schema_exports.NonEmptyString
        })
      )(env17).pipe(
        mapParseError({
          code: "clerk-authentication-binding-unavailable",
          prefix: "Clerk authentication bindings are unavailable"
```

### Actor4

ProductionWorker.js:72813

```js
var userActorV4 = updateAggregateActorRelease(userActorV3, {
  version: 4,
  contracts: { renameStack: renameStackV1 }
});
```

### Actor5

ProductionWorker.js:72819

```js
var userActorV5 = makeAggregateActorRelease(defineAggregateActor({ name: "web" }), {
  version: 5,
  db: userActorV4.db,
  exposedModels: userActorV4.exposedModels,
  identity: userActorV4.identity,
  authentication: userActorV4.authentication,
  authorize: userActorV4.authorize,
  selections: userActorV4.selections,
  contracts: {
    addBrick: addBrickV3,
    addWallSection: addWallSectionV1,
    movePlacementToRow: movePlacementToRowV1,
    movePlacementToNewRow: movePlacementToNewRowV1,
    movePlacementToNewStack: movePlacementToNewStackV1,
    movePlacementToNewSection: movePlacementToNewSectionV1,
    moveStack: moveStackV1,
    renameStack: renameStackV1,
    deleteBrick: deleteBrickV2,
```

### Actor6

ProductionWorker.js:72851

```js
var userActorV6 = updateAggregateActorRelease(userActorV5, {
  version: 6,
  contracts: { movePlacementToRow: movePlacementToRowV2 }
});
```

### Actor7

ProductionWorker.js:73848

```js
var userActorV7 = makeAggregateActorRelease(defineAggregateActor({ name: "web" }), {
  version: 7,
  db: db2,
  identity: identity3,
  authentication: userActorV6.authentication,
  authorize: userActorV6.authorize,
  exposedModels: {
    wall: wallV2,
    brick: brickV2,
    placement: placementV2,
    page: pageV1,
    pageSnapshot: pageSnapshotV3,
    site: siteV1,
    user: userV1
  },
  contracts: {
    addBrick: addBrickV4,
    addWallSection: addWallSectionV2,
```

### Actor8

ProductionWorker.js:74098

```js
var userActorV8 = updateAggregateActorRelease(userActorV7, {
  version: 8,
  contracts: { setRowWidthWeights: setRowWidthWeightsV1, setRowMinHeight: setRowMinHeightV1 }
});
```

### Actor9

ProductionWorker.js:75157

```js
var userActorV9 = updateAggregateActorRelease(userActorV8, {
  version: 9,
  contracts: {
    insertStack: insertStackV1,
    addBrick: addBrickV5,
    movePlacementToRow: movePlacementToRowV4,
    movePlacementToNewRow: movePlacementToNewRowV3,
    movePlacementToNewStack: movePlacementToNewStackV3,
    movePlacementToNewSection: movePlacementToNewSectionV3,
    moveStack: moveStackV3,
    updateSiteSettings: updateSiteSettingsV2
  }
});
```
