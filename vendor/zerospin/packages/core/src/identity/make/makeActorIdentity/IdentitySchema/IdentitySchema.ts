import { RoutePattern } from '@remix-run/route-pattern';
import { Schema, SchemaAST } from 'effect';

/** Validate the common owner/definition declarations using the library's parsed pattern. */
export const IdentitySchema = Schema.Struct({
  identitySchema: Schema.declare(
    (
      input: unknown,
    ): input is Schema.Struct<
      Readonly<Record<string, Schema.Codec<unknown, unknown>>>
    > =>
      Schema.isSchema(input) &&
      'fields' in input &&
      input.ast._tag === 'Objects',
  ),
  actorSchema: Schema.declare(
    (
      input: unknown,
    ): input is Schema.Struct<
      Readonly<Record<string, Schema.Codec<unknown, unknown>>>
    > =>
      Schema.isSchema(input) &&
      'fields' in input &&
      input.ast._tag === 'Objects',
  ),
  pattern: Schema.declare(
    (input: unknown): input is RoutePattern => input instanceof RoutePattern,
  ),
}).check(
  Schema.makeFilter(definition => {
    const { pattern, actorSchema, identitySchema } = definition;
    if (
      pattern.protocol !== null ||
      pattern.hostname !== null ||
      pattern.port !== null ||
      pattern.search.size !== 0
    ) {
      return 'Actor patterns must contain only a pathname';
    }
    const names = new Set<string>();
    const tokens = pattern.pathname.tokens;
    for (const [index, token] of tokens.entries()) {
      if (token.type === '(' || token.type === ')' || token.type === '*') {
        return 'Actor patterns cannot contain optional segments or wildcards';
      }
      if (token.type !== ':') continue;
      if (names.has(token.name)) {
        return 'Actor pattern parameters must be unique';
      }
      if (
        (index > 0 && tokens[index - 1]?.type !== 'separator') ||
        (index + 1 < tokens.length && tokens[index + 1]?.type !== 'separator')
      ) {
        return 'Actor parameters must occupy whole pathname segments';
      }
      names.add(token.name);
    }
    const fields = Object.keys(actorSchema.fields);
    if (
      names.size !== fields.length ||
      fields.some(field => !names.has(field))
    ) {
      return 'Actor schema fields must exactly match pattern parameters';
    }
    for (const field of fields) {
      const selected = actorSchema.fields[field];
      const admitted = identitySchema.fields[field];
      if (selected === undefined || admitted === undefined) {
        return 'Actor fields must exist in identitySchema';
      }
      const selectedAst = SchemaAST.toType(selected.ast);
      const admittedAst = SchemaAST.toType(admitted.ast);
      if (selectedAst.context?.isOptional || admittedAst.context?.isOptional) {
        return 'Actor fields must be required in both schemas';
      }
      const stringDomains = [
        selectedAst,
        SchemaAST.toEncoded(selected.ast),
        admittedAst,
      ].map(ast => {
        const pending = [ast];
        const literals = new Set<string>();
        let unrestricted = false;
        while (pending.length > 0) {
          const current = pending.pop();
          if (current?._tag === 'Union') {
            pending.push(...current.types);
          } else if (current?._tag === 'String') {
            unrestricted = true;
          } else if (
            current?._tag === 'Literal' &&
            typeof current.literal === 'string'
          ) {
            literals.add(current.literal);
          } else {
            return undefined;
          }
        }
        return { unrestricted, literals };
      });
      const [selectedDomain, encodedDomain, admittedDomain] = stringDomains;
      if (
        selectedDomain === undefined ||
        encodedDomain === undefined ||
        admittedDomain === undefined
      ) {
        return 'Actor fields must be required strings in both schemas and encode as strings';
      }
      if (
        !selectedDomain.unrestricted &&
        (admittedDomain.unrestricted ||
          [...admittedDomain.literals].some(
            value => !selectedDomain.literals.has(value),
          ))
      ) {
        return 'Identity fields must be compatible with their actor fields';
      }
    }
    return true;
  }),
);
