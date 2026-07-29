# Todos

- Audit the block paths after they settle: AccountRepo → AccountBlockRepo → ActorRepo → ActorBlockRepo → FrontendRepo → FrontendBlockRepo; ServiceRepo → singleton ServiceBlockRepo → account FrontendRepo; and ServiceRepo → singleton ServiceBlockRepo → actor-specific ServiceFrontendRepo → ServiceFrontendBlockRepo.
- Design safe archive compaction, retained-snapshot floors, subscriber/replica garbage collection, and old frontend-version VFS cleanup after the continuous-lineage and staged-command-journal implementation has shipped.
- Add explicit operator export, recovery, and reset tooling for a corrupt account staged-command journal or a legacy account replica that may contain the only durable copy of unpushed commands.
- Add some abstractions so that the Worker files in all the examples are simpler.
- Create our own simpler version of IEitherEncoded
- When we upgrade Node from 24, let's look to see if we can get rid of the tslib dependency.
