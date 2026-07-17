/**
 * Add literal generics to base interface — do not bolt fields with intersection return types.
 *
 * @bad `ISystem<...> & { name: SYSTEM_NAME }` on makeSystem return when SYSTEM_NAME is already generic.
 */
export type ISystem<
  SYSTEM_ID extends string = string,
  SYSTEM_NAME extends string = string,
> = {
  id: SYSTEM_ID;
  name: SYSTEM_NAME;
};

declare function makeSystem<
  SYSTEM_ID extends string,
  SYSTEM_NAME extends string,
>(props: { id: SYSTEM_ID; name: SYSTEM_NAME }): ISystem<SYSTEM_ID, SYSTEM_NAME>;

export const shoppingSystem = makeSystem({
  id: 'sys_shopping' as const,
  name: 'shopping' as const,
});
