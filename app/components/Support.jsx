import { Card, Text, BlockStack, InlineStack, Link } from "@shopify/polaris";

export default function Support() {
  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Contact Support</Text>
          <BlockStack gap="200">
            <InlineStack gap="200">
              <Text variant="bodyMd" fontWeight="semibold">Email:</Text>
              <Link url="mailto:info@dastaqlogistics.com">info@dastaqlogistics.com</Link>
            </InlineStack>
            <InlineStack gap="200">
              <Text variant="bodyMd" fontWeight="semibold">WhatsApp:</Text>
              <Link url="https://wa.me/923390060137" external>+92 339 0060137</Link>
            </InlineStack>
          </BlockStack>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Support Hours</Text>
          <BlockStack gap="100">
            <Text variant="bodyMd">Monday – Friday: 9:00 AM – 6:00 PM (PKT)</Text>
            <Text variant="bodyMd">Saturday: 9:00 AM – 2:00 PM (PKT)</Text>
            <Text variant="bodyMd">Sunday: Closed</Text>
          </BlockStack>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Office Address</Text>
          <Text variant="bodyMd">
            274-B, 2nd Floor, Faisal Heights, Peoples Colony No. 1, Faisalabad
          </Text>
        </BlockStack>
      </Card>
    </BlockStack>
  );
}
