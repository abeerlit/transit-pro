import { useState, useEffect, useRef, memo } from "react";
import { Text, BlockStack, InlineStack, Spinner } from "@shopify/polaris";
import Select from "react-select";
import { BASEURL } from "../utils/constants";

function AddressComponent({ shopId, title, className, onAddressChange }) {
  const [addresses, setAddresses] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shopId) return;
    (async () => {
      try {
        const res = await fetch(`${BASEURL}/api/shopify/pickup-addresses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shopifyStoreId: shopId }),
        });
        if (res.ok) {
          const data = await res.json();
          const list = data?.data || [];
          setAddresses(list);
          if (list.length > 0) {
            setSelected(list[0]);
            onAddressChange?.(list[0]);
          }
        }
      } catch (_) {}
      finally {
        setLoading(false);
      }
    })();
  }, [shopId]);

  const handleChange = (opt) => {
    const addr = addresses.find((a) => a.id === opt?.value);
    setSelected(addr || null);
    onAddressChange?.(addr || null);
  };

  const options = addresses.map((a) => ({
    value: a.id,
    label: `${a.name} — ${a.city}`,
  }));

  if (loading) {
    return (
      <InlineStack gap="200" align="center">
        <Spinner size="small" />
        <Text variant="bodyMd">Loading pickup addresses…</Text>
      </InlineStack>
    );
  }

  return (
    <div className={className}>
      {title && <Text as="h3" variant="headingMd">{title}</Text>}
      <BlockStack gap="200">
        <Select
          options={options}
          value={options.find((o) => o.value === selected?.id) || null}
          onChange={handleChange}
          placeholder="Select pickup address"
          menuPortalTarget={typeof document !== "undefined" ? document.body : null}
          styles={{ menuPortal: (base) => ({ ...base, zIndex: 9999 }) }}
        />
        {selected && (
          <BlockStack gap="100">
            <InlineStack gap="200">
              <Text variant="bodyMd" fontWeight="semibold">Name:</Text>
              <Text variant="bodyMd">{selected.name}</Text>
            </InlineStack>
            <InlineStack gap="200">
              <Text variant="bodyMd" fontWeight="semibold">Phone:</Text>
              <Text variant="bodyMd">{selected.shipperPhone}</Text>
            </InlineStack>
            <InlineStack gap="200">
              <Text variant="bodyMd" fontWeight="semibold">City:</Text>
              <Text variant="bodyMd">{selected.city}</Text>
            </InlineStack>
            <InlineStack gap="200">
              <Text variant="bodyMd" fontWeight="semibold">Address:</Text>
              <Text variant="bodyMd">{selected.address}</Text>
            </InlineStack>
          </BlockStack>
        )}
      </BlockStack>
    </div>
  );
}

function arePropsEqual(prev, next) {
  return (
    prev.shopId === next.shopId &&
    prev.title === next.title &&
    prev.className === next.className &&
    prev.onAddressChange === next.onAddressChange
  );
}

export default memo(AddressComponent, arePropsEqual);
