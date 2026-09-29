# Machine declarations

`makeState` defines a schema-bearing State. `makeMachine` binds States and routes to one authored aggregate or service source version, selected source models, and the contracts its commands may call. A System registers machines by name; the source version is a pin, separate from the machine owner's identity.

A route can react to a source command and can choose one automatic work form: an absolute `wakeAt` deadline with `onWake`, `onActivation`, or a frozen `push` or `execute` command with `onResult`. `onBootstrap` establishes the first State, and `onVersionChange` may replace it when the source pin changes. State names and returned values are validated against their declared schemas.

The durable execution, selected projection, operation record, and recovery behavior live in [System Worker's machine repository](../../../system-worker/src/makeMachineRepo/README.md).
