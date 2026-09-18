import { Brand } from 'effect';

/** A declared command name, shared by all of its contract versions. */
export type Command<NAME extends string = string> = NAME &
  Brand.Brand<'Command'>;

export function defineContract<const NAME extends string>(
  name: NAME,
): Command<NAME>;
export function defineContract(name: string): Command {
  return Brand.nominal<Command>()(name);
}
