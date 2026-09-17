function assertKebabCaseId(id: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error(`defineModule: id must be kebab-case; got ${JSON.stringify(id)}`);
  }
}

/** Module identity: stable kebab id, Zerospin abbreviation, label, and description. */
export function defineModule<const MODULE extends string, const ABBREVIATION extends string>(props: {
  id: MODULE;
  abbreviation: ABBREVIATION;
  label: string;
  description: string;
}) {
  assertKebabCaseId(props.id);
  return {
    id: props.id,
    abbreviation: props.abbreviation,
    label: props.label,
    description: props.description,
  };
}
