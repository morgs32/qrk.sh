export function makeBrickKey(props: { collectionName: string; variant: string; size: string }) {
  return `${props.collectionName}-${props.variant}-${props.size}`;
}
