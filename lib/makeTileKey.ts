export function makeTileKey(props: { collectionName: string; tileName: string }) {
  return `${props.collectionName}-${props.tileName}`;
}
