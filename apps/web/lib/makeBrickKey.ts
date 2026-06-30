export function makeBrickKey(props: { collectionName: string; brickName: string }) {
  return `${props.collectionName}-${props.brickName}`;
}
