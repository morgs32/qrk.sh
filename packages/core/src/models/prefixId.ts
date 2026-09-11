export const prefixId = <const ABBREVIATION extends string>(
  model: Readonly<{ abbreviation: ABBREVIATION }>,
  suffix: string,
): `${ABBREVIATION}_${string}` => {
  const prefix = `${model.abbreviation}_`;
  if (suffix.startsWith(prefix)) {
    throw new Error(`ID suffix already starts with "${prefix}"`);
  }
  return `${model.abbreviation}_${suffix}`;
};
