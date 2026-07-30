export function buildConsigneeAddress(shippingAddress) {
  if (!shippingAddress) return "";
  return [shippingAddress.address1, shippingAddress.address2]
    .filter(Boolean)
    .join(", ");
}

export function resolveOrderAddress(order) {
  return (order.consigneeAddress || order.address || "").trim();
}
