export function makeBrickKey(props: { groupId: string; catalogId: string }) {
  return `${props.groupId}-${props.catalogId}`;
}
