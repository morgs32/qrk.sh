export function makeBrickKey(props: { groupName: string; catalog: string }) {
  return `${props.groupName}-${props.catalog}`;
}
