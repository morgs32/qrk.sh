import { Either } from 'effect';
import { notFound, redirect } from 'next/navigation';

declare function cacheRow(): Promise<Either.Either<{ name: string }, unknown>>;

/**
 * `redirect()` and `notFound()` stay in the async route module — never inside Effect programs.
 *
 * @bad Calling `redirect('/login')` inside `Effect.fn` — Next throws sentinels that `runPromise` surfaces as Cause/rejections.
 */
export default async function Page() {
  const either = await cacheRow();

  if (Either.isLeft(either)) {
    redirect('/login');
  }

  if (!either.right.name) {
    notFound();
  }

  return `<div>${either.right.name}</div>`;
}
