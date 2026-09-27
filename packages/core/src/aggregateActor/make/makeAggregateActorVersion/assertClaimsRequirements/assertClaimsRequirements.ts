import { SchemaAST, type Schema } from 'effect';

/** Check required claim names and primitive domains without evaluating a live caller. */
export function assertClaimsRequirements(
  supplied: Schema.Struct<
    Readonly<Record<string, Schema.Codec<unknown, unknown>>>
  >,
  required: Schema.Codec<unknown, unknown>,
): void {
  const requirement = SchemaAST.toType(required.ast);
  if (requirement._tag !== 'Objects') {
    throw new Error('Claims requirements must be an object schema');
  }
  for (const property of requirement.propertySignatures) {
    const field = supplied.fields[String(property.name)];
    if (field === undefined) {
      if (property.type.context?.isOptional) continue;
      throw new Error(`Actor cannot supply claim ${String(property.name)}`);
    }
    const actual = SchemaAST.toType(field.ast);
    const expected = SchemaAST.toType(property.type);
    const alternatives =
      expected._tag === 'Union' ? expected.types : [expected];
    const values = actual._tag === 'Union' ? actual.types : [actual];
    if (
      (actual.context?.isOptional && !expected.context?.isOptional) ||
      !values.every(value =>
        alternatives.some(
          candidate =>
            candidate._tag === 'Unknown' ||
            candidate._tag === 'Any' ||
            value === candidate ||
            (value._tag === 'Literal' &&
              candidate._tag === 'Literal' &&
              value.literal === candidate.literal) ||
            (candidate._tag === 'String' &&
              (value._tag === 'String' ||
                (value._tag === 'Literal' &&
                  typeof value.literal === 'string'))) ||
            (candidate._tag === 'Number' &&
              (value._tag === 'Number' ||
                (value._tag === 'Literal' &&
                  typeof value.literal === 'number'))) ||
            (candidate._tag === 'Boolean' &&
              (value._tag === 'Boolean' ||
                (value._tag === 'Literal' &&
                  typeof value.literal === 'boolean'))),
        ),
      )
    ) {
      throw new Error(`Incompatible claim ${String(property.name)}`);
    }
  }
}
