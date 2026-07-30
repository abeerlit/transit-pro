import { authenticate } from "../shopify.server";
import { logger } from "../utils/logger";
import { formatDeliveryStatus } from "../utils/statusFormatter";
import { BASEURL } from "../utils/constants";

const FULFILL_MAX_ATTEMPTS = 3;
const FULFILL_RETRY_DELAY_MS = 1500;

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const orderId = formData.get("orderId")?.trim();
  const fulfillmentOrderId = formData.get("fulfillmentOrderId")?.trim();
  const trackingInfoRaw = formData.get("trackingInfo");
  const showDastaqNote = formData.get("showDastaqNote") !== "false";

  if (!fulfillmentOrderId) {
    logger.warn("Fulfill API: missing fulfillmentOrderId", { orderId });
    return Response.json({ error: "Missing required fulfillment data" }, { status: 400 });
  }
  if (!orderId) {
    logger.warn("Fulfill API: missing orderId", { fulfillmentOrderId });
    return Response.json({ error: "Missing orderId" }, { status: 400 });
  }

  let trackingInfo;
  try {
    trackingInfo = JSON.parse(trackingInfoRaw || "{}");
  } catch {
    logger.warn("Fulfill API: invalid trackingInfo JSON", { orderId });
    return Response.json({ error: "Invalid tracking info" }, { status: 400 });
  }

  let lastError = null;
  let lastStatus = 500;
  let lastDetails = null;

  for (let attempt = 1; attempt <= FULFILL_MAX_ATTEMPTS; attempt++) {
    try {
      // Add the dastaq tag
      await admin.graphql(
        `#graphql
        mutation addTags($id: ID!) {
          tagsAdd(id: $id, tags: ["dastaq"]) {
            node { id }
            userErrors { field message }
          }
        }`,
        { variables: { id: `gid://shopify/Order/${orderId}` } }
      );

      // Add order note with the Dastaq tracking number (only if enabled by user).
      if (showDastaqNote) {
        const noteText = `Order has been shipped via Dastaq with Tracking ${trackingInfo?.number || ""}.`;
        const orderUpdateResponse = await admin.graphql(
          `#graphql
          mutation orderUpdate($input: OrderInput!) {
            orderUpdate(input: $input) {
              order { id note }
              userErrors { field message }
            }
          }`,
          {
            variables: {
              input: {
                id: `gid://shopify/Order/${orderId}`,
                note: noteText,
              },
            },
          }
        );

        const orderUpdateData = await orderUpdateResponse.json();
        if (orderUpdateData.data?.orderUpdate?.userErrors?.length > 0) {
          logger.warn("Order note update errors", {
            orderId,
            errors: orderUpdateData.data.orderUpdate.userErrors,
          });
        } else {
          logger.info("Order note set with tracking number", {
            orderId,
            trackingNumber: trackingInfo?.number,
          });
        }
      } else {
        logger.info("Skipping order note (disabled by user setting)", { orderId });
      }

      // Create fulfillment
      const fulfillmentResponse = await admin.graphql(
        `#graphql
        mutation fulfillmentCreate($fulfillment: FulfillmentInput!) {
          fulfillmentCreate(fulfillment: $fulfillment) {
            fulfillment { id status }
            userErrors { field message }
          }
        }`,
        {
          variables: {
            fulfillment: {
              lineItemsByFulfillmentOrder: [{ fulfillmentOrderId }],
              notifyCustomer: true,
              trackingInfo: {
                number: trackingInfo?.number,
                company: trackingInfo?.company,
                url: trackingInfo?.url,
              },
            },
          },
        }
      );

      const fulfillmentData = await fulfillmentResponse.json();

      if (fulfillmentData.data?.fulfillmentCreate?.userErrors?.length > 0) {
        const userErrors = fulfillmentData.data.fulfillmentCreate.userErrors;
        logger.error("Fulfillment failed (Shopify userErrors) - not retrying", {
          component: "api.shopify.fulfill",
          orderId,
          fulfillmentOrderId,
          attempt,
          userErrors,
        });
        return Response.json(
          { error: "Failed to fulfill order", details: userErrors },
          { status: 400 }
        );
      }

      // Set delivery status metafield after fulfillment
      try {
        const orderGid = `gid://shopify/Order/${orderId}`;
        let deliveryStatus = null;

        if (trackingInfo?.number) {
          try {
            const backendResponse = await fetch(
              `${BASEURL}/api/orders/tracking/${trackingInfo.number}`,
              { method: "GET", headers: { "Content-Type": "application/json" } }
            );
            if (backendResponse.ok) {
              const orderData = await backendResponse.json();
              if (orderData?.data?.status) {
                deliveryStatus = formatDeliveryStatus(orderData.data.status);
              }
            }
          } catch (fetchError) {
            logger.warn("Failed to fetch order status from backend", {
              orderId,
              trackingNumber: trackingInfo.number,
              error: fetchError instanceof Error ? fetchError.message : String(fetchError),
            });
          }
        }

        if (!deliveryStatus) {
          deliveryStatus = "Pending";
          logger.info("Using default delivery status - backend fetch failed", {
            orderId,
            trackingNumber: trackingInfo?.number,
          });
        }

        const deliveryStatusMetafield = [
          {
            ownerId: orderGid,
            namespace: "custom",
            key: "delivery_status",
            type: "single_line_text_field",
            value: deliveryStatus,
          },
        ];

        const metafieldsResponseAfterFulfillment = await admin.graphql(
          `#graphql
          mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
              metafields { id key namespace value }
              userErrors { field message }
            }
          }`,
          { variables: { metafields: deliveryStatusMetafield } }
        );

        const metafieldsDataAfter = await metafieldsResponseAfterFulfillment.json();
        if (metafieldsDataAfter.data?.metafieldsSet?.userErrors?.length > 0) {
          logger.warn("Delivery status metafield errors after fulfillment", {
            orderId,
            errors: metafieldsDataAfter.data.metafieldsSet.userErrors,
          });
        } else {
          logger.info("Delivery status metafield set successfully after fulfillment", {
            orderId,
          });
        }
      } catch (metafieldError) {
        logger.error("Failed to set delivery status metafield after fulfillment", {
          orderId,
          error: metafieldError instanceof Error ? metafieldError.message : String(metafieldError),
        });
      }

      return Response.json({
        success: true,
        fulfillment: fulfillmentData.data.fulfillmentCreate.fulfillment,
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      lastDetails = String(error);
      logger.error("Fulfillment attempt failed - will retry if attempts remain", {
        component: "api.shopify.fulfill",
        orderId,
        fulfillmentOrderId,
        attempt,
        maxAttempts: FULFILL_MAX_ATTEMPTS,
        error: lastError.message,
      });
      if (attempt < FULFILL_MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, FULFILL_RETRY_DELAY_MS * attempt));
      }
    }
  }

  logger.error("Fulfillment failed after all retries", {
    component: "api.shopify.fulfill",
    orderId,
    fulfillmentOrderId,
    lastDetails,
  });
  return Response.json(
    { error: "Failed to fulfill order after retries", details: lastDetails },
    { status: lastStatus }
  );
};
