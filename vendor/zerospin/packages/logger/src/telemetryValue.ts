import { Option, Schema } from 'effect';
import { toStringUnknown } from 'effect/Inspectable';

/** Diagnostics cannot make an otherwise settled RPC response unserializable. */
export const telemetryValue = (value: unknown): Schema.Json => {
  try {
    const json = Schema.decodeUnknownOption(Schema.Json)(value);
    return Option.isSome(json) ? json.value : toStringUnknown(value);
  } catch {
    return '[unserializable diagnostic]';
  }
};
