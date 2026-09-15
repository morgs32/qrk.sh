export function makeBrickKey(props: { catalogName: string; registry: string }) {
  return `${props.catalogName}-${props.registry}`;
}
