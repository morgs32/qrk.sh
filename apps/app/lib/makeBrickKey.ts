export function makeBrickKey(props: { collectionName: string; variant: string; layout: string }) {
  return `${props.collectionName}-${props.variant}-${props.layout}`;
}
