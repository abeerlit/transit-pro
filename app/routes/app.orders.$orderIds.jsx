import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { Page, Banner, Text, BlockStack, Card } from "@shopify/polaris";
import AddOrder from "../components/AddOrder";

const ORDER_FETCH_CONCURRENCY = 4;
const BETWEEN_BATCH_MS = 400;
const RETRY_DELAY_MS = 800;
const MAX_RETRIES = 4;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isThrottleError(err) {
  if (!err) return false;
  const msg = typeof err === "string" ? err : JSON.stringify(err);
  return msg.includes("429") || msg.toLowerCase().includes("throttl") || msg.toLowerCase().includes("rate limit");
}

async function fetchOrderWithRetry(admin, gid, retries = 6) {
  let delay = 500;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await admin.graphql(
        `#graphql
        query GetOrder($id: ID!) {
          order(id: $id) {
            id
            name
            totalWeight
            displayFinancialStatus
            currentTotalPriceSet { shopMoney { amount } }
            customer { displayName phone email }
            shippingAddress { name address1 address2 city province zip country phone }
            fulfillmentOrders(first: 10) {
              nodes {
                id
                status
                createdAt
                updatedAt
                lineItems(first: 20) {
                  edges {
                    node {
                      id
                      remainingQuantity
                      totalQuantity
                      lineItem {
                        id
                        title
                        variant { id sku title }
                      }
                    }
                  }
                }
              }
            }
            deliveryStatus: metafield(namespace: "custom", key: "delivery_status") { value }
          }
          shop { id }
        }`,
        { variables: { id: gid } }
      );
      const data = await res.json();
      if (data.errors) {
        const errMsg = JSON.stringify(data.errors);
        if (isThrottleError(errMsg) && attempt < retries) {
          await sleep(delay);
          delay = Math.min(delay * 2, 8000);
          continue;
        }
        return { error: errMsg };
      }
      return { order: data.data?.order, shop: data.data?.shop };
    } catch (e) {
      if (attempt < retries) {
        await sleep(delay);
        delay = Math.min(delay * 2, 8000);
      } else {
        return { error: String(e) };
      }
    }
  }
  return { error: "Max retries exceeded" };
}

