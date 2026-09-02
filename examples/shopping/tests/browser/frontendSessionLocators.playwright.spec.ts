import { describe, expect, it } from 'vitest';

describe('frontend session locators', () => {
  it('keeps authentication locators exact-target scoped and replaces the selected session atomically', () => {
    const firstAuthenticationKey = `zerospin:authentication:${JSON.stringify({
      apiUrl: 'http://127.0.0.1:3035/',
      publishableKey: 'pk_test',
      systemName: 'shopping',
      authenticationLock: { clerkUserId: 'browser-user-a' },
    })}`;
    const secondAuthenticationKey = `zerospin:authentication:${JSON.stringify({
      apiUrl: 'http://127.0.0.1:3035/',
      publishableKey: 'pk_test',
      systemName: 'shopping',
      authenticationLock: { clerkUserId: 'browser-user-b' },
    })}`;
    const aggregateSessionKey = `zerospin:frontend-session:${'a'.repeat(64)}`;
    const serviceSessionKey = `zerospin:frontend-session:${'b'.repeat(64)}`;

    try {
      globalThis.localStorage.setItem(
        firstAuthenticationKey,
        JSON.stringify({ systemId: 'sys_shopping', userId: 'browser-user-a' }),
      );
      globalThis.localStorage.setItem(
        secondAuthenticationKey,
        JSON.stringify({ systemId: 'sys_shopping', userId: 'browser-user-b' }),
      );
      globalThis.localStorage.setItem(aggregateSessionKey, 'sesn_first');
      globalThis.localStorage.setItem(serviceSessionKey, 'sesn_service');
      globalThis.localStorage.setItem(aggregateSessionKey, 'sesn_second');

      expect(globalThis.localStorage.getItem(firstAuthenticationKey)).toBe(
        JSON.stringify({ systemId: 'sys_shopping', userId: 'browser-user-a' }),
      );
      expect(globalThis.localStorage.getItem(secondAuthenticationKey)).toBe(
        JSON.stringify({ systemId: 'sys_shopping', userId: 'browser-user-b' }),
      );
      expect(globalThis.localStorage.getItem(aggregateSessionKey)).toBe(
        'sesn_second',
      );
      expect(globalThis.localStorage.getItem(serviceSessionKey)).toBe(
        'sesn_service',
      );
    } finally {
      globalThis.localStorage.removeItem(firstAuthenticationKey);
      globalThis.localStorage.removeItem(secondAuthenticationKey);
      globalThis.localStorage.removeItem(aggregateSessionKey);
      globalThis.localStorage.removeItem(serviceSessionKey);
    }
  });

  it('delivers a storage event only to another document while retaining the written value', () => {
    const key = `zerospin:frontend-session:${'c'.repeat(64)}`;
    const events: StorageEvent[] = [];
    const listener = (event: StorageEvent) => events.push(event);

    globalThis.addEventListener('storage', listener);
    try {
      globalThis.localStorage.setItem(key, 'sesn_current');
      expect(globalThis.localStorage.getItem(key)).toBe('sesn_current');
      expect(events).toEqual([]);

      globalThis.dispatchEvent(
        new StorageEvent('storage', {
          key,
          newValue: 'sesn_new_owner',
          oldValue: 'sesn_current',
          storageArea: globalThis.localStorage,
        }),
      );
      expect(events).toHaveLength(1);
      expect(events[0]?.key).toBe(key);
      expect(events[0]?.newValue).toBe('sesn_new_owner');
    } finally {
      globalThis.removeEventListener('storage', listener);
      globalThis.localStorage.removeItem(key);
    }
  });
});
