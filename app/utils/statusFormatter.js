export const ORDER_STATUSES = [
  "pending",
  "awaiting_pickup",
  "picked_up",
  "arrived_at_origin_hub",
  "in_transit",
  "arrived_at_destination_hub",
  "assign_to_courier",
  "reason_validation",
  "shipper_advice",
  "hold",
  "delivery_unsuccessful",
  "mis_route",
  "re_attempt",
  "ready_for_return",
  "return_in_transit",
  "being_return",
  "return_dispatched",
  "returned_to_shipper",
  "unable_to_return",
  "return_unsuccessful",
  "delivered",
  "cancelled",
  "returned",
  "rejected",
  "booked",
  "arrived_at_warehouse",
  "dispatched",
];

export function formatDeliveryStatus(status) {
  const statusMap = {};

  ORDER_STATUSES.forEach((statusKey) => {
    statusMap[statusKey] = statusKey
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  });

  const customMappings = {
    arrived_at_origin_hub: "At Origin Hub",
    arrived_at_destination_hub: "At Destination Hub",
    assign_to_courier: "Assigned to Courier",
    mis_route: "Mis-routed",
    re_attempt: "Re-attempt",
    being_return: "Being Returned",
    arrived_at_warehouse: "At Warehouse",
  };

  return (
    customMappings[status] ||
    statusMap[status] ||
    status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
  );
}
