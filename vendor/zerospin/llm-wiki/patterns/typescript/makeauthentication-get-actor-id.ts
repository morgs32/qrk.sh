import { Effect, Schema } from 'effect';

/**
 * Put getActorId on makeAuthentication property; share models map — no hand-annotated IGetActorId export.
 *
 * @bad Separate getShoppingActorId file with manual IGetActorId annotation.
 * @bad Duplicate model maps or hand-written signature type instead of SIGNATURE_SCHEMA.
 */
export const shoppingAuthenticationSignature = Schema.Struct({
  accessToken: Schema.String,
});

export const shoppingAuthentication = makeAuthentication({
  models,
  actor: 'user',
  signature: shoppingAuthenticationSignature,
  getActorId: props =>
    Effect.fn('getShoppingActorId')(function* () {
      const { signature, db } = props;
      const row = db.query.user
        .findFirst({ where: { accessToken: signature.accessToken } })
        .sync();
      return row.id;
    }),
});

declare const models: { user: unknown };
declare function makeAuthentication(props: unknown): unknown;
