declare function auth(): Promise<{ userId: string | null }>;

/**
 * Await framework promises (`params`, `auth`) in the default export — not via `Effect.tryPromise` at the route boundary.
 *
 * @bad Treating `params` like domain I/O with `Effect.tryPromise` just to invent a domain error.
 */
export default async function DashboardPage(props: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await props.params;
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  return `<div>${organizationId} - ${userId}</div>`;
}
