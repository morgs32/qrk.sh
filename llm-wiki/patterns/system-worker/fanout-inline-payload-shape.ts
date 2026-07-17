import { Schema } from 'effect/Schema';

/**
 * Fanout modules inline `payloadShape` on `makeFanoutRepo`; use `Schema.Date` on JSON wire dates.
 *
 * @bad Export sibling `*Json` descriptors for fanout encode-decode.
 * @bad Create full-payload JSON descriptors like `accountFanoutPayloadJson`.
 * @bad Use row-oriented `makeEffectSchema` with `primitives.date()` for JSON wire dates.
 * @bad Re-parse fanout payload JSON in subscribers with `Schema.parseJson`.
 */
export const FinalizationEventFanout = makeFanoutRepo({
  payloadShape: {
    accountId: primitives.text(),
    accountName: primitives.text(),
    executedCommands: primitives.json({
      schema: Schema.Array(
        Schema.Struct({
          executedAt: Schema.Date,
          commandName: Schema.String,
          payload: Schema.String,
        }),
      ),
    }),
    appliedMutations: primitives.json({
      schema: Schema.Array(Schema.Unknown),
    }),
  },
  subscriberMap: {},
});

declare function makeFanoutRepo(props: {
  payloadShape: Record<string, unknown>;
  subscriberMap: Record<string, unknown>;
}): {
  payloadShape: Record<string, unknown>;
};

declare const primitives: {
  text: () => unknown;
  json: (props: { schema: unknown }) => unknown;
};

declare const FrontendDeltaPayloadSchema: unknown;

export const FrontendDeltaFanout = makeFanoutRepo({
  payloadShape: {
    accountId: primitives.text(),
    delta: primitives.json({ schema: FrontendDeltaPayloadSchema }),
  },
  subscriberMap: {},
});
