import { ZerospinError } from '@zerospin/error';
import { Schema } from 'effect';
import { assert, type Equals } from 'tsafe';
import { expect } from 'vitest';

import { isProfiler } from '../isProfiler.ts';
import type { ZerospinProfile } from '../makeProfilerLayer.ts';

export type ProcedureCall = readonly [
  (...args: any[]) => any,
  Readonly<{
    args?: readonly unknown[];
    children?: readonly ProcedureCall[];
    results?: unknown;
  }>?,
];

const FunctionSchema = Schema.declare(
  (input: unknown): input is (...args: any[]) => any =>
    typeof input === 'function',
);

export const ProcedureCallSchema: Schema.Schema<Readonly<ProcedureCall>> =
  Schema.suspend(() => {
    return Schema.Tuple(
      FunctionSchema, // function
      Schema.optionalElement(
        Schema.Struct({
          args: Schema.optionalWith(Schema.Array(Schema.Unknown), {
            exact: true,
          }),
          children: Schema.optionalWith(Schema.Array(ProcedureCallSchema), {
            exact: true,
          }),
          results: Schema.optionalWith(Schema.Unknown, { exact: true }),
        }),
      ),
    );
  });

assert<Equals<typeof ProcedureCallSchema.Type, Readonly<ProcedureCall>>>();

function matchArgs(
  actual: unknown[],
  expected: readonly unknown[],
  isNot: boolean,
): { message: string; pass: boolean } {
  try {
    if (isNot) {
      expect(actual).not.toMatchObject(expected);
    } else {
      expect(actual).toMatchObject(expected);
    }
    // This point is reached when the above assertion was successful.
    // The test should therefore always pass, that means it needs to be
    // `true` when used normally, and `false` when `.not` was used.
    return { message: '', pass: !isNot };
  } catch (error: unknown) {
    return {
      message:
        (error instanceof Error ? error.message : undefined) ??
        `Args${isNot ? ' do not' : ''} mismatch`,
      pass: isNot,
    };
  }
}

function matchResults(
  actual: unknown,
  expected: unknown,
  isNot: boolean,
): { message: string; pass: boolean } {
  try {
    // Check if expected is a primitive (not an object or array)
    const isPrimitive =
      expected === null ||
      expected === undefined ||
      (typeof expected !== 'object' && typeof expected !== 'function');

    if (isPrimitive) {
      if (isNot) {
        expect(actual).not.toEqual(expected);
      } else {
        expect(actual).toEqual(expected);
      }
    } else if (isNot) {
      expect(actual).not.toMatchObject(expected);
    } else {
      expect(actual).toMatchObject(expected);
    }
    // This point is reached when the above assertion was successful.
    // The test should therefore always pass, that means it needs to be
    // `true` when used normally, and `false` when `.not` was used.
    return { message: '', pass: !isNot };
  } catch (error: unknown) {
    return {
      message:
        (error instanceof Error ? error.message : undefined) ??
        `Results${isNot ? ' do not' : ''} mismatch`,
      pass: isNot,
    };
  }
}

function matchProfile(
  profile: ZerospinProfile,
  expectedCall: ProcedureCall,
  isNot: boolean,
  index: number,
  context: string,
): { message: string; pass: boolean } {
  const [expectedFn, expectedProfile] = expectedCall;
  const expectedName = expectedFn.name;

  // Match name
  if (profile.name !== expectedName) {
    return {
      message: `${context}${index} (${expectedName}): name mismatch - expected ${expectedName}, got ${profile.name}`,
      pass: false,
    };
  }

  // If no config provided, only match the function name
  if (!expectedProfile) {
    return { message: '', pass: true };
  }

  // Match args
  if (expectedProfile.args !== undefined) {
    const argsMatch = matchArgs(profile.getArgs(), expectedProfile.args, isNot);
    if (!argsMatch.pass) {
      return {
        message: `${context}${index} (${expectedName}): args mismatch - ${argsMatch.message}`,
        pass: false,
      };
    }
  }

  // Match results
  if (expectedProfile.results !== undefined) {
    const resultsMatch = matchResults(
      profile.getResults(),
      expectedProfile.results,
      isNot,
    );
    if (!resultsMatch.pass) {
      return {
        message: `${context}${index} (${expectedName}): results mismatch - ${resultsMatch.message}`,
        pass: false,
      };
    }
  }

  // Recursively match children if specified
  if (expectedProfile.children) {
    const childrenMatch = matchChildren(
      profile.children,
      expectedProfile.children,
      isNot,
      `${context}${index} (${expectedName}): `,
    );
    if (!childrenMatch.pass) {
      return {
        message: `${context}${index} (${expectedName}): ${childrenMatch.message}`,
        pass: false,
      };
    }
  }

  return { message: '', pass: true };
}

