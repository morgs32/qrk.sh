import { RoutePattern } from '@remix-run/route-pattern';
import { Schema, SchemaAST } from 'effect';

/** Validate the common owner/frontend declarations using the library's parsed pattern. */
export const AuthenticationSchema = Schema.Struct({
  signatureSchema: Schema.declare(
    (input: unknown): input is Schema.Codec<unknown, unknown> =>
      Schema.isSchema(input),
  ),
  authenticationSchema: Schema.declare(
    (
      input: unknown,
    ): input is Schema.Struct<
      Readonly<Record<string, Schema.Codec<unknown, unknown>>>
    > =>
      Schema.isSchema(input) &&
      'fields' in input &&
      input.ast._tag === 'Objects',
  ),
  selectionSchema: Schema.declare(
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
    const { pattern, selectionSchema, authenticationSchema } = definition;
    if (
      pattern.protocol !== null ||
      pattern.hostname !== null ||
      pattern.port !== null ||
      pattern.search.size !== 0
    ) {
      return 'Selection patterns must contain only a pathname';
    }
    const names = new Set<string>();
    const tokens = pattern.pathname.tokens;
    for (const [index, token] of tokens.entries()) {
      if (token.type === '(' || token.type === ')' || token.type === '*') {
        return 'Selection patterns cannot contain optional segments or wildcards';
      }
      if (token.type !== ':') continue;
      if (names.has(token.name)) {
        return 'Selection pattern parameters must be unique';
      }
      if (
        (index > 0 && tokens[index - 1]?.type !== 'separator') ||
        (index + 1 < tokens.length && tokens[index + 1]?.type !== 'separator')
      ) {
        return 'Selection parameters must occupy whole pathname segments';
      }
      names.add(token.name);
    }
    const fields = Object.keys(selectionSchema.fields);
    if (
      names.size !== fields.length ||
      fields.some(field => !names.has(field))
    ) {
      return 'Selection schema fields must exactly match pattern parameters';
    }
    for (const field of fields) {
      const selected = selectionSchema.fields[field];
      const authenticated = authenticationSchema.fields[field];
      if (selected === undefined || authenticated === undefined) {
        return 'Selection fields must exist in authenticationSchema';
      }
      const selectedAst = SchemaAST.toType(selected.ast);
      const authenticatedAst = SchemaAST.toType(authenticated.ast);
      if (
        selectedAst.context?.isOptional ||
        authenticatedAst.context?.isOptional
      ) {
        return 'Selection fields must be required in both schemas';
      }
      const stringDomains = [
        selectedAst,
        SchemaAST.toEncoded(selected.ast),
        authenticatedAst,
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
      const [selectedDomain, encodedDomain, authenticatedDomain] =
        stringDomains;
      if (
        selectedDomain === undefined ||
        encodedDomain === undefined ||
        authenticatedDomain === undefined
      ) {
        return 'Selection fields must be required strings in both schemas and encode as strings';
      }
      if (
        !selectedDomain.unrestricted &&
        (authenticatedDomain.unrestricted ||
          [...authenticatedDomain.literals].some(
            value => !selectedDomain.literals.has(value),
          ))
      ) {
        return 'Authentication fields must be compatible with their selection fields';
      }
    }
    return true;
  }),
);
