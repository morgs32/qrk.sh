/**
 * Name each frontend binding `{surface}FrontendV{major}`.
 * Take the major from the bound aggregate version or service version.
 *
 * @bad Export the bare aggregate or service name for a frontend binding.
 * @bad Omit the major version from a frontend binding name.
 */
export const shopperFrontendV2 = makeAggregateFrontend({
  name: 'shopperFrontend',
  aggregateName: 'shopper',
  aggregateVersion: '2.0.0',
});

export const catalogFrontendV1 = makeServiceFrontend({
  name: 'appFrontend',
  serviceName: 'app',
  serviceVersion: '1.0.0',
});
