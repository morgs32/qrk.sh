import { isEqual } from 'es-toolkit';

/**
 * Assert frontend binding model tables against account models by modelName at the account factory boundary.
 *
 * @bad Do not compare only frontend binding model map keys; frontend bindings may key by frontend model names.
 * @bad Do not rely on type constraints only; erased controller maps still need a runtime spec check.
 * @bad Do not merge account, actor, and frontend binding models into one system-level map to hide drift.
 */
export function makeAccountController<
  ACCOUNT_MODELS extends Models,
  ACTOR_CONTROLLERS extends ActorControllers,
>(props: {
  actorControllers: ACTOR_CONTROLLERS;
  models: ACCOUNT_MODELS &
    AssertModelConsistency<ACCOUNT_MODELS, ACTOR_CONTROLLERS>;
}) {
  const { actorControllers, models } = props;

  for (const [actorName, actorController] of Object.entries(actorControllers)) {
    for (const [frontendName, frontendBinding] of Object.entries(
      actorController.frontends,
    )) {
      for (const [frontendModelKey, frontendModel] of Object.entries(
        frontendBinding.models,
      )) {
        const accountModel = models[frontendModel.modelName];
        if (accountModel === undefined) {
          throw new Error(
            `actorControllers.${actorName}.frontends.${frontendName}.models.${frontendModelKey} uses modelName "${frontendModel.modelName}" missing from account models`,
          );
        }

        if (!isEqual(accountModel.spec, frontendModel.spec)) {
          throw new Error(
            `actorControllers.${actorName}.frontends.${frontendName}.models.${frontendModelKey} must match account model "${frontendModel.modelName}"`,
          );
        }
      }
    }
  }

  return { actorControllers, models };
}

export type AssertModelConsistency<
  ACCOUNT_MODELS extends Models,
  ACTOR_CONTROLLERS extends ActorControllers,
> = {
  [ACTOR_KEY in keyof ACTOR_CONTROLLERS & string]: {
    [FRONTEND_KEY in keyof ACTOR_CONTROLLERS[ACTOR_KEY]['frontends'] &
      string]: {
      [FRONTEND_MODEL_KEY in keyof ACTOR_CONTROLLERS[ACTOR_KEY]['frontends'][FRONTEND_KEY]['models'] &
        string]: ACTOR_CONTROLLERS[ACTOR_KEY]['frontends'][FRONTEND_KEY]['models'][FRONTEND_MODEL_KEY] extends infer FRONTEND_MODEL extends
        Model
        ? FRONTEND_MODEL['modelName'] extends keyof ACCOUNT_MODELS & string
          ? ACCOUNT_MODELS[FRONTEND_MODEL['modelName']] extends FRONTEND_MODEL
            ? FRONTEND_MODEL extends ACCOUNT_MODELS[FRONTEND_MODEL['modelName']]
              ? ACCOUNT_MODELS
              : TypeError<'frontend binding model table must match account model table'>
            : TypeError<'frontend binding model table must match account model table'>
          : TypeError<'frontend binding model table must exist on account models'>
        : never;
    }[keyof ACTOR_CONTROLLERS[ACTOR_KEY]['frontends'][FRONTEND_KEY]['models'] &
      string];
  }[keyof ACTOR_CONTROLLERS[ACTOR_KEY]['frontends'] & string];
}[keyof ACTOR_CONTROLLERS & string] extends infer RESULT
  ? Exclude<RESULT, ACCOUNT_MODELS> extends never
    ? ACCOUNT_MODELS
    : Exclude<RESULT, ACCOUNT_MODELS>
  : never;

type Model<MODEL_NAME extends string = string> = {
  modelName: MODEL_NAME;
  spec: unknown;
};

type Models = Record<string, Model>;

type ActorControllers = Record<
  string,
  {
    frontends: Record<
      string,
      {
        models: Models;
      }
    >;
  }
>;

type TypeError<MESSAGE extends string> = {
  name: 'TypeError';
  message: MESSAGE;
};
