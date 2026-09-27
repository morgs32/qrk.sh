# Fixtures

Private, first-party fixture systems and test harnesses. Import a scenario directly
from `@zerospin/fixtures/<runtime-or-owner>/<module>`; there is no root barrel.

- `config`: the small compile-time configuration used by worker libraries.
- `core`: the core test system.
- `system-worker`: test systems, Durable Objects, worker entrypoint, and workerd setup.
- `sync`: sync test workers and Durable Objects.
- `browser`: Node storage fixtures and browser controls.
- `cli`: authored configuration, seed commands, and worker used by CLI tests.

Reusable valid and deliberately broken scenarios belong here. Assertion-specific
payloads, command sequences, expected rows, and small schemas that are themselves
the test subject stay beside their assertions. Public testing utilities remain in
their owning libraries; purchase and fulfillment remain independent packages.

## Compilation and runtime resolution

`config:lib` emits only `src/config` declarations. Production worker tsconfigs map
`config` to that source and reference `tsconfig.config.json`. Wrangler continues to
alias the runtime `config` import to the selected application's configuration.
Test runners instead alias it to their scenario system.

Production `lib` targets list production prerequisites explicitly, so fixture dev
dependencies cannot pull test systems or purchase/fulfillment into consumer builds.
Fixtures has no general `lib` target. Its separate `ts:node`, `ts:workerd`, `ts:sync`, and `ts:cli` targets check scenarios with their respective runtime globals. Tests and
runner configuration remain with the modules under test.

The project graph has test-only cycles: fixtures exercise libraries whose tests
consume fixtures. The explicit build prerequisites keep production task graphs
acyclic. Use the named Nx targets; whole-graph operations such as `nx exec` may
reject these project cycles.
