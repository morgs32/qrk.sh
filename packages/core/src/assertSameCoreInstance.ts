/** Explain a foreign Zerospin declaration without accepting it across copies. */
export function assertSameCoreInstance(props: {
  value: unknown;
  expected: new () => object;
  kind: 'Contract' | 'Model';
}): void {
  const { value, expected, kind } = props;
  if (
    value instanceof expected ||
    typeof value !== 'object' ||
    value === null ||
    !Object.hasOwn(value, Symbol.for(`@zerospin/core/${kind}`))
  ) {
    return;
  }

  const name =
    kind === 'Contract'
      ? 'commandName' in value
        ? value.commandName
        : undefined
      : 'modelName' in value
        ? value.modelName
        : undefined;
  const declaration =
    typeof name === 'string' ? ` ${kind} "${name}"` : ` ${kind}`;
  throw new Error(
    `Multiple copies of @zerospin/core are loaded:${declaration} was created by another copy. ` +
      'Check bundling and package resolution so all Zerospin imports use one instance.',
  );
}
