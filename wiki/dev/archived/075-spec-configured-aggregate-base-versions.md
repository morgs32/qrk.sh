# Configured aggregate base versions design

**Date:** 2026-09-08
**Status:** Approved design; archived after planning

Implementation is tracked in [Plan 075](../plans/075-plan-configured-aggregate-base-versions.md).

## Problem Statement

Aggregate cutover currently requires a manual RPC to select the base materializer. Application authors need to declare the desired base separately from the latest supported execution version, while retaining checked promotion and durable recovery.

Putting that declaration on the authored Aggregate and in the immutable System spec would make a promotion-policy change require a new `system.version`. The typed configuration introduced by Spec 074 already supplies a shared Node and Worker entry and is the appropriate owner for this policy.

## Solution

Require one base-version setting per aggregate in the root `zerospin.config.ts`:

```ts
export default system.config({
  aggregates: {
    notes: { canonical: '1.0.0' },
  },
  seeds: { dev: seeds },
});
```

An authored `notes.version` of `2.0.0` makes v2 available while this configuration keeps v1 authoritative. Changing the configured base to v2 and deploying the configuration requests promotion as each AggregateChain (AC) activates under the new Worker bundle.

AC records the configured destination and schedules comparison after activation. Its applied `baseAggregateVersion` changes only after the existing cutover check succeeds. Configuration is the sole aggregate promotion authority; the immutable system-version feed continues to enroll supported materializers without selecting the base.

## User Stories

1. As an application author, I can publish a new aggregate execution version while explicitly retaining the previous base.
2. As an application author, I can request promotion through `zerospin.config.ts` without changing the authored System spec or bumping `system.version` solely for that request.
3. As an application author, I receive configuration errors for missing aggregate settings, unknown aggregate names, or unsupported base versions.
4. As an operator, I can let existing aggregate instances adopt the configuration during activation without invoking a manual cutover RPC.
5. As an operator, I can rely on new, empty aggregate instances to start directly at the configured base, including a supported historical version.
6. As an operator, I can skip intermediate configuration deployments: an instance compares its applied base directly with the destination configured in the bundle it activates under.
7. As an operator, I can inspect desired and applied bases and a cutover failure while the instance continues serving its applied base.
8. As a maintainer, I can verify promotion, divergence, superseded work, and restart recovery through existing runtime and transaction test seams.

## Implementation Decisions

### Configuration and runtime access

1. Extend the existing `system.config(...)` and `ISystemConfig` contracts with a required `aggregates` record. Require exactly the receiving System's aggregate names, each containing a required `canonical: string`. An aggregate-free System supplies an empty record. Do not default a missing setting to the authored aggregate's current version.
2. Preserve concrete System and seed inference. Validate configuration in the existing synchronous configuration construction and runtime loading boundaries: reject missing or unknown aggregate keys, malformed settings, and versions absent from that aggregate's current and historical definitions. Do not add a CLI typechecker or new named type solely for an individual setting.
3. Snapshot and freeze the owned aggregate-settings record and its entries. Preserve the original System reference and the existing lazy seed behavior; constructing or importing configuration neither mutates the System nor executes seeds or cutover.
4. Keep `canonical` out of authored Aggregate objects, historical definitions, `getVersion()` views, and `ISystemSpec`/`SystemSpecSchema`. Changing only this configuration leaves `getSystemSpec()` unchanged and requires neither a System nor an aggregate execution-version bump. Authored-definition changes remain subject to the existing immutable System publication rules.
5. Extend the existing generated Worker entry to expose the configuration alongside its named `system` export through the existing module alias. Preserve `system === config.system`, scoped generated-file cleanup, and shared CLI/Worker configuration loading. Do not add separate configuration discovery or mutate the System to attach settings.
6. Update repository-owned configurations and affected fixtures to supply explicit entries. Preserve their existing seed settings and choose their current aggregate versions unless a fixture intentionally exercises a historical base.

### Activation and ownership

1. AC reads the destination from `config.aggregates[this.key.aggregateName].canonical` during activation. Configuration in the executing Worker bundle supplies the desired version; the existing persisted chain state supplies the applied version.
2. On first initialization, set both `baseAggregateVersion` and `desiredBaseAggregateVersion` to the configured version. An empty history needs no comparison and must not activate materializers solely to establish the base.
3. On later activation, preserve the applied base, feed cursor, command history, destination progress, and invalidations. Refresh `desiredBaseAggregateVersion` from the executing configuration and retain cutover recovery before committing changed intent. Persisted desired state is a mirror for recovery and inspection, not another independently writable policy source.
4. Register the existing cutover domain Effect with AC's existing alarm registry. Activation initiates recovery; materializer flushing and comparison run after the activation gate opens. Do not await checked cutover inside `onDOActivation()`.
5. Preserve the existing system-version subscription and destination-enrollment path. Before comparing, catch up that feed so the selected supported materializer is enrolled. Feed receipt never changes the desired or applied base. Do not redesign subscription activation as part of this work.
6. A configuration-only deployment produces no new System-spec entry. A still-running instance uses its loaded configuration until it activates under another bundle. No broadcast or system-wide simultaneous switch is promised. SystemRepo does not own promotion, deployment coordination, or configuration distribution.

### Comparison, supersession, and recovery

