/**
 * Destructure a props parameter once at the top, then use only those bindings.
 * Fold later destructures into the first declaration and pass explicit fields
 * to callees. Preserve nullable fallback semantics and nested parameter scopes.
 *
 * @bad A later `props.serviceVersion` read after the initial destructure.
 * @bad Passing `props` to a callee after that destructure.
 */
export function authorizeServiceFrontend(props: {
  service: { version: string };
  serviceVersion: string;
  actorName: string;
  actorVersion: string;
}) {
  const { service, serviceVersion, actorName, actorVersion } = props;
  if (service.version !== serviceVersion) throw new Error('Unexpected version');
  return resolveActor(service, { actorName, actorVersion });
}

declare function resolveActor(
  service: { version: string },
  identity: { actorName: string; actorVersion: string },
): unknown;
