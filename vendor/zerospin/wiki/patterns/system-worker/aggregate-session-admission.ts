/**
 * The live ActorVAC socket sends the complete local occurrence to AAVR. AAVR
 * durably stages prepared operations against a derived optimistic actor view,
 * then its actor-owned outbox submits the same stable command to AC. The socket
 * waits for the saved AC admission result before returning the existing
 * aggregateCommandAdmission response. Browser optimism remains pending until
 * terminal ActorVAC output or a published snapshot resolves the command.
 * Contract and actor guards belong to AAVR staging; AVR runs aggregate guards
 * against authoritative state. AAVR resources and snapshot cursors stay
 * authoritative while pending optimism is rebuilt from saved operations.
 *
 * @bad Treat an admission receipt as an authoritative resource delta.
 * @bad Persist optimistic resource rows or overwrite newer confirmed rows.
 * @bad Rerun automation programs or mutation preparation during outbox retry.
 * @bad Resolve browser optimism before terminal output or published snapshot.
 */
export {};
