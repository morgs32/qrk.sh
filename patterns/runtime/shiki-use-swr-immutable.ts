import useSWRImmutable from 'swr/immutable';

declare function codeToHtml(
  text: string,
  options: { lang: string; theme: string },
): Promise<string>;

interface ISystemApiKeyPair {
  publishableKey: { token: string };
  secretKey: { token: string };
}

/**
 * Shiki highlighting: `useSWRImmutable` keyed on nullable domain identity; fetch both variants in one pass.
 *
 * @bad `useEffect` + `useState` + manual cancellation for every input change.
 * @bad SWR key on the full env string — recomputes highlight when formatting changes, not identity.
 * @bad Sentinel key object (`maybeKeyPair ?? noKeySentinel`) when null should skip the fetcher.
 */
export function ApiKeysHighlight(props: {
  maybeKeyPair: ISystemApiKeyPair | null;
  showSecrets: boolean;
}) {
  const { maybeKeyPair, showSecrets } = props;

  const { data: highlightByReveal = { maskedHtml: '', revealedHtml: '' } } =
    useSWRImmutable(maybeKeyPair, async pair => {
      const envMasked = !pair
        ? 'NEXT_PUBLIC_KEY=pk_mock…\nSECRET=•••'
        : `NEXT_PUBLIC_KEY=${pair.publishableKey.token}\nSECRET=…`;
      const envRevealed = !pair
        ? 'NEXT_PUBLIC_KEY=pk_mock…\nSECRET=sk_mock…'
        : `NEXT_PUBLIC_KEY=${pair.publishableKey.token}\nSECRET=${pair.secretKey.token}`;

      const [maskedHtml, revealedHtml] = await Promise.all([
        codeToHtml(envMasked, { lang: 'dotenv', theme: 'github-dark' }),
        codeToHtml(envRevealed, { lang: 'dotenv', theme: 'github-dark' }),
      ]);

      return { maskedHtml, revealedHtml };
    });

  const highlightedHtml = showSecrets
    ? highlightByReveal.revealedHtml
    : highlightByReveal.maskedHtml;

  return {
    dangerouslySetInnerHTML: { __html: highlightedHtml },
    tagName: 'pre',
  };
}
