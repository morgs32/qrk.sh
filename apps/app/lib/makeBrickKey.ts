export function makeBrickKey(props: { catalogName: string; content: string; view: string }) {
  return `${props.catalogName}-${props.content}-${props.view}`;
}
