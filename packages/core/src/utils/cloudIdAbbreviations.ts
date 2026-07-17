/**
 * Cloud-admin ID prefixes for `makeIdFromAbbreviation`.
 * Command/resource cursors use `coreAbbreviations` + `makeCursor`.
 * Per-app model abbreviations stay on the model spec; do not duplicate those here.
 */
export const cloudIdAbbreviations = {
  /** Clerk / org identifier tag (also shopping org model prefix). */
  organization: 'org',
  systemRecord: 'sys',
  deploy: 'dpl',
  generation: 'gen',
  defaultSession: 'sesn',
  command: 'cmd',
  finalizePushedRun: 'fbwr',
  publishFinalizedRun: 'pbwr',
  publishFinalizedSystemRun: 'pswr',
  fanoutAccountCommandsRun: 'pawr',
  systemProductionSecretKey: 'spsk',
  systemProductionPublishableKey: 'sppk',
  systemProductionKeyPair: 'spkp',
  userDevSecretKey: 'udsk',
  userDevPublishableKey: 'udpk',
  userDevKeyPair: 'udkp',
} as const;
