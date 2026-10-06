import { makeZerospinError } from '@zerospin/error';
import { PrimitiveKind, type IEncodedShape } from '@zerospin/shapes';
import { Schema } from 'effect';

import { EncodedResourceSchema } from '../models/EncodedResourceSchema.ts';
import type { IEncodedResourceShape } from '../models/types.ts';

/** JSON journals encode dates; SQLite timestamp columns require Date values. */
export function decodeNodeResource(
  resource: Readonly<Record<string, unknown>>,
  properties: IEncodedShape,
): IEncodedResourceShape {
  const row: Record<string, unknown> = { ...resource };
  for (const [name, descriptor] of Object.entries(properties)) {
    if (descriptor.kind !== PrimitiveKind.Date || row[name] === null) continue;
    const value = row[name];
    const date = typeof value === 'string' ? new Date(value) : value;
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      throw makeZerospinError({ code: 'node-resource-date-invalid' });
    }
    row[name] = date;
  }
  return Schema.decodeUnknownSync(Schema.toType(EncodedResourceSchema))(row);
}
