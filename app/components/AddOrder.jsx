import { useState, useEffect, useCallback, useRef } from "react";
import {
  Card, Text, BlockStack, InlineStack, Button, Checkbox, Badge,
  Banner, Modal, TextField, Spinner, Select as PolarisSelect,
} from "@shopify/polaris";
import Select from "react-select";
import { useRevalidator } from "react-router";
import AddressComponent from "./AddressComponent";
import { BASEURL, DASTAQ_NOTE_STORAGE_KEY } from "../utils/constants";
import { logger } from "../utils/logger";

const MODE_OPTIONS = [
  { value: "overnight", label: "Overnight" },
  { value: "detain", label: "Detain" },
  { value: "overland", label: "Overland" },
];

function convertPhoneNumber(phone) {
  if (!phone) return "";
  let p = phone.replace(/\s+/g, "").replace(/-/g, "");
  if (p.startsWith("+92")) p = "0" + p.slice(3);
  else if (p.startsWith("92") && p.length > 10) p = "0" + p.slice(2);
  return p;
}

export default function AddOrder({ initialOrders, shopId }) {
  const [orders, setOrders] = useState(() =>
    initialOrders.map((o) => ({
      ...o,
      phone: convertPhoneNumber(o.phone),
      selected: false,
    }))
  );
  const [cities, setCities] = useState([]);
  const [pickupAddress, setPickupAddress] = useState(null);
  const [shipping, setShipping] = useState(false);
  const [successOrders, setSuccessOrders] = useState([]);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [editingOrder, setEditingOrder] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [pageSize, setPageSize] = useState(10);
  const revalidator = useRevalidator();

  // Sync orders when initialOrders changes (e.g., after revalidation)
  const prevOrderIds = useRef(initialOrders.map((o) => o.orderId).join(","));
  useEffect(() => {
    const newIds = initialOrders.map((o) => o.orderId).join(",");
    if (newIds !== prevOrderIds.current) {
      prevOrderIds.current = newIds;
      setOrders(
        initialOrders.map((o) => ({
          ...o,
          phone: convertPhoneNumber(o.phone),
          selected: false,
        }))
      );
    }
  }, [initialOrders]);

  // Fetch allowed cities
  useEffect(() => {
    if (!shopId) return;
    (async () => {
      try {
        const res = await fetch(`${BASEURL}/api/shopify/allowed-cities`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shopifyStoreId: shopId }),
        });
        if (res.ok) {
          const data = await res.json();
          setCities(data?.data?.allowedCities || []);
        }
      } catch (e) {
        logger.error("Failed to fetch cities", e);
      }
    })();
  }, [shopId]);

  // Normalize order cities to match allowed cities (case-insensitive)
  useEffect(() => {
    if (!cities.length) return;
    setOrders((prev) =>
      prev.map((o) => {
        const match = cities.find(
          (c) => c.toLowerCase() === o.city.toLowerCase()
        );
        return match ? { ...o, city: match } : o;
      })
    );
  }, [cities]);

  const cityOptions = cities.map((c) => ({ value: c, label: c }));

  const selectedOrders = orders.filter((o) => o.selected);

  const isShipDisabled =
    !pickupAddress ||
    selectedOrders.length === 0 ||
    selectedOrders.some(
      (o) => !o.city || !cities.includes(o.city) || !o.mode
    );

  const toggleSelect = (orderId) => {
    setOrders((prev) =>
      prev.map((o) => (o.orderId === orderId ? { ...o, selected: !o.selected } : o))
    );
  };

  const toggleSelectAll = () => {
    const allSelected = orders.every((o) => o.selected);
    setOrders((prev) => prev.map((o) => ({ ...o, selected: !allSelected })));
  };

  const updateOrderField = (orderId, field, value) => {
    setOrders((prev) =>
      prev.map((o) => (o.orderId === orderId ? { ...o, [field]: value } : o))
    );
  };

  const openEdit = (order) => {
    setEditingOrder(order);
    setEditDraft({
      productName: order.productName || "",
      pieces: order.pieces || "",
      address: order.consigneeAddress || order.address || "",
      remarks: order.remarks || "",
    });
  };

  const saveEdit = () => {
    if (!editingOrder) return;
    setOrders((prev) =>
      prev.map((o) =>
        o.orderId === editingOrder.orderId
          ? {
              ...o,
              productName: editDraft.productName,
              pieces: Number(editDraft.pieces) || o.pieces,
              consigneeAddress: editDraft.address,
              address: editDraft.address,
              remarks: editDraft.remarks,
            }
          : o
      )
    );
    setEditingOrder(null);
  };

  const handleShip = async () => {
    setShipping(true);
    setErrorMsg("");
    const showNote = localStorage.getItem(DASTAQ_NOTE_STORAGE_KEY) === "true";

    const payload = selectedOrders.map((o) => ({
      orderId: o.orderId,
      orderName: o.order,
      name: o.name,
      phone: o.phone,
      phone2: o.phone2 || "",
      address: o.consigneeAddress || o.address,
      city: o.city,
      cod: o.cod,
      type: o.type,
      mode: o.mode,
      productName: o.productName,
      pieces: o.pieces,
      remarks: o.remarks || "",
      fulfillmentOrders: o.fulfillmentOrders || [],
    }));

    try {
      const res = await fetch(`${BASEURL}/api/orders/shopify/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders: payload, shopifyStoreId: shopId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErrorMsg(err?.message || "Failed to create shipments.");
        setShipping(false);
        return;
      }

      const data = await res.json();
      const created = data?.data?.orders || [];

      // Fulfill each order in Shopify
      const FULFILL_MAX_ATTEMPTS = 3;
      const FULFILL_RETRY_DELAY_MS = 1500;
      const fulfilled = [];

      for (const orig of selectedOrders) {
        // Extract raw numeric order ID from the GID
        const match = orig.orderId.match(/Order\/(\d+)$/);
        const orderId = match ? match[1] : null;
        if (!orderId) continue;

        // Pick the latest active fulfillment order
        const fulfillmentOrders = orig.fulfillmentOrders || [];
        const activeFOs = fulfillmentOrders.filter(
          (fo) => fo?.status !== "CLOSED" && fo?.status !== "CANCELLED"
        );
        const ts = (fo) => new Date(fo?.updatedAt || fo?.createdAt || 0).getTime();
        const latestFO = (activeFOs.length ? activeFOs : fulfillmentOrders).sort(
          (a, b) => ts(b) - ts(a)
        )[0];
        if (!latestFO?.id) continue;

        // Find the tracking number returned by the Dastaq backend for this order
        const orderTrackingInfo = created.find((o) => o.orderId === orig.orderId);
        const trackingNumber = orderTrackingInfo?.trackingNumber || "";
        const trackingInfo = {
          company: "other",
          number: trackingNumber,
          url: "https://www.dastaqlogistics.com/track.html?number=" + trackingNumber,
        };

        let success = false;
        for (let attempt = 1; attempt <= FULFILL_MAX_ATTEMPTS && !success; attempt++) {
          try {
            const fd = new FormData();
            fd.set("orderId", orderId);
            fd.set("fulfillmentOrderId", latestFO.id);
            fd.set("trackingInfo", JSON.stringify(trackingInfo));
            fd.set("action", "fulfill_and_tag");
            fd.set("showDastaqNote", String(showNote));

            const fulfillRes = await fetch("/api/shopify/fulfill", {
              method: "POST",
              body: fd,
              credentials: "same-origin",
            });
            const fulfillData = await fulfillRes.json().catch(() => ({}));
            if (fulfillRes.ok && fulfillData?.success) {
              success = true;
              fulfilled.push({ ...orig, trackingNumber });
            }
          } catch (fulfillErr) {
            logger.error("Fulfill request error", fulfillErr);
          }
          if (!success && attempt < FULFILL_MAX_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, FULFILL_RETRY_DELAY_MS * attempt));
          }
        }
      }

      setSuccessOrders(fulfilled);
      setShowSuccessModal(true);
    } catch (e) {
      setErrorMsg("Network error. Please try again.");
      logger.error("Ship error", e);
    } finally {
      setShipping(false);
    }
  };

  const handleSuccessClose = () => {
    setShowSuccessModal(false);
    setSuccessOrders([]);
    revalidator.revalidate();
  };

  const displayedOrders = orders.slice(0, pageSize);
  const allSelected = orders.length > 0 && orders.every((o) => o.selected);

  return (
    <BlockStack gap="400">
      {errorMsg && (
        <Banner tone="critical" onDismiss={() => setErrorMsg("")}>
          <Text>{errorMsg}</Text>
        </Banner>
      )}

      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Pickup Address</Text>
          <AddressComponent
            shopId={shopId}
            onAddressChange={setPickupAddress}
          />
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <InlineStack align="space-between">
            <Text as="h2" variant="headingMd">
              Unfulfilled Orders ({orders.length})
            </Text>
            <InlineStack gap="200">
              <PolarisSelect
                label=""
                labelHidden
                options={[
                  { label: "10 per page", value: "10" },
                  { label: "50 per page", value: "50" },
                  { label: "100 per page", value: "100" },
                ]}
                value={String(pageSize)}
                onChange={(v) => setPageSize(Number(v))}
              />
              <Button
                variant="primary"
                onClick={handleShip}
                disabled={isShipDisabled}
                loading={shipping}
              >
                Ship Selected ({selectedOrders.length})
              </Button>
            </InlineStack>
          </InlineStack>

          {orders.length === 0 ? (
            <Text variant="bodyMd" tone="subdued">No unfulfilled orders found.</Text>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }}>
                    <th style={thStyle}>
                      <Checkbox
                        label=""
                        labelHidden
                        checked={allSelected}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th style={thStyle}>Order</th>
                    <th style={thStyle}>Customer</th>
                    <th style={thStyle}>Product</th>
                    <th style={thStyle}>Pieces</th>
                    <th style={thStyle}>Address</th>
                    <th style={thStyle}>City</th>
                    <th style={thStyle}>COD</th>
                    <th style={thStyle}>Mode</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedOrders.map((order) => {
                    const cityValid = !order.city || cities.includes(order.city);
                    return (
                      <tr
                        key={order.orderId}
                        style={{
                          borderBottom: "1px solid #e1e3e5",
                          background: order.selected ? "#f0faf6" : "white",
                        }}
                      >
                        <td style={tdStyle}>
                          <Checkbox
                            label=""
                            labelHidden
                            checked={order.selected}
                            onChange={() => toggleSelect(order.orderId)}
                          />
                        </td>
                        <td style={tdStyle}>
                          <Text variant="bodyMd" fontWeight="semibold">{order.order}</Text>
                        </td>
                        <td style={tdStyle}>
                          <BlockStack gap="0">
                            <Text variant="bodyMd">{order.name}</Text>
                            <Text variant="bodySm" tone="subdued">{order.phone}</Text>
                          </BlockStack>
                        </td>
                        <td style={tdStyle}>
                          <Text variant="bodyMd">{order.productName}</Text>
                        </td>
                        <td style={tdStyle}>
                          <Text variant="bodyMd">{order.pieces}</Text>
                        </td>
                        <td style={{ ...tdStyle, maxWidth: 180 }}>
                          <Text variant="bodyMd">{order.consigneeAddress || order.address}</Text>
                        </td>
                        <td style={{ ...tdStyle, minWidth: 160 }}>
                          <Select
                            options={cityOptions}
                            value={cityOptions.find((c) => c.value === order.city) || null}
                            onChange={(opt) => updateOrderField(order.orderId, "city", opt?.value || "")}
                            placeholder="Select city"
                            menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                            styles={{
                              menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                              control: (base) => ({
                                ...base,
                                borderColor: cityValid ? base.borderColor : "#d82c0d",
                                minWidth: 150,
                              }),
                            }}
                          />
                          {!cityValid && order.city && (
                            <Text variant="bodySm" tone="critical">City not in allowed list</Text>
                          )}
                        </td>
                        <td style={tdStyle}>
                          <Badge tone={order.type === "cod" ? "warning" : "success"}>
                            {order.type === "cod" ? `COD: ${order.cod}` : "Prepaid"}
                          </Badge>
                        </td>
                        <td style={{ ...tdStyle, minWidth: 150 }}>
                          <Select
                            options={MODE_OPTIONS}
                            value={MODE_OPTIONS.find((m) => m.value === order.mode) || null}
                            onChange={(opt) => updateOrderField(order.orderId, "mode", opt?.value || "")}
                            placeholder="Select mode"
                            menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                            styles={{ menuPortal: (base) => ({ ...base, zIndex: 9999 }) }}
                          />
                        </td>
                        <td style={tdStyle}>
                          {order.deliveryStatus ? (
                            <Badge>{order.deliveryStatus}</Badge>
                          ) : (
                            <Text variant="bodySm" tone="subdued">—</Text>
                          )}
                        </td>
                        <td style={tdStyle}>
                          <Button size="slim" onClick={() => openEdit(order)}>
                            Edit
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {orders.length > pageSize && (
                <div style={{ padding: "12px", textAlign: "center" }}>
                  <Text variant="bodySm" tone="subdued">
                    Showing {pageSize} of {orders.length} orders. Increase page size to see more.
                  </Text>
                </div>
              )}
            </div>
          )}
        </BlockStack>
      </Card>

      {/* Edit modal */}
      {editingOrder && (
        <Modal
          open
          onClose={() => setEditingOrder(null)}
          title={`Edit Order ${editingOrder.order}`}
          primaryAction={{ content: "Save", onAction: saveEdit }}
          secondaryActions={[{ content: "Cancel", onAction: () => setEditingOrder(null) }]}
        >
          <Modal.Section>
            <BlockStack gap="300">
              <TextField
                label="Product Name"
                value={editDraft.productName}
                onChange={(v) => setEditDraft((d) => ({ ...d, productName: v }))}
                autoComplete="off"
              />
              <TextField
                label="Pieces"
                type="number"
                value={String(editDraft.pieces)}
                onChange={(v) => setEditDraft((d) => ({ ...d, pieces: v }))}
                autoComplete="off"
              />
              <TextField
                label="Address"
                value={editDraft.address}
                onChange={(v) => setEditDraft((d) => ({ ...d, address: v }))}
                autoComplete="off"
                multiline={2}
              />
              <TextField
                label="Remarks"
                value={editDraft.remarks}
                onChange={(v) => setEditDraft((d) => ({ ...d, remarks: v }))}
                autoComplete="off"
                multiline={2}
              />
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}

      {/* Success modal */}
      {showSuccessModal && (
        <Modal
          open
          onClose={handleSuccessClose}
          title="Shipments Created Successfully"
          primaryAction={{ content: "Done", onAction: handleSuccessClose }}
        >
          <Modal.Section>
            <BlockStack gap="200">
              <Text variant="bodyMd">
                {successOrders.length} shipment(s) were created:
              </Text>
              {successOrders.map((o) => (
                <InlineStack key={o.orderId} gap="400">
                  <Text variant="bodyMd" fontWeight="semibold">{o.order}</Text>
                  <Text variant="bodyMd">Tracking: {o.trackingNumber}</Text>
                </InlineStack>
              ))}
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}
    </BlockStack>
  );
}

const thStyle = {
  padding: "8px 12px",
  textAlign: "left",
  fontWeight: 600,
  fontSize: 12,
  color: "#6d7175",
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "8px 12px",
  verticalAlign: "middle",
};
