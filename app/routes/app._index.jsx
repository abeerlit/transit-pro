import { useState, useCallback } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { Page } from "@shopify/polaris";
import AddOrder from "../components/AddOrder";
import Dashboard from "../components/Dashboard";
import Setup from "../components/Setup";
import Support from "../components/Support";
import { BASEURL } from "../utils/constants";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const after = url.searchParams.get("after") || null;
  const before = url.searchParams.get("before") || null;
  const pageSize = parseInt(url.searchParams.get("pageSize") || "10");

  const paginationArgs = before
    ? `last: ${pageSize}, before: "${before}"`
    : `first: ${pageSize}${after ? `, after: "${after}"` : ""}`;

  const shopResponse = await admin.graphql(`#graphql
    query { shop { id } }
  `);
  const shopJson = await shopResponse.json();
  const shop = shopJson.data?.shop;

  const ordersResponse = await admin.graphql(
    `#graphql
    query GetOrders($query: String) {
      orders(${paginationArgs}, query: $query, sortKey: CREATED_AT, reverse: true) {
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
        edges {
          cursor
          node {
            id
            name
            cancelledAt
            totalWeight
            displayFinancialStatus
            customer {
              displayName
              phone
              email
            }
            shippingAddress {
              name
              address1
              address2
              city
              province
              zip
              country
              phone
            }
            currentTotalPriceSet {
              shopMoney { amount }
            }
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
            deliveryStatus: metafield(namespace: "custom", key: "delivery_status") {
              value
            }
          }
        }
      }
    }`,
    {
      variables: {
        query: "fulfillment_status:unfulfilled status:open NOT tag:dastaq",
      },
    }
  );

  const ordersData = await ordersResponse.json();
  const ordersEdges = ordersData.data?.orders?.edges || [];
  const pageInfo = ordersData.data?.orders?.pageInfo || {};

  // Match dastaq filtering: exclude CLOSED/CANCELLED FOs, require remainingQuantity > 0
  const filteredEdges = ordersEdges.filter((edge) => {
    const activeFOs = (edge.node.fulfillmentOrders?.nodes || []).filter(
      (fo) => fo?.status !== "CLOSED" && fo?.status !== "CANCELLED"
    );
    if (activeFOs.length === 0) return false;
    for (const fo of activeFOs) {
      for (const itemEdge of fo.lineItems?.edges || []) {
        if ((itemEdge?.node?.remainingQuantity ?? 0) > 0) return true;
      }
    }
    return false;
  });

  const orderNames = filteredEdges.map((e) => e.node.name);

  // Fetch existing Dastaq order data to pre-populate consignee address
  let existingOrdersMap = {};
  try {
    const bulkRes = await fetch(`${BASEURL}/api/orders/shopify/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderNames }),
    });
    if (bulkRes.ok) {
      const bulkData = await bulkRes.json();
      for (const o of bulkData?.data || []) {
        existingOrdersMap[o.orderName || o.name] = o;
      }
    }
  } catch (_) {}

  const orders = filteredEdges.map((edge, idx) => {
    const o = edge.node;
    const addr = o.shippingAddress;
    const existing = existingOrdersMap[o.name];

    // Build line items from the latest active fulfillment order (same as dastaq)
    const activeFOs = (o.fulfillmentOrders?.nodes || []).filter(
      (fo) => fo?.status !== "CLOSED" && fo?.status !== "CANCELLED"
    );
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
      const qty =
        itemEdge?.node?.remainingQuantity ??
        itemEdge?.node?.totalQuantity ??
        0;
      if (!currentItemsMap.has(id)) {
        currentItemsMap.set(id, { id, title, sku, variantTitle, quantity: qty });
      } else {
        currentItemsMap.get(id).quantity += qty;
      }
    }
    const lineItems = Array.from(currentItemsMap.values()).filter(
      (item) => (item.quantity || 0) > 0
    );

    const productName = lineItems.length
      ? lineItems.map((li) => `${li.title} x ${li.quantity}`).join(", ") + "."
      : "";
    const pieces = lineItems.reduce((sum, li) => sum + (li.quantity || 0), 0);

    const isPaid = o.displayFinancialStatus === "PAID";
    const rawAmount = o.currentTotalPriceSet?.shopMoney?.amount;
    const cod = isPaid ? "0" : rawAmount ? parseFloat(rawAmount).toString() : "";
    const type = isPaid ? "non-cod" : "cod";

    const consigneeAddress =
      existing?.consigneeAddress ||
      [addr?.address1, addr?.address2].filter(Boolean).join(", ");

    return {
      id: idx + 1,
      orderId: o.id,
      order: o.name,
      name: addr?.name || "",
      phone: addr?.phone || "",
      phone2: o.customer?.phone || "",
      email: o.customer?.email || "",
      address: consigneeAddress,
      consigneeAddress,
      city: addr?.city || "",
      province: addr?.province || "",
      zip: addr?.zip || "",
      country: addr?.country || "",
      lineItems,
      cod,
      weight: o.totalWeight || "700",
      type,
      selected: true,
      mode: "",
      fulfillmentOrders: o.fulfillmentOrders?.nodes || [],
      productName,
      pieces,
      remarks: "",
      deliveryStatus: o.deliveryStatus?.value || "",
    };
  });

  return { orders, shopData: shop, pageInfo, _timestamp: Date.now() };
};

export const shouldRevalidate = () => true;

const TABS = ["Dashboard", "Add Booking", "Setup", "Support"];

export default function Index() {
  const { orders, shopData } = useLoaderData();
  const [activeTab, setActiveTab] = useState(0);
  const revalidator = useRevalidator();

  const handleTabChange = useCallback(
    (tab) => {
      setActiveTab(tab);
      if (tab === 1) {
        setTimeout(() => revalidator.revalidate(), 50);
      }
    },
    [revalidator]
  );

  return (
    <Page>
      <div style={{ marginBottom: 16, display: "flex", gap: 4 }}>
        {TABS.map((tab, i) => (
          <button
            key={tab}
            onClick={() => handleTabChange(i)}
            style={{
              padding: "8px 18px",
              border: "1px solid #ccc",
              borderRadius: 4,
              background: activeTab === i ? "#008060" : "#fff",
              color: activeTab === i ? "#fff" : "#333",
              cursor: "pointer",
              fontWeight: activeTab === i ? 600 : 400,
              fontSize: 14,
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 0 && <Dashboard />}
      {activeTab === 1 && (
        <AddOrder initialOrders={orders} shopId={shopData?.id || ""} />
      )}
      {activeTab === 2 && <Setup shopId={shopData?.id || ""} />}
      {activeTab === 3 && <Support />}
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
