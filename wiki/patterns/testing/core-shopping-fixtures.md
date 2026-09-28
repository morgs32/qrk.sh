# Core shopping fixtures

Use the lightweight cart example in `@zerospin/core/fixtures/shopping` for shared core and browser test scenarios. It contains one cart aggregate, cart items, and add/change-quantity/remove contracts. Keep checkout, payments, fulfillment, and Worker infrastructure out of this example.

Import the in-memory Node/SQLite harness separately from `@zerospin/core/fixtures/nodeFixture`. Only Node tests import that harness; production browser modules must not pull in `node:sqlite`. Import symbols directly from their defining module, without fixture barrels or compatibility re-exports.

Reuse the example where it fits. Keep socket mocks, authentication responders, malformed inputs, and assertion-specific setup beside the tests that need them. Do not expand the shared example to accommodate every specialized scenario.

Core owns Node storage and its storage tests. Browser owns IndexedDB, networking, authentication coordination, synchronization, and their tests. Core must never depend on `@zerospin/fixtures`; shared integration fixtures may depend on core. Do not recreate package cycles through test helpers.