1. Compare the actual applied base directly against the currently configured destination. If an instance last applied v1 and next activates with v3 configured, do not require an intermediate v2 promotion.
2. Preserve forward-only numeric version precedence. Equality is already applied. A desired version older than the applied base is blocked; keep serving the applied base and retain an inspectable failure rather than rolling back.
3. Preserve the existing cutover invariant. For a nonempty chain, sample admitted index `n`, flush both version-owned materializers through that exact index, and require matching command identity and rolling disposition hashes. The hash compares success/failure history, not resource-state or mutation-byte equality. Admissions may continue while comparison runs.
4. For an existing empty chain, promote a valid newer destination at index zero without materializer lookup or flushing. Unsupported or invalidated destinations cannot be promoted.
5. Commit promotion or candidate invalidation transactionally only after rechecking both the sampled applied base and desired destination. Superseded work must not promote, invalidate, or overwrite failure information for a different active request. Reevaluate the retained current intent instead.
6. Equal checkpoints advance `baseAggregateVersion`. Divergence invalidates the candidate and retains the applied base. Preserve existing invalidation records; changing configuration or replaying version enrollment does not make an invalidated candidate valid again.
7. Retain a nullable `cutoverFailure` on chain state for existing Repo inspection, alongside desired and applied versions. Record blocked requests and comparison/infrastructure failures against the current intent. Clear obsolete request failure when the desired version changes, and clear it after successful or already-applied reconciliation. Do not repurpose chain halt state or halt admission for a failed promotion.
8. Transport or persistence failure leaves the applied base unchanged and retains alarm recovery. Restart reconstructs the operation from configured intent and durable state. Restart after a successful base commit but before alarm release observes equality and completes idempotently.
9. Blocked older versions and invalidated candidates do not retain a cutover alarm lease solely to repeat the same failed request. Other registered alarm work remains independent. Later activation with a different configured destination evaluates that request while preserving prior candidate invalidations.
10. Direct command retries and new base-selecting requests continue selecting the applied base. Configured intent alone cannot redirect them before promotion succeeds. Preserve existing frontend snapshot and stream version binding.

### API and documentation cutover

1. Remove `SystemApi.cutoverAggregateVersion`, its failure counterpart, and AC's public destination-taking `cutover` RPC. Retain the named cutover Effect as local recovery behavior, update in-scope callers and typechecks, and add no replacement manual promotion endpoint.
2. Keep service-version cutover unchanged. Do not add service base settings as an incidental extension.
3. During implementation, update affected architecture, glossary, configuration examples, and local guidance to describe configuration-owned intent, activation-triggered checking, and the removal of manual aggregate promotion. Reconcile conflicting aggregate-cutover development documentation in the same implementation pass.
4. Apply the pre-release hard cutover. Update configuration consumers and fixed schemas without compatibility fields, alternate loaders, migrations, or fallback decoders. Changed fixed schemas require empty storage; this design does not authorize resetting existing local, shared, or remote state.

## Testing Decisions

1. Extend existing suites rather than introducing a dedicated acceptance harness. Preserve the previously agreed Workerd version-feed/recovery and cutover transaction seams, and use Spec 074's shared configuration fixture for the relocated configuration contract.
2. Extend configuration-loading and shared CLI/Worker tests for required aggregate entries, exact aggregate names, supported current/historical versions, immutable settings, original System identity, and seed laziness. Verify the Worker sees the same configuration through the generated entry, including cleanup on success, failure, and interruption.
3. Verify that changing only configured base versions leaves the serialized System spec unchanged and does not create an immutable-spec conflict or new system-version entry. Existing tests continue enforcing a version bump for an actual changed System spec.
4. Extend AC activation tests for historical initial bases, preserved existing applied state, refreshed desired intent, and recovery scheduling without executing materializer comparison inside the activation gate. A feed replay must not replace configured intent.
5. Extend existing Workerd activation and version-feed/recovery scenarios for candidate enrollment without promotion, automatic checked promotion after activating under changed configuration, empty-history behavior without materializer activation, and direct v1-to-v3 promotion after skipped configurations. Config-only scenarios must keep the same authored System spec.
6. Extend the existing cutover transaction tests for superseded desired state during flushing, concurrent admissions, divergence, older-base blocking, invalidated destinations, and failure writes that cannot overwrite a newer request. Retain strict disposition comparison coverage, including different replica observations producing different guard outcomes.
7. Exercise restart after intent commit, during comparison, and after promotion commit before alarm release. Verify durable desired/applied state, retained recovery for infrastructure failures, no repeated flushing for blocked requests, and unchanged direct-request routing until successful promotion.
8. Inspect desired/applied state and failures through existing Repo inspection. Verify removal of manual aggregate cutover surfaces and run relevant Nx runtime tests and ordinary affected workspace checks. Add no CLI typecheck gate, new compile-time assertion suite, or full Shopping e2e requirement for this change.

## Out of Scope

1. Implementation in this spec-writing pass, an implementation plan, or changes to unrelated WIP.
2. Service promotion policy, automatic seeding, or seed lifecycle changes.
3. A configuration feed, live reload of configuration in an already-running instance, system-wide atomic promotion, deployment coordination, or rollback.
4. New operator RPCs, a dedicated promotion UI, or a new telemetry subsystem.
5. Changes to disposition comparison, command admission, frontend version binding, or candidate invalidation's existing effect on explicit pull-based catch-up.
6. Storage resets, compatibility support, vendor changes, and unrelated cleanup.

## Further Notes

1. This spec builds on [Spec 074: typed system configuration](../specs/074-spec-typed-system-config.md). Its number is 075 because 074 is already allocated to that work.
2. This supersedes the earlier chat proposal to put `canonical` on authored aggregates, serialize promotion intent into System specs, and drive intent changes from feed receipt. Required explicit settings, checked promotion, forward-only behavior, skipping intermediate destinations, manual-RPC removal, and the agreed existing test seams remain intact.
3. The relevant current architecture is [Authored System and Static Worker](../../architecture/AuthoredSystem.md) and [Command Chains and Materialization](../../architecture/server/admitCommands.md). This document specifies their proposed change; it does not claim automatic cutover is already implemented.
