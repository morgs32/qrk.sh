import { it } from '@effect/vitest';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { checkSqlQuery } from './checkSqlQuery.ts';

describe('checkSqlQuery', () => {
  describe('single level sql query/command', () => {
    it.effect('should detect select query', () =>
      Effect.gen(function* () {
        const result = yield* checkSqlQuery({ sql: 'select * from users' });
        expect(result).toEqual({
          readonly: true,
          types: ['select'],
        });
      }),
    );
    it.effect('should detect insert query', () =>
      Effect.gen(function* () {
        const result = yield* checkSqlQuery({
          sql: 'insert into users (name, email) values ("John Doe", "john.doe@example.com")',
        });
        expect(result).toEqual({
          readonly: false,
          types: ['insert'],
        });
      }),
    );
    it.effect('should detect update query', () =>
      Effect.gen(function* () {
        const result = yield* checkSqlQuery({
          sql: 'update users set name = "John Doe" where id = 1',
        });
        expect(result).toEqual({
          readonly: false,
          types: ['update'],
        });
      }),
    );
    it.effect('should detect delete query', () =>
      Effect.gen(function* () {
        const result = yield* checkSqlQuery({
          sql: 'delete from users where id = 1',
        });
        expect(result).toEqual({
          readonly: false,
          types: ['delete'],
        });
      }),
    );
    it.effect('should detect create table command', () =>
      Effect.gen(function* () {
        const result = yield* checkSqlQuery({
          sql: 'create table users (id int primary key, name varchar(255))',
        });
        expect(result).toEqual({
          readonly: false,
          types: ['create'],
        });
      }),
    );
    it.effect('should detect create index command', () =>
      Effect.gen(function* () {
        const result = yield* checkSqlQuery({
          sql: 'create index idx_users_name on users (name)',
        });
        expect(result).toEqual({
          readonly: false,
          types: ['create'],
        });
      }),
    );
    it.effect('should detect alter table command', () =>
      Effect.gen(function* () {
        const result = yield* checkSqlQuery({
          sql: 'alter table users add column email varchar(255)',
        });
        expect(result).toEqual({
          readonly: false,
          types: ['alter'],
        });
      }),
    );
    it.effect('should detect drop table command', () =>
      Effect.gen(function* () {
        const result = yield* checkSqlQuery({ sql: 'drop table users' });
        expect(result).toEqual({
          readonly: false,
          types: ['drop'],
        });
      }),
    );
    it.effect('should detect pragma command', () =>
      Effect.gen(function* () {
        const result = yield* checkSqlQuery({
          sql: 'pragma foreign_keys = off;',
        });
        expect(result).toEqual({
          readonly: false,
          types: ['pragma'],
        });
      }),
    );
    it.effect('should detect attach command', () =>
      Effect.gen(function* () {
        const result = yield* checkSqlQuery({
          sql: 'attach database "users.db" as users',
        });
        expect(result).toEqual({
          readonly: false,
          types: ['attach'],
        });
      }),
    );
    it.effect('should detect detach command', () =>
      Effect.gen(function* () {
        const result = yield* checkSqlQuery({ sql: 'detach database users' });
        expect(result).toEqual({
          readonly: false,
          types: ['detach'],
        });
      }),
    );
    it.effect('should detect replace command', () =>
      Effect.gen(function* () {
        const result = yield* checkSqlQuery({
          sql: 'replace into users (id, name) values (1, "John Doe")',
        });
        expect(result).toEqual({
          readonly: false,
          types: ['replace'],
        });
      }),
    );
    it.effect('should detect truncate command', () =>
      Effect.gen(function* () {
        const result = yield* checkSqlQuery({ sql: 'truncate table users' });
        expect(result).toEqual({
          readonly: false,
          types: ['truncate'],
        });
      }),
    );
    it.effect('should detect vacuum command', () =>
      Effect.gen(function* () {
        const result = yield* checkSqlQuery({ sql: 'vacuum' });
        expect(result).toEqual({
          readonly: false,
          types: ['vacuum'],
        });
      }),
    );
    it.effect('should detect vacuum into command', () =>
      Effect.gen(function* () {
        const result = yield* checkSqlQuery({ sql: 'vacuum into "users.db"' });
        expect(result).toEqual({
          readonly: false,
          types: ['vacuum'],
        });
      }),
    );
  });
  describe('subquery', () => {
    it.effect('should detect select in subquery', () =>
      Effect.gen(function* () {
        const result = yield* checkSqlQuery({
          sql: 'select * from (select * from users) where id = 1',
        });
        expect(result).toEqual({
          readonly: true,
          types: ['select'],
        });
      }),
    );
    it.effect('should detect insert in subquery', () =>
      Effect.gen(function* () {
        const result = yield* checkSqlQuery({
          sql: 'select * from users where id in (insert into users (name, email) values ("John Doe", "john.doe@example.com") returning id)',
        });
        expect(result).toEqual({
          readonly: false,
          types: ['select', 'insert'],
        });
      }),
    );
    it.effect('should detect delete in subquery', () =>
      Effect.gen(function* () {
        const result = yield* checkSqlQuery({
          sql: 'select * from users where id in (delete from users where id = 1 returning id)',
        });
        expect(result).toEqual({
          readonly: false,
          types: ['select', 'delete'],
        });
      }),
    );
    it.effect('should update in subquery', () =>
      Effect.gen(function* () {
        const result = yield* checkSqlQuery({
          sql: 'select * from users where id in (update users set name = "John Doe" where id = 1 returning id)',
        });
        expect(result).toEqual({
          readonly: false,
          types: ['select', 'update'],
        });
      }),
    );
  });
  describe('string payload', () => {
    describe('without escape', () => {
      function test(name: string, value: string) {
        it.effect(`string in ${name}`, () =>
          Effect.gen(function* () {
            const result = yield* checkSqlQuery({
              sql: `select * from users where message like ${value} and 1`,
            });
            expect(result).toEqual({
              readonly: true,
              types: ['select'],
            });
          }),
        );
      }
      test('double quotes', '"%update%"');
      test('single quotes', "'%update'%'");
      test('backticks', '`%update%`');
    });
    describe('with escape', () => {
      function test(name: string, value: string) {
        it.effect(`string in ${name}`, () =>
          Effect.gen(function* () {
            const result = yield* checkSqlQuery({
              sql: `select * from users where message like ${value} and 1`,
            });
            expect(result).toEqual({
              readonly: true,
              types: ['select'],
            });
          }),
        );
      }
      test('double quotes', '"%\\"update%"');
      test('single quotes', "'%\\'update%'");
      test('backticks', '`%\\`update%`');
    });
  });
  describe('missing parameter', () => {
    function testArrayParameters(name: string, sql: string) {
      describe(`${name} array parameters`, () => {
        it.effect('should pass when parameters are enough', () =>
          Effect.gen(function* () {
            const result = yield* checkSqlQuery({
              sql,
              params: ['alice', 'admin'],
            });
            expect(result).toEqual({
              readonly: true,
              types: ['select'],
            });
          }),
        );
        it.effect('should fail when missing parameters entirely', () =>
          Effect.gen(function* () {
            const result = yield* checkSqlQuery({ sql });
            expect(result).toEqual({
              readonly: true,
              types: ['select'],
              error: 'missing array parameters',
            });
          }),
        );
        it.effect('should fail when parameters are not enough', () =>
          Effect.gen(function* () {
            const result = yield* checkSqlQuery({ sql, params: ['alice'] });
            expect(result).toEqual({
              readonly: true,
              types: ['select'],
              error: 'not enough parameter in array, expected 2, got 1',
            });
          }),
        );
        it.effect('should fail when parameters are too many', () =>
          Effect.gen(function* () {
            const result = yield* checkSqlQuery({
              sql,
              params: ['alice', 'admin', 'admin'],
            });
            expect(result).toEqual({
              readonly: true,
              types: ['select'],
              error: 'too many parameter in array, expected 2, got 3',
            });
          }),
        );
      });
    }
    testArrayParameters(
      '"$1" style',
      'select * from users where username = $1 and role = $2',
    );
    testArrayParameters(
      '"?" style',
      'select * from users where username = ? and role = ?',
    );

    function testObjectParameters(symbol: string) {
      describe(`"${symbol}key" style object parameters`, () => {
        const sql = `select * from users where username = ${symbol}username and role = ${symbol}role`;
        it.effect('should pass when parameters are enough', () =>
          Effect.gen(function* () {
            const result = yield* checkSqlQuery({
              sql,
              params: { username: 'alice', role: 'admin' },
            });
            expect(result).toEqual({
              readonly: true,
              types: ['select'],
            });
          }),
        );
        it.effect('should fail when missing parameters entirely', () =>
          Effect.gen(function* () {
            const result = yield* checkSqlQuery({ sql });
            expect(result).toEqual({
              readonly: true,
              types: ['select'],
              error: 'missing object parameters',
            });
          }),
        );
        it.effect('should fail when missing some parameters', () =>
          Effect.gen(function* () {
            let result = yield* checkSqlQuery({
              sql,
              params: { username: 'alice' },
            });
            expect(result).toEqual({
              readonly: true,
              types: ['select'],
              error: 'missing parameter in object: role',
            });

            result = yield* checkSqlQuery({ sql, params: {} });
            expect(result).toEqual({
              readonly: true,
              types: ['select'],
              error: 'missing parameter in object: username, role',
            });
          }),
        );
        it.effect('should ignore extra parameters', () =>
          Effect.gen(function* () {
            const result = yield* checkSqlQuery({
              sql,
              params: {
                username: 'alice',
                role: 'admin',
                role2: 'admin',
              },
            });
            expect(result).toEqual({
              readonly: true,
              types: ['select'],
            });
          }),
        );
      });
    }
    testObjectParameters('@');
    testObjectParameters(':');
    testObjectParameters('$');
  });
  describe('mixed parameters', () => {
    it.effect('should fail when mixed "$1" and "?" style parameters', () =>
      Effect.gen(function* () {
        const result = yield* checkSqlQuery({
          sql: 'select * from users where username = $1 and role = ?',
          params: ['alice'],
        });
        expect(result).toEqual({
          readonly: true,
          types: ['select'],
          error: 'mixed "$1" and "?" style parameters',
        });
      }),
    );
  });
});
