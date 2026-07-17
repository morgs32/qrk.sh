import { Schema } from 'effect/Schema';

/**
 * Fanout `payloadShape` is a multi-field IShape — not a single json blob or envelope fields.
 *
 * @bad Single `primitives.json({ schema: Schema.Unknown })` for entire payload.
 * @bad Put `cursor` or `prevCursor` in `payloadShape` (reserved envelope fields).
 */
export const ParentFanout = makeFanoutRepo({
  keyShape: { scope: primitives.text(), name: primitives.text() },
  payloadShape: {
    value: primitives.text({ nullable: true }),
    maxFailures: primitives.number({ nullable: true }),
  },
  subscriberMap: {},
});

declare function makeFanoutRepo(props: {
  keyShape: Record<string, unknown>;
  payloadShape: Record<string, unknown>;
  subscriberMap: Record<string, unknown>;
}): { payloadShape: Record<string, unknown> };

declare const primitives: {
  text: (opts?: { nullable?: boolean }) => unknown;
  number: (opts?: { nullable?: boolean }) => unknown;
};

export const payloadSchema = makeEffectSchema(ParentFanout.payloadShape);

declare function makeEffectSchema(shape: unknown): unknown;
