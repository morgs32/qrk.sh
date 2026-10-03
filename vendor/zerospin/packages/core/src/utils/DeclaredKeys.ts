/** Authored keys, excluding broad index signatures used for runtime lookup. */
export type DeclaredKeys<DECLARATION> = keyof {
  [KEY in keyof DECLARATION as string extends KEY
    ? never
    : number extends KEY
      ? never
      : KEY]: DECLARATION[KEY];
};
