/** Shared protocol, persisted entity, deployment, session, and command prefixes. */
export const coreAbbreviations = {
  stagedCursor: 'stcur',
  pushedCursor: 'pcur',
  serviceCursor: 'svcur',
  aggregateCursor: 'acur',
  aggregate: 'acct',
  system: 'sys',
  deploy: 'dpl',
  generation: 'gen',
  session: 'sesn',
  command: 'cmd',
} as const;
