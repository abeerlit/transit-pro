import { authenticate } from "../shopify.server";
import db from "../db.server";

// GDPR mandatory compliance webhook: shop/redact
// Fired 48 hours after a store uninstalls the app, requesting deletion of the
// shop's data. HMAC is verified by authenticate.webhook. We remove any session
// records still stored for this shop.
export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`, payload);

  await db.session.deleteMany({ where: { shop } });

  return new Response();
};
