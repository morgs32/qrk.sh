import { Schema } from "effect";

export const textPlacementStateSchema = Schema.Struct({
  fontFamily: Schema.Literals(["sans", "serif", "mono"]),
  fontSizePx: Schema.Finite.check(Schema.isGreaterThan(0)),
});

export const textDefaultPlacementState = Schema.decodeUnknownSync(textPlacementStateSchema)({
  fontFamily: "sans",
  fontSizePx: 16,
});
