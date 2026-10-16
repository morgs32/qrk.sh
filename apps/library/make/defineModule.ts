function assertKebabCaseId(id: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error(`defineModule: id must be kebab-case; got ${JSON.stringify(id)}`);
  }
}

/** Module identity and optional page-wide brick limit. */
export function defineModule<
  const MODULE extends string,
  const ABBREVIATION extends string,
>(props: {
  id: MODULE;
  abbreviation: ABBREVIATION;
  label: string;
  description: string;
  maxPerPage?: number;
}) {
  const { id, abbreviation, label, description, maxPerPage } = props;
  assertKebabCaseId(id);
  if (maxPerPage !== undefined && (!Number.isInteger(maxPerPage) || maxPerPage < 1)) {
    throw new Error("defineModule: maxPerPage must be a positive integer");
  }
  return {
    id,
    abbreviation,
    label,
    description,
    maxPerPage,
  };
}
