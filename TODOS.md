# Todos

- Audit the block paths after they settle: AccountRepo → AccountBlockRepo → ActorRepo → ActorBlockRepo → FrontendRepo, ServiceRepo → singleton ServiceBlockRepo → FrontendRepo, and FrontendRepo → FrontendBlockRepo.
- Add some abstractions so that the Worker files in all the examples are simpler.
- Create our own simpler version of IEitherEncoded
- When we upgrade Node from 24, let's look to see if we can get rid of the tslib dependency.
