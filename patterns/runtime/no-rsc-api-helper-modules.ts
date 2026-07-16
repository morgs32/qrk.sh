declare const catalogClient: {
  products: {
    getProduct(props: {
      productId: string;
    }): Promise<{ id: string; name: string }>;
  };
};

/**
 * Keep API calls in the RSC file that renders the data — no one-off `lib/get*` wrappers.
 *
 * @bad `lib/getProduct.ts` forwarding a single catalog RPC call used by one page.
 */
export default async function ProductPage(props: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await props.params;

  const product = await catalogClient.products.getProduct({ productId });

  return `<div>${product.name}</div>`;
}
