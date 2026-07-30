import { useState, useEffect, useCallback } from "react";
import { Card, Text, BlockStack, InlineStack, Button, TextField, Banner, Spinner } from "@shopify/polaris";
import { BASEURL, DASTAQ_NOTE_STORAGE_KEY } from "../utils/constants";

export default function Setup({ shopId }) {
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [delinking, setDelinking] = useState(false);
  const [error, setError] = useState("");
  const [showNote, setShowNote] = useState(false);

  const checkConnection = useCallback(async () => {
    if (!shopId) return;
    setChecking(true);
    try {
      const res = await fetch(`${BASEURL}/api/shopify/check-id`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopifyStoreId: shopId }),
      });
      setConnected(res.ok);
    } catch (_) {
      setConnected(false);
    } finally {
      setChecking(false);
    }
  }, [shopId]);

  useEffect(() => {
    checkConnection();
    const stored = localStorage.getItem(DASTAQ_NOTE_STORAGE_KEY);
    setShowNote(stored === "true");

    const onVisibility = () => {
      if (document.visibilityState === "visible") checkConnection();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [checkConnection]);

  const handleConnect = async () => {
    setError("");
    setConnecting(true);
    try {
      const res = await fetch(`${BASEURL}/api/shopify/integrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, apiSecret, shopifyStoreId: shopId }),
      });
      if (res.ok) {
        setConnected(true);
        setApiKey("");
        setApiSecret("");
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data?.message || "Failed to connect. Check your API credentials.");
      }
    } catch (_) {
      setError("Network error. Please try again.");
    } finally {
      setConnecting(false);
    }
  };

  const handleDelink = async () => {
    setDelinking(true);
    try {
      await fetch(`${BASEURL}/api/shopify/remove`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopifyStoreId: shopId }),
      });
      setConnected(false);
    } catch (_) {}
    finally {
      setDelinking(false);
    }
  };

  const toggleNote = () => {
    const next = !showNote;
    setShowNote(next);
    localStorage.setItem(DASTAQ_NOTE_STORAGE_KEY, String(next));
  };

  if (checking) {
    return (
      <Card>
        <InlineStack align="center">
          <Spinner size="small" />
          <Text variant="bodyMd">Checking connection…</Text>
        </InlineStack>
      </Card>
    );
  }

  return (
    <BlockStack gap="400">
      {connected ? (
        <Card>
          <BlockStack gap="300">
            <Banner tone="success">
              <Text variant="bodyMd">Your Transit Pro account is connected.</Text>
            </Banner>

            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">Order Note</Text>
              <Text variant="bodyMd">
                Add a tracking note to shipped orders in Shopify.
              </Text>
              <InlineStack gap="300" align="start">
                <Text variant="bodyMd">Show order note:</Text>
                <button
                  onClick={toggleNote}
                  style={{
                    width: 44,
                    height: 24,
                    borderRadius: 12,
                    border: "none",
                    cursor: "pointer",
                    background: showNote ? "#008060" : "#ccc",
                    position: "relative",
                    transition: "background 0.2s",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 2,
                      left: showNote ? 22 : 2,
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: "#fff",
                      transition: "left 0.2s",
                    }}
                  />
                </button>
              </InlineStack>
            </BlockStack>

            <Button
              tone="critical"
              onClick={handleDelink}
              loading={delinking}
            >
              Disconnect Dastaq Account
            </Button>
          </BlockStack>
        </Card>
      ) : (
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Connect Your Dastaq Account</Text>
            <Text variant="bodyMd">
              Enter your Dastaq API credentials to link your account.
            </Text>
            {error && <Banner tone="critical"><Text>{error}</Text></Banner>}
            <TextField
              label="API Key"
              value={apiKey}
              onChange={setApiKey}
              autoComplete="off"
            />
            <TextField
              label="API Secret"
              value={apiSecret}
              onChange={setApiSecret}
              type="password"
              autoComplete="off"
            />
            <Button
              variant="primary"
              onClick={handleConnect}
              loading={connecting}
              disabled={!apiKey || !apiSecret}
            >
              Connect
            </Button>
          </BlockStack>
        </Card>
      )}
    </BlockStack>
  );
}
