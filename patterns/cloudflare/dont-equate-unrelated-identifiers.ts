import { Effect } from 'effect';

declare function authorizePublicSystemAccess(props: {
  organizationId: string;
  systemId: string;
}): Effect.Effect<void, unknown, never>;

/**
 * Keep one meaning per identifier — do not compare unrelated id spaces because field names look similar.
 *
 * @bad `if (validated.systemName !== this.systemId)` when `systemName` is a display label and `systemId` is a DB id.
 * @bad String-comparing mismatched concepts instead of aligning the contract field names.
 */
export const authorizeDeploy = Effect.fn('authorizeDeploy')(function* (props: {
  organizationId: string;
  validated: { systemId: string };
}) {
  const { organizationId, validated } = props;

  yield* authorizePublicSystemAccess({
    organizationId,
    systemId: validated.systemId,
  });
});
