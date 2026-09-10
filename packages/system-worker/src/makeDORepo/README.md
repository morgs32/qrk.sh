# makeDORepo

The common Durable Object Repo base owns identity resolution, database startup,
activation, and alarm dispatch. Production Repos use it through
[`makeFixedDORepo`](../makeFixedDORepo/makeFixedDORepo.ts); the evolving-schema
sibling is [`makeVersionedDORepo`](../makeVersionedDORepo/makeVersionedDORepo.ts).

## Construction and activation

The [constructor](./makeDORepo.ts) creates `alarmRegistry` before derived fields
initialize, then resolves the physical name, parsed key, and database config.
`namespaceBinding` selects the DO namespace; `nameUtils` defines the physical
name/key contract. `getRepo({ key })` only resolves a stub. It does not initialize
the receiver or establish authorization.

Derived queue fields can register their lazy drains immediately. Registration
does not read database rows or start delivery. The constructor's concurrency
block defers startup until derived fields exist, then runs:

1. Serialize the executing Worker's aggregate and service definitions and call
   SystemRepo's `registerRepo({ registration, spec })`. Every definition must
   match an existing immutable lock before registration succeeds. SystemRepo
   does not register with itself.
2. Enable SQLite foreign keys and apply the selected schema policy. Fixed Repos
   provision only an unmarked database; versioned Repos apply migrations.
3. Bootstrap when required, recording `_isBootstrapped` only after success.
4. The Repo's named `onDOActivation()` Effect.

Registration means a known instance with accepted definitions; it remains if
subsequent provisioning, bootstrap, or subscription fails. Rejection touches no
Repo storage, schema, marker, or subscription. Cold reopen and alarm-driven
activation run the same guard, including when the bootstrap marker exists.
The calling Worker supplies the candidate spec: SystemRepo may be assigned to
an incumbent Worker version during production preflight.

[`SystemApi.checkSystemSpec`](../SystemApi/checkSystemSpec/checkSystemSpec.ts)
accepts the executing bundle first. Development does this on initial load and
every reload; production does it before promoting an uploaded candidate.
[`checkSystemSpec`](../SystemRepo/checkSystemSpec/checkSystemSpec.ts) atomically
retains aggregate/service locks across removal and reintroduction. Framework
physical schema changes and executable bodies are outside those locks and
still require the appropriate fresh storage when schemas change.

Incoming events, including `ready()` and alarms, wait for that block. A successful
bootstrap marker does not skip activation on a cold reopen. See the
[lifecycle tests](../makeFixedDORepo/makeFixedDORepo.workerd.spec.ts) for derived
fields, bootstrap failures, activation failures, and cold alarm ordering.

## Subscriptions belong to activation

`onDOActivation()` initializes local subscription state and awaits
`subscriber.subscribe()`. That method **catches up first, then enrolls** at the
receiver's durable cursor. This is a startup prerequisite, not alarm work.
Explicit reads may subsequently call `catchup(index?)` without subscribing again.

AC initializes its base/feed cursor and subscribes to SystemRepo's version
feed. VAR and UVAR select the aggregate snapshot using their physical
`aggregateName` and `aggregateVersion`; that snapshot already declares every
service dependency in `aggregate.services`. For each service target,
`systemId` comes from the Repo key, while `serviceName` and `serviceVersion` come
from the selected authored snapshot.

Activation inserts missing `services` rows with `lastIndex: 0` and preserves existing
progress. Service pins stay in the selected definition. A later command can insert
a replica row with its own `serviceIndex` without discovering
a new service or rewinding the feed cursor. Service list order does not change an aggregate's authored pin. VAR does not
subscribe itself to AC, and VSR does not subscribe itself to SAC: each chain
reconciles its admitted-command destinations from the deployed version list.

- [AC activation](../AggregateChain/onDOActivation/onDOActivation.ts)
- [VAR activation](../VersionedAggregateRepo/onDOActivation/onDOActivation.ts)
- [SAC activation](../ServiceAdmittedChain/onDOActivation/onDOActivation.ts)
- [FVSR activation](../FrontendVersionedServiceRepo/onDOActivation/onDOActivation.ts)
- [UVAR activation](../UserVersionedAggregateRepo/onDOActivation/onDOActivation.ts)
- [Declared-source and restart tests](../UserVersionedAggregateRepo/UserVersionedAggregateRepo.workerd.spec.ts)
- [Pinned service replication tests](../pinnedServiceReplicas.workerd.spec.ts)

The activation gate is held during subscription, but **execution permits and
database transactions must not span its remote paging or enrollment calls**.
Local receipt needs those execution permits. Source enrollment must also be
independent of source delivery's semaphore; otherwise a source draining to a
cold receiver can wait on the receiver that is subscribing back to it. The
[fanout README](../makeFanoutQueue/README.md) explains that cycle.

## Failure and restart

Typed subscription failures and transport rejections fail activation; the base
does not encode a successful startup or defer the failed subscription to an
alarm. A subsequent activation retries from committed cursors without repeating
successful bootstrap. Catch-up can therefore resume after a partially committed
page sequence. [Subscriber tests](../makeFanoutSubscriber/makeFanoutSubscriber.node.spec.ts)
cover that handoff and failure behavior.

This does not change the caller's failure policy. In particular, a fanout source
can retain a terminal subscriber failure when an activating receiver rejects;
re-enrollment never clears that failure. There is no autonomous subscription
retry alarm. Cloudflare also limits the constructor concurrency block to
30 seconds; a timed-out activation is reset rather than marked ready.
[Cloudflare state API](https://developers.cloudflare.com/durable-objects/api/state/#blockconcurrencywhile)

## Alarms and delivery

Each Repo inherits one `alarmRegistry` and `alarm(): Promise<void>`. Queue
factories register their drains under their queue names. There is no per-Repo
alarm override, domain subscription-recovery callback, or DOConfig alarm hook.
The registry is local to one DO instance; its names distinguish operations
within that instance, not different Repos.

Every alarm runs every registered operation against durable state, including
after reconstruction with no in-memory leases. Operations run concurrently;
each outcome is captured so a failure does not cancel siblings. The alarm waits
for all outcomes and propagates combined failures through the configured runtime
without `encodeRpc`. A custom superclass's bound `alarm()` is registered too,
preserving PartyServer initialization and `onAlarm()` behavior.

Queues hold their leases during drains and release them when their work settles.
Producers must also retain the appropriate queue wakeup before committing pending
delivery: a crash between commit and starting `drain()` must not strand work.
Releasing one queue's lease must not remove another queue's wakeup.

See [the registry](../makeAlarmRegistry/makeAlarmRegistry.ts),
[registry tests](../makeAlarmRegistry/makeAlarmRegistry.node.spec.ts), and the
[architecture workflow](../../../../wiki/architecture/AuthoredSystem.md).
