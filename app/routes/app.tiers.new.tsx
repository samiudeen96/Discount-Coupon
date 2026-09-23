import { useState } from "react";
import type { ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useFetcher, useNavigate } from "@remix-run/react";
import {
  Page,
  Card,
  BlockStack,
  Button,
  InlineStack,
  Text,
  Thumbnail,
  Banner,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import TierRowsEditor, {
  emptyTierRow,
  type TierRow,
} from "../components/TierRowsEditor";
import {
  ensureTierDiscountIsActive,
  syncTierMetafield,
} from "../models/tierDiscount.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();

  const productGid = String(formData.get("productGid") || "");
  const productId = productGid.split("/").pop() || "";
  const title = String(formData.get("title") || "");
  const tiers = JSON.parse(String(formData.get("tiers") || "[]")) as {
    quantity: number;
    discountType: "FIXED" | "PERCENTAGE";
    price: number;
    label: string | null;
  }[];

  if (!productGid || tiers.length === 0) {
    return { error: "Pick a product and at least one tier." };
  }

  const tierDiscount = await db.tierDiscount.upsert({
    where: { shop_productGid: { shop: session.shop, productGid } },
    update: {
      title,
      isActive: true,
      tiers: {
        deleteMany: {},
        create: tiers.map((t, i) => ({
          quantity: t.quantity,
          discountType: t.discountType,
          price: t.price,
          label: t.label,
          position: i,
        })),
      },
    },
    create: {
      shop: session.shop,
      productGid,
      productId,
      title,
      tiers: {
        create: tiers.map((t, i) => ({
          quantity: t.quantity,
          discountType: t.discountType,
          price: t.price,
          label: t.label,
          position: i,
        })),
      },
    },
  });

  await syncTierMetafield(admin, productGid, tiers);
  await ensureTierDiscountIsActive(admin);

  return redirect(`/app/tiers/${tierDiscount.id}`);
};

export default function NewTierDiscount() {
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const fetcher = useFetcher<typeof action>();

  const [product, setProduct] = useState<{
    id: string;
    title: string;
    image?: string;
  } | null>(null);
  const [rows, setRows] = useState<TierRow[]>([
    emptyTierRow("tier-1"),
    emptyTierRow("tier-2"),
  ]);

  const pickProduct = async () => {
    const selection = await shopify.resourcePicker({
      type: "product",
      multiple: false,
    });
    if (selection && selection.length > 0) {
      const p = selection[0];
      setProduct({
        id: p.id,
        title: p.title,
        image: p.images?.[0]?.originalSrc,
      });
    }
  };

  const canSave =
    product &&
    rows.every((r) => r.quantity && r.price) &&
    rows.length > 0;

  const handleSave = () => {
    if (!product) return;
    const tiers = rows.map((r) => ({
      quantity: Number(r.quantity),
      discountType: r.discountType,
      price: Number(r.price),
      label: r.label || null,
    }));
    fetcher.submit(
      {
        productGid: product.id,
        title: product.title,
        tiers: JSON.stringify(tiers),
      },
      { method: "post" },
    );
  };

  return (
    <Page>
      <TitleBar title="New tier discount">
        <button variant="breadcrumb" onClick={() => navigate("/app/tiers")}>
          Tier Discounts
        </button>
      </TitleBar>
      <BlockStack gap="400">
        {fetcher.data?.error && (
          <Banner tone="critical">{fetcher.data.error}</Banner>
        )}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Product
            </Text>
            {product ? (
              <InlineStack gap="300" blockAlign="center">
                <Thumbnail source={product.image || ""} alt={product.title} />
                <Text as="span" variant="bodyMd" fontWeight="semibold">
                  {product.title}
                </Text>
                <Button variant="plain" onClick={pickProduct}>
                  Change
                </Button>
              </InlineStack>
            ) : (
              <InlineStack>
                <Button onClick={pickProduct}>Select product</Button>
              </InlineStack>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Quantity tiers
            </Text>
            <TierRowsEditor rows={rows} onChange={setRows} />
          </BlockStack>
        </Card>

        <InlineStack>
          <Button
            variant="primary"
            disabled={!canSave}
            loading={fetcher.state !== "idle"}
            onClick={handleSave}
          >
            Save tier discount
          </Button>
        </InlineStack>
      </BlockStack>
    </Page>
  );
}
