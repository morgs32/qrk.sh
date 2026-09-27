/**
 * Call SQL placeholder factories directly at every use site; never assign a SQL
 * placeholder to a variable. Apply this to application code, framework code,
 * tests, and fixtures, even when the same placeholder is used more than once.
 *
 * @bad const instance = identity.sql.placeholder('instanceId');
 */
const checkout = db.query.checkout.findMany({
  where: { id: { eq: identity.sql.placeholder('instanceId') } },
});
