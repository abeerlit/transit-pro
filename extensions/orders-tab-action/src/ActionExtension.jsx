import { useEffect, useState } from "react";
import {
  reactExtension,
  useApi,
  AdminAction,
  BlockStack,
  Button,
  Text,
  Link,
} from "@shopify/ui-extensions-react/admin";

const TARGET = "admin.order-index.selection-action.render";
export default reactExtension(TARGET, () => <App />);

function App() {
  const { data } = useApi(TARGET);
  const selectedOrderIds = data.selected.map((order) => order.id.split("/").pop());

  const [shopHandle, setShopHandle] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("shopify:admin/api/graphql.json", {
          method: "POST",
          body: JSON.stringify({
            query: `query { shop { myshopifyDomain } }`,
          }),
        });
        if (res.ok) {
          const response = await res.json();
          const fullDomain = response?.data?.shop?.myshopifyDomain;
          if (fullDomain) {
            setShopHandle(fullDomain.replace(".myshopify.com", ""));
          }
        }
      } catch (error) {
        console.error("Failed to fetch shop info:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // NOTE: Update "transit-pro" below to match your actual Shopify app handle
  // found in your Shopify Partner Dashboard under App setup.
  const appUrl = `https://admin.shopify.com/store/${shopHandle}/apps/transit-pro-1/app/orders/${selectedOrderIds.join(",")}`;

  return (
    <AdminAction>
      <BlockStack>
        <Text>Selected Orders: {selectedOrderIds.length}</Text>
        <Link href={appUrl}>
          <Button disabled={loading} variant="primary">
            Click here to continue shipping in Transit Pro.
          </Button>
        </Link>
      </BlockStack>
    </AdminAction>
  );
}