function matchChildren(
  actualChildren: ZerospinProfile[],
  expectedChildren: readonly ProcedureCall[],
  isNot: boolean,
  context: string,
): { message: string; pass: boolean } {
  // Match expected children in order - they must appear in the same order in actual children
  let actualIndex = 0;
  for (const [expectedIndex, expectedCall] of expectedChildren.entries()) {
    const [expectedFn] = expectedCall;

    // Find the next matching child in actual children starting from current position
    let found = false;
    for (let i = actualIndex; i < actualChildren.length; i++) {
      const profile = actualChildren[i];
      if (!profile) {
        throw new ZerospinError({
          code: 'missing-profile-child',
          message: 'Expected child profile to exist',
          extra: {
            index: i,
            expectedIndex,
          },
        });
      }
      const match = matchProfile(
        profile,
        expectedCall,
        isNot,
        expectedIndex,
        context,
      );

      if (match.pass) {
        // Found a match, update actualIndex to continue from next position
        actualIndex = i + 1;
        found = true;
        break;
      }
    }

    if (!found) {
      return {
        message: `Child ${expectedIndex} (${expectedFn.name}): not found in children at or after position ${actualIndex}`,
        pass: false,
      };
    }
  }

  return { message: '', pass: true };
}

function getAllNames(profiles: ZerospinProfile[]): string[] {
  const names: string[] = [];
  for (const profile of profiles) {
    names.push(profile.name, ...getAllNames(profile.children));
  }
  return names;
}

export function toMatchProcedure(
  this: { isNot?: boolean },
  received: unknown,
  expected: ProcedureCall[],
): { pass: boolean; message: () => string } {
  const isNot = this.isNot ?? false;

  // Validate received is a profiler with getProcedure method
  if (!isProfiler(received)) {
    return {
      message: () => {
        return `Expected profiler with getProcedure() method, but received ${typeof received}`;
      },
      pass: false,
    };
  }

  const profiler = received;
  const procedure = profiler.getProcedure();
  const errors: string[] = [];

  // Match positionally - structures should be aligned
  for (const [i, expectedCall] of expected.entries()) {
    const profile = procedure[i];
    if (!profile) {
      const [expectedFn] = expectedCall;
      errors.push(`Call ${i} (${expectedFn.name}): not found in procedure`);
      return {
        message: () => errors.join('\n'),
        pass: false,
      };
    }

    const match = matchProfile(profile, expectedCall, isNot, i, 'Call ');
    if (!match.pass) {
      errors.push(match.message);
      return {
        message: () => errors.join('\n'),
        pass: false,
      };
    }
  }

  // Check if there are extra calls that weren't expected
  if (procedure.length > expected.length) {
    const extraNames = procedure.slice(expected.length).flatMap(p => {
      return [p.name, ...getAllNames(p.children)];
    });
    errors.push(
      `Unexpected calls remaining in procedure: ${extraNames.join(', ')}`,
    );
    return {
      message: () => errors.join('\n'),
      pass: false,
    };
  }

  // This point is reached when all assertions were successful.
  // The test should therefore always pass, that means it needs to be
  // `true` when used normally, and `false` when `.not` was used.
  return {
    message: () => `Expected profiler not to match procedure, but it did`,
    pass: !isNot,
  };
}
