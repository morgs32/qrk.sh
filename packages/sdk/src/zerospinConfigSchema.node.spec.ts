import { readFile } from 'node:fs/promises';

import { ZerospinConfigSchema } from '@zerospin/core/system/ZerospinConfigSchema';
import { JsonSchema, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

describe('zerospin.schema.json', () => {
  it('matches the canonical runtime schema and is published at package root', async () => {
    const document = Schema.toJsonSchemaDocument(ZerospinConfigSchema);
    const generatedSchema = {
      $schema: JsonSchema.META_SCHEMA_URI_DRAFT_2020_12,
      ...document.schema,
      ...(Object.keys(document.definitions).length > 0
        ? { $defs: document.definitions }
        : {}),
    };
    const schemaContents = await readFile(
      new URL('../zerospin.schema.json', import.meta.url),
      'utf8',
    );

    expect(schemaContents).toBe(
      `${JSON.stringify(generatedSchema, null, 2)}\n`,
    );

    const packageJson: unknown = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    );

    expect(
      packageJson !== null && typeof packageJson === 'object'
        ? Reflect.get(packageJson, 'files')
        : undefined,
    ).toContain('zerospin.schema.json');
    expect(
      packageJson !== null && typeof packageJson === 'object'
        ? Reflect.get(
            Reflect.get(packageJson, 'exports'),
            './zerospin.schema.json',
          )
        : undefined,
    ).toBe('./zerospin.schema.json');
  });
});
