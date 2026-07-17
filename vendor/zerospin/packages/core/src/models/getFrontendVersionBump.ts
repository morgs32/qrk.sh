import { isEqual, mapValues } from 'es-toolkit';

import type { IEncodedShape } from './encodeShape.ts';
import { PrimitiveKind } from './primitiveKind.ts';

export type IFrontendVersionBump = 'major' | 'minor';

/**
 * Decides the version bump needed to move a frontend from `encodedOrigin` to
 * `encodedDestination` by comparing encoded primitive descriptors directly.
 *
 * "Compatible" means every value written under `encodedOrigin` is still valid
 * under `encodedDestination`. Compatible structural change → 'minor',
 * breaking → 'major'. Json descriptor schemas must have identical
 * encoded JSON Schema metadata.
 */
export function getFrontendVersionBump(props: {
  encodedOrigin: IEncodedShape;
  encodedDestination: IEncodedShape;
}): IFrontendVersionBump {
  const { encodedOrigin, encodedDestination } = props;

  const originCompatibilityByField = mapValues(
    encodedOrigin,
    (originDescriptor, fieldName) => {
      const destinationDescriptor = encodedDestination[fieldName];
      // Removed field: origin data for it no longer fits anywhere.
      if (destinationDescriptor === undefined) {
        return false;
      }
      return destinationAcceptsOrigin({
        originDescriptor,
        destinationDescriptor,
      });
    },
  );
  if (Object.values(originCompatibilityByField).includes(false)) {
    return 'major';
  }

  const destinationCompatibilityByField = mapValues(
    encodedDestination,
    (destinationDescriptor, fieldName) => {
      if (fieldName in encodedOrigin) {
        return true;
      }
      // Only nullable properties can be added compatibly. A default does not
      // change the persisted mutation/resource shape's required membership.
      return destinationDescriptor.nullable;
    },
  );
  if (Object.values(destinationCompatibilityByField).includes(false)) {
    return 'major';
  }

  return 'minor';
}

/** True when every value valid for `originDescriptor` is valid for `destinationDescriptor`. */
function destinationAcceptsOrigin(props: {
  originDescriptor: IEncodedShape[string];
  destinationDescriptor: IEncodedShape[string];
}): boolean {
  const { originDescriptor, destinationDescriptor } = props;

  if (originDescriptor.kind !== destinationDescriptor.kind) {
    return false;
  }

  if (originDescriptor.nullable && !destinationDescriptor.nullable) {
    return false;
  }

  if (
    'unique' in originDescriptor &&
    'unique' in destinationDescriptor &&
    !originDescriptor.unique &&
    destinationDescriptor.unique
  ) {
    return false;
  }

  if (
    originDescriptor.kind === PrimitiveKind.Json &&
    destinationDescriptor.kind === PrimitiveKind.Json
  ) {
    return isEqual(originDescriptor.schema, destinationDescriptor.schema);
  }

  if (
    (originDescriptor.kind === PrimitiveKind.Boolean ||
      originDescriptor.kind === PrimitiveKind.Integer ||
      originDescriptor.kind === PrimitiveKind.Number ||
      originDescriptor.kind === PrimitiveKind.Text ||
      originDescriptor.kind === PrimitiveKind.Date ||
      originDescriptor.kind === PrimitiveKind.Enum) &&
    (destinationDescriptor.kind === PrimitiveKind.Boolean ||
      destinationDescriptor.kind === PrimitiveKind.Integer ||
      destinationDescriptor.kind === PrimitiveKind.Number ||
      destinationDescriptor.kind === PrimitiveKind.Text ||
      destinationDescriptor.kind === PrimitiveKind.Date ||
      destinationDescriptor.kind === PrimitiveKind.Enum) &&
    originDescriptor.defaultValue !== undefined &&
    destinationDescriptor.defaultValue === undefined
  ) {
    return false;
  }

  if (
    originDescriptor.kind === PrimitiveKind.Enum &&
    destinationDescriptor.kind === PrimitiveKind.Enum
  ) {
    return originDescriptor.values.every(value =>
      destinationDescriptor.values.includes(value),
    );
  }

  if (
    originDescriptor.kind === PrimitiveKind.Ref &&
    destinationDescriptor.kind === PrimitiveKind.Ref
  ) {
    return (
      originDescriptor.abbreviation === destinationDescriptor.abbreviation &&
      originDescriptor.targetTableName ===
        destinationDescriptor.targetTableName &&
      originDescriptor.targetColumnName ===
        destinationDescriptor.targetColumnName &&
      originDescriptor.relation === destinationDescriptor.relation &&
      originDescriptor.inverse === destinationDescriptor.inverse
    );
  }

  // Opaque ID kinds encode as `${abbreviation}_${string}`, so a changed
  // abbreviation invalidates every stored value.
  if ('abbreviation' in originDescriptor) {
    return (
      'abbreviation' in destinationDescriptor &&
      originDescriptor.abbreviation === destinationDescriptor.abbreviation
    );
  }

  return true;
}
