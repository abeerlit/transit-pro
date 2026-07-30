import { redirect } from "react-router";
import { authenticate } from "../shopify.server";

// Redirect route: collects order IDs from extension query params and sends to /app/orders/$orderIds
export const loader = async ({ request }) => {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const rawIds = [
    ...url.searchParams.getAll("ids[]"),
    ...url.searchParams.getAll("ids"),
    ...(url.searchParams.get("id") ? [url.searchParams.get("id")] : []),
  ];

  // Normalize GIDs: strip prefix if present
  const ids = rawIds.map((id) => {
    if (id.includes("gid://")) return id.split("/").pop();
    return id;
  });

  if (ids.length === 0) return redirect("/app");
  return redirect(`/app/orders/${ids.join(",")}`);
};

export default function OrdersIndex() {
  return null;
}
