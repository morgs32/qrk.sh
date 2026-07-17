import { Effect } from 'effect';
import { Schema } from 'effect/Schema';

/**
 * Trust-boundary validation lives in *Api — not SystemWorker or *Repo DOs.
 *
 * @bad Validate the same wire props again in SystemWorker after
 * ZerospinApis.getFrontendApi decoded them.
 * @bad Run `Schema.decodeUnknown` on signature inside a repo DO when the
 * FrontendApi capability already validated it.
 */
export const getFrontendApi = Effect.fn('ZerospinApis.getFrontendApi')(function* (
  props: unknown,
) {
  const validated = yield* Schema.validate(FrontendApiPropsSchema)(props, {
    onExcessProperty: 'ignore',
  }).pipe(mapParseError({ code: 'frontend-api-props-invalid' }));

  return frontendApiFactory(validated);
});

export class SystemWorker {
  getActorId(props: { actorName: string; signature: unknown }) {
    const { signature, actorName } = props;
    return getFrontendRepo().getActorId({
      actorName,
      signature,
      getActorIdCallbackApi,
    });
  }
}

declare const FrontendApiPropsSchema: unknown;
declare function mapParseError(props: {
  code: string;
}): (effect: unknown) => unknown;
declare function frontendApiFactory(props: unknown): unknown;
declare function getFrontendRepo(): {
  getActorId: (props: unknown) => Promise<unknown>;
};
declare const getActorIdCallbackApi: unknown;
