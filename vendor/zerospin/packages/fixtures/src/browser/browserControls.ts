import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
export function gameEntry() {
  const entry = [
    ...zerospinDevtoolsStore.getState().aggregateSessionsById.values(),
  ].find(entry => entry.session.definition.sessionName === 'gameSession');
  if (entry === undefined) throw new Error('Game session is not registered');
  return entry;
}
