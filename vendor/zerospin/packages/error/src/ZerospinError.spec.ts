import { Cause, Runtime, Schema } from 'effect';

import { ZerospinError } from './ZerospinError.js';

describe('ZerospinError', () => {
  describe('construction', () => {
    it('accepts a string shorthand', () => {
      const err = new ZerospinError('NOT_FOUND');
      expect(err.code).toBe('NOT_FOUND');
      expect(err.message).toBe('NOT_FOUND');
      expect(err.status).toBeNull();
      expect(err.cause).toBeNull();
      expect(err.extra).toBeNull();
    });

    it('accepts a props object', () => {
      const err = new ZerospinError({
        code: 'UNAUTHORIZED',
        message: 'Not allowed',
        status: 401,
      });
      expect(err.code).toBe('UNAUTHORIZED');
      expect(err.message).toBe('UNAUTHORIZED: Not allowed');
      expect(err.rawMessage).toBe('Not allowed');
      expect(err.status).toBe(401);
      expect(err.cause).toBeNull();
      expect(err.extra).toBeNull();
    });

    it('defaults message to code when omitted', () => {
      const err = new ZerospinError({ code: 'OOPS' });
      expect(err.message).toBe('OOPS');
    });

    it('stores cause and extra', () => {
      const cause = ZerospinError.prettyUnknownFailure(new Error('original'));
      const err = new ZerospinError({
        code: 'INTERNAL',
        cause,
        extra: { requestId: 'abc' },
      });
      expect(err.cause).toBe(cause);
      expect(err.extra).toEqual({ requestId: 'abc' });
    });

    it('has _tag ZerospinError', () => {
      const err = new ZerospinError('TAGGED');
      expect(err._tag).toBe('ZerospinError');
    });
  });

  describe('toString', () => {
    it('matches super when there is no cause', () => {
      const err = new ZerospinError({
        code: 'NO_CAUSE',
        message: 'Only this',
      });
      expect(err.toString()).toBe(
        Object.getPrototypeOf(ZerospinError.prototype).toString.call(err),
      );
    });

    it('appends Caused by for a string cause', () => {
      const cause = ZerospinError.prettyUnknownFailure(new Error('root'));
      const err = new ZerospinError({
        code: 'WRAPPED',
        message: 'Outer',
        cause,
      });
      const text = err.toString();
      expect(text).toContain('WRAPPED: Outer');
      expect(text).toContain('Caused by:');
      expect(text).toContain(cause);
    });

    it('chains nested causes via string', () => {
      const inner = new ZerospinError({
        code: 'INNER',
        message: 'Inner message',
      });
      const outer = new ZerospinError({
        code: 'OUTER',
        message: 'Outer message',
        cause: inner.message,
      });
      const text = outer.toString();
      expect(text).toContain('Outer message');
      expect(text).toContain('Caused by:');
      expect(text).toContain('Inner message');
    });

    it('pretty-prints FiberFailure cause string without serializing fiber state', () => {
      const fiberFailure = Runtime.makeFiberFailure(
        Cause.die(
          Object.assign(
            new Error('Fiber #1 cannot be resolved synchronously'),
            {
              name: 'AsyncFiberException',
              _tag: 'AsyncFiberException',
            },
          ),
        ),
      );

      const err = new ZerospinError({
        code: 'deploy-invalid-config',
        message: 'Config load failed',
        cause: ZerospinError.prettyUnknownFailure(fiberFailure),
      });

      const text = err.toString();
      expect(text.length).toBeLessThan(4_000);
      expect(text).not.toContain('"commandName"');
      expect(text).toContain('Caused by:');
      expect(text).toMatch(/synchronously|AsyncFiber/i);
      expect(ZerospinError.isAsyncRunSyncFailure(fiberFailure)).toBe(true);
    });
  });

  describe('catch', () => {
    it('uses Error.message when preferCauseMessage is true (default)', () => {
      const err = ZerospinError.catch({
        code: 'test-code',
        message: 'fallback',
      })(new Error('from error'));

      expect(err.code).toBe('test-code');
      expect(err.rawMessage).toBe('from error');
      expect(err.cause).toContain('from error');
    });

    it('uses message prop for non-Error throws', () => {
      const err = ZerospinError.catch({
        code: 'test-code',
        message: 'fallback',
      })('oops');

      expect(err.rawMessage).toBe('fallback');
      expect(err.cause).toBe(ZerospinError.prettyUnknownFailure('oops'));
    });

    it('uses static message when preferCauseMessage is false', () => {
      const err = ZerospinError.catch({
        code: 'test-code',
        message: 'always this',
        preferCauseMessage: false,
      })(new Error('ignored'));

      expect(err.rawMessage).toBe('always this');
    });

    it('defaults message to code when omitted and preferCauseMessage is false', () => {
      const err = ZerospinError.catch({
        code: 'jiti-import-failed',
        preferCauseMessage: false,
      })(new Error('ignored'));

      expect(err.rawMessage).toBe('jiti-import-failed');
    });

    it('defaults message to code for non-Error when message omitted', () => {
      const err = ZerospinError.catch({
        code: 'could-not-list-organizations',
        preferCauseMessage: false,
      })('oops');

      expect(err.rawMessage).toBe('could-not-list-organizations');
    });

    it('forwards extra and status', () => {
      const err = ZerospinError.catch({
        code: 'cloud-repo-error',
        message: 'failed',
        preferCauseMessage: false,
        extra: { systemId: 'sys_1' },
        status: 500,
      })(new Error('x'));

      expect(err.extra).toEqual({ systemId: 'sys_1' });
      expect(err.status).toBe(500);
    });
  });

  describe('isZerospinError', () => {
    it('returns true for a ZerospinError instance', () => {
      expect(ZerospinError.isZerospinError(new ZerospinError('X'))).toBe(true);
    });

    it('returns false for a plain Error', () => {
      expect(ZerospinError.isZerospinError(new Error('plain'))).toBe(false);
    });

    it('returns false for non-objects', () => {
      expect(ZerospinError.isZerospinError(null)).toBe(false);
      expect(ZerospinError.isZerospinError('string')).toBe(false);
      expect(ZerospinError.isZerospinError(42)).toBe(false);
    });
  });

  describe('schema', () => {
    const decode = Schema.decodeUnknownSync(ZerospinError.schema);
    const encode = Schema.encodeSync(ZerospinError.schema);

    it('decodes a valid JSON representation', () => {
      const json = {
        code: 'NOT_FOUND',
        message: 'Not found',
        status: 404,
        cause: null,
        extra: null,
      };
      const err = decode(json);
      expect(err).toBeInstanceOf(ZerospinError);
      expect(err.code).toBe('NOT_FOUND');
      expect(err.message).toBe('NOT_FOUND: Not found');
      expect(err.rawMessage).toBe('Not found');
      expect(err.status).toBe(404);
    });

    it('encodes a ZerospinError back to JSON', () => {
      const err = new ZerospinError({
        code: 'GONE',
        message: 'Gone',
        status: 410,
      });
      const json = encode(err);
      expect(json).toEqual({
        code: 'GONE',
        message: 'Gone',
        status: 410,
        cause: null,
        extra: null,
      });
    });

    it('round-trips through encode then decode', () => {
      const original = new ZerospinError({
        code: 'SERVER_ERROR',
        message: 'Something went wrong',
        status: 500,
        cause: 'underlying failure',
        extra: { trace: 'xyz' },
      });
      const json = encode(original);
      const restored = decode(json);
      expect(restored.code).toBe(original.code);
      expect(restored.message).toBe(original.message);
      expect(restored.status).toBe(original.status);
      expect(restored.cause).toBe('underlying failure');
    });

    it('stringify encodes via parseJson schema', () => {
      const err = new ZerospinError({
        code: 'UNAUTHORIZED',
        message: 'Not allowed',
        status: 401,
      });
      expect(JSON.parse(ZerospinError.stringify(err))).toEqual({
        code: 'UNAUTHORIZED',
        message: 'Not allowed',
        status: 401,
        cause: null,
        extra: null,
      });
    });
  });
});
