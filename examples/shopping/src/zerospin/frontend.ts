import { catalog as catalogFrontend } from './frontends/catalog';
import { web as shopperFrontend } from './frontends/web';

export { catalogFrontend, shopperFrontend };

export const frontends = {
  web: shopperFrontend,
  catalog: catalogFrontend,
};
