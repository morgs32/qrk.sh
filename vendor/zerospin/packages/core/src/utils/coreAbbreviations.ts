/** Shared protocol, persisted entity, deployment, session, and command prefixes. */
export const coreAbbreviations = {
  stagedCursor: 'stcur',
  pushedCursor: 'pcur',
  serviceCursor: 'svcur',
  accountCursor: 'acur',
  account: 'acct',
  actor: 'actr',
  system: 'sys',
  deploy: 'dpl',
  generation: 'gen',
  session: 'sesn',
  command: 'cmd',
} as const;
