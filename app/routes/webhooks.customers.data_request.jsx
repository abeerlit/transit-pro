import { authenticate } from "../shopify.server";

// GDPR mandatory compliance webhook: customers/data_request
// Fired when a customer requests their data from a store. HMAC is verified
// by authenticate.webhook. This app does not store customer personal data
// (only Shopify session records), so there is nothing to return here.
export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`, payload);

  return new Response();
};
