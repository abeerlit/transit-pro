import { useState } from "react";
import { Card, Text, BlockStack, InlineStack, Button, Modal, Link } from "@shopify/polaris";

const VIDEOS = [
  {
    title: "Getting Started with Transit Pro",
    url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
  },
  {
    title: "How to Ship Orders",
    url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
  },
];

export default function Dashboard() {
  const [activeVideo, setActiveVideo] = useState(null);

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Welcome to Transit Pro</Text>
          <Text variant="bodyMd">
            Transit Pro provides Same Day, Overnight, and Overland courier
            services across Pakistan. To get started, go to the <strong>Setup</strong> tab
            to connect your Dastaq account, then use <strong>Add Booking</strong> to ship your
            orders.
          </Text>
          <Text variant="bodyMd">
            Need help? Email us at{" "}
            <Link url="mailto:info@dastaqlogistics.com">info@dastaqlogistics.com</Link>
          </Text>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Setup Instructions</Text>
          <Text variant="bodyMd">Watch the guides below to learn how to use the app:</Text>
          <InlineStack gap="300">
            {VIDEOS.map((v, i) => (
              <Button key={i} onClick={() => setActiveVideo(v)}>
                {v.title}
              </Button>
            ))}
          </InlineStack>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">About Transit Pro</Text>
          <Text variant="bodyMd">
            Transit Pro is a Pakistan-based courier service offering:
          </Text>
          <BlockStack gap="100">
            <Text variant="bodyMd">• Same Day Delivery</Text>
            <Text variant="bodyMd">• Overnight Delivery</Text>
            <Text variant="bodyMd">• Overland / Heavy Cargo</Text>
          </BlockStack>
          <BlockStack gap="100">
            <Text variant="bodyMd">📍 274-B, 2nd Floor, Faisal Heights, Peoples Colony No. 1, Faisalabad</Text>
            <Text variant="bodyMd">📞 +92 339 0060137</Text>
            <Text variant="bodyMd">✉️ info@dastaqlogistics.com</Text>
          </BlockStack>
        </BlockStack>
      </Card>

      {activeVideo && (
        <Modal
          open
          onClose={() => setActiveVideo(null)}
          title={activeVideo.title}
          large
        >
          <Modal.Section>
            <div style={{ position: "relative", paddingBottom: "56.25%", height: 0 }}>
              <iframe
                src={activeVideo.url}
                title={activeVideo.title}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  border: "none",
                }}
                allowFullScreen
              />
            </div>
          </Modal.Section>
        </Modal>
      )}
    </BlockStack>
  );
}
