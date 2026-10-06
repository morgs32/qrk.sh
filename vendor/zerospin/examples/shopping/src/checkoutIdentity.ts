/** A nonce identifies one checkout for one verified subject, independent of retries. */
export async function checkoutIdentity(subject: string, nonce: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify([subject, nonce])),
  );
  const suffix = Array.from(new Uint8Array(digest), value =>
    value.toString(16).padStart(2, '0'),
  ).join('');
  return {
    commandId: `cmd_checkout_${suffix}` as const,
    purchaseId: `pur_${suffix}` as const,
  };
}
