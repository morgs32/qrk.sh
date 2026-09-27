# Domain module browser fixture

`src/userSession.ts` composes the purchase and fulfillment browser factories through `modules: { purchase, fulfillment }` on a direct named `makeSession` export. It checks that their real declarations attach through the public constructor, including a pinned fulfillment replica, persisted operation instances, and public checkout/Pack/Ship commands. The `ts` target is a compile-time contract fixture; it does not start a browser session.

Run `pnpm nx run domain-modules-fixture:ts` after changing the browser factory or session types.
