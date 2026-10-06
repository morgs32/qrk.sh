# Service actor version repository

This Durable Object projects complete service command results for one authored actor binding. It owns confirmed selected resources and a consumed `executedIndex`; the actor chain owns retained browser delivery history.

[Execution](execute/execute.ts) prepares locally retained owned operation bodies before [the transaction](execute/executeTx.ts) applies them in order. Projection replay applies retained operations without invoking the originating program. Resources, checkpoint, and a flat `IBrowserCommand` in `browserCommandOutbox` commit together. A failed page rolls back; already committed positions skip on redelivery.

The [repository](ServiceActorVersionRepo.ts) delivers pending browser commands to the bound actor chain. After durable receiver retention it deletes the acknowledged rows; the alarm resumes interrupted delivery. The chain’s `browserCommands` preserve private node outcomes, empty projection positions, and restart/reconnect history independently of this queue. Commands retain their existing `admission` and `execution` objects for the submitting Node/session/claims; other recipients receive null phase fields.

[Forwarding fixtures](../fixtures/commandForwarding.ts) verify local actor replay across original-owner types. [Actor delivery fixtures](../fixtures/actorDelivery.ts) verify private outcomes, repeated IDs, and contiguous browser history. Changed fixed schemas require empty storage.
