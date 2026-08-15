import { useParams } from 'react-router';

import { ProductRouteShell } from './ProductRouteShell';

export function ProductRoute() {
  const { productId = '' } = useParams();

  return <ProductRouteShell productId={productId} />;
}
