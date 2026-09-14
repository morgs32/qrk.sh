export function makeBrickKey(props: { collectionName: string; content: string; view: string }) {
  return `${props.collectionName}-${props.content}-${props.view}`;
}
