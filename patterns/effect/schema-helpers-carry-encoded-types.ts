import { Effect } from 'effect';
import { Schema } from 'effect/Schema';

interface IDecodedPatch {
  name?: string;
}

interface IEncodedPatch {
  name?: string;
}

declare const model: {
  attributesSchema: Schema.Schema<
    Record<string, unknown>,
    Record<string, unknown>
  >;
};

/**
 * Type the schema and let `Schema.encodeUnknown` infer the encoded output — do not cast away inference.
 *
 * @bad `(yield* Schema.encodeUnknown(partialSchema)(value)) as Record<string, unknown>`.
 */
const partialSchema: Schema.Schema<IDecodedPatch, IEncodedPatch> =
  Schema.partial(model.attributesSchema);

export const encodePatch = Effect.fn('encodePatch')(function* (props: {
  value: IDecodedPatch;
}) {
  const { value } = props;
  const properties = yield* Schema.encodeUnknown(partialSchema)(value);
  return properties;
});
