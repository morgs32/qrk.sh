/**
 * Destructure props once at the top of the function.
 *
 * @bad Chain property access directly off `props` through the whole body.
 */
export async function buildSessionName(props: {
  actorId: string;
  frontendId: string;
  systemName: string;
}) {
  const { actorId, frontendId, systemName } = props;
  return `${actorId}/${frontendId}/${systemName}`;
}
