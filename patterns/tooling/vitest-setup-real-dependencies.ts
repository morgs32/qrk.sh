/**
 * Vitest setup imports must be declared in the same package's `devDependencies`.
 *
 * @bad `import '@testing-library/jest-dom/vitest'` in setup while `package.json` only lists `vitest`.
 *
 * Good `devDependencies`:
 *
 * ```json
 * {
 *   "@testing-library/jest-dom": "^6.9.1",
 *   "vitest": "^4.1.0"
 * }
 * ```
 */
import '@testing-library/jest-dom/vitest';

export {};
