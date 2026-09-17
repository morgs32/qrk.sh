function assertKebabCaseId(id: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error(`defineModule: id must be kebab-case; got ${JSON.stringify(id)}`);
  }
}

/** Module identity: stable kebab id, label, and description. */
export function defineModule<const MODULE extends string>(props: {
  id: MODULE;
  label: string;
  description: string;
}) {
  assertKebabCaseId(props.id);
  return {
    id: props.id,
    label: props.label,
    description: props.description,
  };
}
