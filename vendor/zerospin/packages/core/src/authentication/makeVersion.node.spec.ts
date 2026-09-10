import { Effect, Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { makeSystem } from '../system/makeSystem.ts';
import { makeSystemSpec } from '../system/makeSystemSpec.ts';
import { SystemSpecSchema } from '../system/SystemSpecSchema.ts';

import {
  AuthenticationLockSchema,
  makeAuthenticationLock,
} from './makeAuthenticationLock.ts';
import { Authentication } from './makeVersion.ts';

import { authentication } from './index.ts';

describe('authentication.makeVersion', () => {
  it('owns metadata without invoking authentication', () => {
    const authenticate = vi.fn(() => Effect.succeed('user'));
    const props = {
      version: '1.0.0',
      signature: Schema.Struct({ subject: Schema.String }),
      authenticate,
    };
    const definition = authentication.makeVersion(props);
    expect(definition).toBeInstanceOf(Authentication);

    expect(definition.signature).toBe(props.signature);
    expect(definition.authenticate).toBe(authenticate);

    props.version = '2.0.0';
    expect(definition.version).toBe('1.0.0');
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('matches an independently authored frontend lock', () => {
    const definition = authentication.makeVersion({
      version: '1.0.0',
      signature: Schema.Struct({ subject: Schema.String }),
      authenticate: ({ signature }) => Effect.succeed(signature.subject),
    });
    const lock = makeAuthenticationLock({
      version: '1.0.0',
      signature: Schema.Struct({ subject: Schema.String }),
    });
    expect(Schema.is(AuthenticationLockSchema)(lock)).toBe(true);
    expect(lock).toEqual(definition.spec);
  });

  it.each(['1', '1.0', '01.0.0', '1.0.0-dev.1', '1.0.0+build'])(
    'rejects non-stable version %s',
    version => {
      expect(() =>
        authentication.makeVersion({
          version,
          signature: Schema.String,
          authenticate: () => Effect.succeed('user'),
        }),
      ).toThrow(Schema.SchemaError);
    },
  );

  it('rejects invalid schemas, callbacks, and excess properties', () => {
    const props = {
      version: '1.0.0',
      signature: Schema.String,
      authenticate: () => Effect.succeed('user'),
    };
    for (const invalid of [
      { ...props, signature: {} },
      { ...props, authenticate: 1 },
      { ...props, extra: true },
    ]) {
      expect(() =>
        Reflect.apply(authentication.makeVersion, undefined, [invalid]),
      ).toThrow(Schema.SchemaError);
    }
  });

  it('retains independent versions in author order and emits sorted specs', () => {
    const v1 = authentication.makeVersion({
      version: '1.0.0',
      signature: Schema.String,
      authenticate: ({ signature }) => Effect.succeed(signature),
    });
    const v2 = authentication.makeVersion({
      version: '2.0.0',
      signature: Schema.Struct({ subject: Schema.String }),
      authenticate: ({ signature }) => Effect.succeed(signature.subject),
    });
    const definitions = [v2, v1];
    const system = makeSystem({
      name: 'auth',
      authentication: definitions,
      aggregates: {},
    });
    expect(system.authentication).toEqual([v2, v1]);
    expect(system.authentication).not.toBe(definitions);

    definitions.pop();
    expect(system.authentication).toHaveLength(2);
    const spec = makeSystemSpec({ system });
    expect(spec.authentication).toEqual([v1.spec, v2.spec]);
    expect(Schema.is(SystemSpecSchema)(spec)).toBe(true);
  });

  it('rejects duplicate versions and structural copies', () => {
    const v1 = authentication.makeVersion({
      version: '1.0.0',
      signature: Schema.String,
      authenticate: () => Effect.succeed('user'),
    });
    const other = authentication.makeVersion({
      version: '1.0.0',
      signature: Schema.Number,
      authenticate: () => Effect.succeed('other'),
    });
    expect(() =>
      makeSystem({ name: 'auth', authentication: [v1, other], aggregates: {} }),
    ).toThrow(/Duplicate authentication version/);
    expect(() =>
      makeSystem({ name: 'auth', authentication: [{ ...v1 }], aggregates: {} }),
    ).toThrow(Schema.SchemaError);
  });
});
