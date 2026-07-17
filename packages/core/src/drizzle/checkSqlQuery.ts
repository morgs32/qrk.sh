// Copied from https://github.com/beenotung/check-sql-query

import { Effect } from 'effect';

const sqlTypes = [
  'select',
  'insert',
  'update',
  'delete',
  'drop',
  'alter',
  'create',
  'pragma',
  'attach',
  'detach',
  'replace',
  'truncate',
  'vacuum',
  'reindex',
] as const;

export type SqlType = (typeof sqlTypes)[number];

export type ICheckSqlQueryResult = {
  readonly readonly: boolean;
  readonly types: SqlType[];
  readonly error?: string;
};

export const checkSqlQuery = Effect.fn('checkSqlQuery')(function* (props: {
  readonly sql: string;
  readonly params?: unknown[] | object;
}) {
  const { params, sql: inputSql } = props;
  return yield* Effect.sync((): ICheckSqlQueryResult => {
    let sql = inputSql.trim().toLowerCase();

    function replace(
      value: string,
      start: number,
      end: number,
      replacement: string,
    ): string {
      return value.substring(0, start) + replacement + value.substring(end + 1);
    }

    function parseName(value: string, start: number): string | null {
      const name = value.slice(start).match(/^[a-zA-Z0-9_]+/);
      if (!name) {
        return null;
      }
      return name[0];
    }

    function replaceStringValue(value: string): string {
      let start = 0;
      let end = 0;
      main: for (;;) {
        value = value.trim();
        if (value.length === 0) {
          break;
        }

        const quotas = ['"', "'", '`'];
        for (const quota of quotas) {
          start = value.indexOf(quota);
          if (start !== -1) {
            end = value.indexOf(quota, start + 1);
            if (end !== -1) {
              if (value[end - 1] === '\\') {
                value = replace(value, end - 1, end, 'x');
                continue main;
              }
              value = replace(value, start, end, 'x');
              continue main;
            }
          }
        }

        break;
      }
      return value;
    }

    sql = replaceStringValue(sql);

    let error: string | undefined;

    const paramType = Array.isArray(params)
      ? 'array'
      : params === null
        ? 'null'
        : typeof params;
    // check array parameters
    if (sql.includes('$1') && sql.includes('?')) {
      error = 'mixed "$1" and "?" style parameters';
    } else if (sql.includes('$1') || sql.includes('?')) {
      if (!params) {
        error = 'missing array parameters';
      } else if (!Array.isArray(params)) {
        error = 'array parameters expected, got ' + paramType;
      } else {
        const array = params;
        let count = 1;
        while (sql.includes(`$${count + 1}`)) {
          count++;
        }
        if (count === 1) {
          sql = sql.replace('?', 'x');
        }
        while (sql.includes('?')) {
          count++;
          sql = sql.replace('?', 'x');
        }
        if (array.length < count) {
          error =
            'not enough parameter in array, expected ' +
            count +
            ', got ' +
            array.length;
        } else if (array.length > count) {
          error =
            'too many parameter in array, expected ' +
            count +
            ', got ' +
            array.length;
        }
      }
    }
    // check object parameters
    else {
      const symbols = ['@', ':', '$'];
      for (const symbol of symbols) {
        if (sql.includes(symbol)) {
          if (!params) {
            error = 'missing object parameters';
          } else if (typeof params !== 'object' || params === null) {
            error = 'object parameters expected, got ' + paramType;
          } else {
            const object = params;
            const missing: string[] = [];
            for (;;) {
              const start = sql.indexOf(symbol);
              if (start === -1) {
                break;
              }
              const name = parseName(sql, start + 1);
              if (!name) {
                error = `missing parameter name after "${symbol}"`;
                break;
              }
              sql = replace(sql, start, start + name.length, 'x');
              if (!(name in object)) {
                missing.push(name);
              }
            }
            if (missing.length > 0) {
              error = 'missing parameter in object: ' + missing.join(', ');
            }
          }
        }
      }
    }

    const types: SqlType[] = [];
    for (const type of sqlTypes) {
      if (sql.includes(type)) {
        types.push(type);
      }
    }
    const readonly =
      sql.length === 0 || (types.length === 1 && types[0] === 'select');

    return error ? { readonly, types, error } : { readonly, types };
  });
});
