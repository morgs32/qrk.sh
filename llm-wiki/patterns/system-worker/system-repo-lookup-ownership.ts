/**
 * Route all SystemRepo DO lookups through `SystemRepo.getRepo()`.
 *
 * @bad Call `env.SYSTEM_REPO.getByName('systemRepo')` at feature call sites.
 */
export function loadRegisteredAccountIds() {
  const systemRepo = SystemRepo.getRepo();
  return systemRepo.getAccountIds();
}

declare const SystemRepo: {
  getRepo: () => { getAccountIds: () => Promise<readonly string[]> };
};