export const loader = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);

  const rawIds = (params.orderIds || "").split(",").map((id) => id.trim()).filter(Boolean);

  // Convert numeric IDs to GIDs
  const gids = rawIds.map((id) =>
    id.startsWith("gid://") ? id : `gid://shopify/Order/${id}`
  );

  let shopId = null;
  const results = [];

  // Fetch in batches to avoid rate limiting
  for (let i = 0; i < gids.length; i += ORDER_FETCH_CONCURRENCY) {
    const batch = gids.slice(i, i + ORDER_FETCH_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((gid) => fetchOrderWithRetry(admin, gid))
    );
    for (const r of batchResults) {
      if (r.shop && !shopId) shopId = r.shop.id;
      results.push(r);
    }
    if (i + ORDER_FETCH_CONCURRENCY < gids.length) {
      await sleep(BETWEEN_BATCH_MS);
    }
  }

  // Retry failed orders sequentially
  const failedIndexes = results
    .map((r, i) => (r.error && !r.order ? i : -1))
    .filter((i) => i !== -1);

  for (const idx of failedIndexes) {
    for (let retry = 0; retry < MAX_RETRIES; retry++) {
      await sleep(RETRY_DELAY_MS);
      const r = await fetchOrderWithRetry(admin, gids[idx], 2);
      if (r.order) {
        results[idx] = r;
        break;
      }
    }
  }

  const fulfilled = [];
  const errors = [];
  const unfulfilled = [];

  results.forEach((r, i) => {
    if (!r.order) {
      errors.push({ gid: gids[i], error: r.error });
      return;
    }
    const o = r.order;
    const activeFOs = (o.fulfillmentOrders?.nodes || []).filter(
      (fo) => fo?.status !== "CLOSED" && fo?.status !== "CANCELLED"
    );
    const hasRemainingItems = activeFOs.some((fo) =>
      (fo.lineItems?.edges || []).some(
        (e) => (e?.node?.remainingQuantity ?? 0) > 0
      )
    );

    if (activeFOs.length === 0 || !hasRemainingItems) {
      fulfilled.push(o.name || gids[i]);
      return;
    }

    const addr = o.shippingAddress;
    const latestFO = activeFOs.sort(
      (a, b) =>
        new Date(b?.updatedAt || b?.createdAt || 0).getTime() -
        new Date(a?.updatedAt || a?.createdAt || 0).getTime()
    )[0];

    const currentItemsMap = new Map();
    for (const itemEdge of latestFO?.lineItems?.edges || []) {
      const base = itemEdge?.node?.lineItem || {};
      const id = base.id || String(Math.random());
      const sku = base?.variant?.sku;
      const variantTitle = base?.variant?.title;
      const title =
        sku && variantTitle
          ? `${base.title} (${sku} - ${variantTitle})`
          : variantTitle
          ? `${base.title} - ${variantTitle}`
          : base.title;
      const qty = itemEdge?.node?.remainingQuantity ?? itemEdge?.node?.totalQuantity ?? 0;
      if (!currentItemsMap.has(id)) {
        currentItemsMap.set(id, { id, title, quantity: qty });
      } else {
        currentItemsMap.get(id).quantity += qty;
      }
    }
    const lineItems = Array.from(currentItemsMap.values()).filter((li) => li.quantity > 0);
    const productName = lineItems.length
      ? lineItems.map((li) => `${li.title} x ${li.quantity}`).join(", ") + "."
      : "";
    const pieces = lineItems.reduce((sum, li) => sum + li.quantity, 0);

    const isPaid = o.displayFinancialStatus === "PAID";
    const rawAmt = o.currentTotalPriceSet?.shopMoney?.amount;
    const cod = isPaid ? "0" : rawAmt ? parseFloat(rawAmt).toString() : "";

    unfulfilled.push({
      id: i + 1,
      orderId: o.id,
      order: o.name,
      name: addr?.name || "",
      phone: addr?.phone || "",
      phone2: o.customer?.phone || "",
      email: o.customer?.email || "",
      address: [addr?.address1, addr?.address2].filter(Boolean).join(", "),
      consigneeAddress: [addr?.address1, addr?.address2].filter(Boolean).join(", "),
      city: addr?.city || "",
      province: addr?.province || "",
      zip: addr?.zip || "",
      country: addr?.country || "",
      lineItems,
      cod,
      weight: o.totalWeight || "700",
      type: isPaid ? "non-cod" : "cod",
      selected: true,
      mode: "",
      fulfillmentOrders: o.fulfillmentOrders?.nodes || [],
      productName,
      pieces,
      remarks: "",
      deliveryStatus: o.deliveryStatus?.value || "",
    });
  });

  return { unfulfilled, fulfilled, errors, shopId };
};

export default function OrdersPage() {
  const { unfulfilled, fulfilled, errors, shopId } = useLoaderData();

  return (
    <Page title="Ship Orders">
      <BlockStack gap="400">
        {fulfilled.length > 0 && (
          <Banner tone="info">
            <Text variant="bodyMd">
              Already fulfilled: {fulfilled.join(", ")}
            </Text>
          </Banner>
        )}
        {errors.length > 0 && (
          <Banner tone="critical">
            <Text variant="bodyMd">
              Failed to load {errors.length} order(s). They may have been rate-limited.
            </Text>
          </Banner>
        )}
        {unfulfilled.length === 0 ? (
          <Card>
            <Text variant="bodyMd">No unfulfilled orders to ship.</Text>
          </Card>
        ) : (
          <AddOrder initialOrders={unfulfilled} shopId={shopId || ""} />
        )}
      </BlockStack>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
