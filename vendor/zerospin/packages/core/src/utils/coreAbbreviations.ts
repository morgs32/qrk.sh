/**
 * Core cursor, entity, and Durable Object repo-name prefixes.
 * Cloud-admin ids live in `cloudIdAbbreviations`.
 */
export const coreAbbreviations = {
  stagedCursor: 'stcur',
  pushedCursor: 'pcur',
  serviceCursor: 'svcur',
  accountCursor: 'acur',
  authorizationAttemptCursor: 'atzcur',
  account: 'acct',
  actor: 'actr',
  systemRepo: 'sysrepo',
  accountRepo: 'acctrepo',
  authorizationRepo: 'atzrepo',
  actorRepo: 'actrrepo',
  frontendRepo: 'frtrepo',
  serviceRepo: 'svcrepo',
  accountBlockRepo: 'acctbrepo',
  actorBlockRepo: 'actrbrepo',
  frontendBlockRepo: 'frtbrepo',
  serviceBlockRepo: 'svcbrepo',
  systemLogRepo: 'syslogrepo',
} as const;
