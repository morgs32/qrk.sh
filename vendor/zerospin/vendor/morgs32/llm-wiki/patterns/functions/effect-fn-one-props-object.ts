import { Effect } from 'effect';

/**
 * Effect.fn generators take one props object.
 *
 * @bad Multiple positional args: `(system, commandName, payload)`.
 * @bad File-local `IProps` / `Props` alias used only once — inline on the parameter.
 */
export const makeCommand = Effect.fn('makeCommand')(function* <
  CONTRACTS,
  COMMAND_NAME extends string,
>(props: {
  systemProps: { id: string; contracts?: CONTRACTS };
  commandName: COMMAND_NAME & string;
  payload: CONTRACTS[COMMAND_NAME]['_command']['payload'];
}) {
  const { systemProps, commandName, payload } = props;
  const contract = systemProps.contracts?.[commandName];
  return { contract, payload };
});

/**
 * @bad Wrapping a single obvious value in a props object when one positional arg is clearer.
 */
export const resolveApiCall = (promise: Promise<unknown>) =>
  Effect.promise(() => promise);
