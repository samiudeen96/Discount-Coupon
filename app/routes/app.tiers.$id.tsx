import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useFetcher, useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Card,
  BlockStack,
  Button,
  InlineStack,
  Text,
  Banner,
  Badge,
  Modal,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import TierRowsEditor, { type TierRow } from "../components/TierRowsEditor";
import {
  clearTierMetafield,
  ensureTierDiscountIsActive,
  syncTierMetafield,
  validateTiers,
} from "../models/tierDiscount.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const tierDiscount = await db.tierDiscount.findFirst({
    where: { id: params.id, shop: session.shop },
    include: { tiers: { orderBy: { position: "asc" } } },
  });

  if (!tierDiscount) {
    throw new Response("Not found", { status: 404 });
  }

  // Best-effort: only used for the live savings preview in the editor.
  let unitPrice: number | null = null;
  let currencyCode: string | null = null;
  try {
    const response = await admin.graphql(
      `#graphql
        query TierDiscountProductPrice($id: ID!) {
          shop { currencyCode }
          product(id: $id) {
            variants(first: 1) {
              nodes { price }
            }
          }
        }`,
      { variables: { id: tierDiscount.productGid } },
    );
    const json = await response.json();
    const price = json?.data?.product?.variants?.nodes?.[0]?.price;
    unitPrice = price ? Number(price) : null;
    currencyCode = json?.data?.shop?.currencyCode ?? null;
  } catch {
    unitPrice = null;
    currencyCode = null;
  }

  return { tierDiscount, unitPrice, currencyCode };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "save");

  const tierDiscount = await db.tierDiscount.findFirst({
    where: { id: params.id, shop: session.shop },
    include: { tiers: { orderBy: { position: "asc" } } },
  });
  if (!tierDiscount) {
    throw new Response("Not found", { status: 404 });
  }

  if (intent === "delete") {
    await clearTierMetafield(admin, tierDiscount.productGid);
    await db.tierDiscount.delete({ where: { id: tierDiscount.id } });
    return redirect("/app/tiers");
  }

  if (intent === "toggle") {
    const nextActive = !tierDiscount.isActive;
    await db.tierDiscount.update({
      where: { id: tierDiscount.id },
      data: { isActive: nextActive },
    });

    if (nextActive) {
      await syncTierMetafield(
        admin,
        tierDiscount.productGid,
        tierDiscount.tiers.map((t) => ({
          quantity: t.quantity,
          hasMax: t.hasMax,
          maxQuantity: t.maxQuantity,
          discountType: t.discountType as "FIXED" | "PERCENTAGE",
          price: t.price,
          label: t.label,
        })),
      );
    } else {
      await clearTierMetafield(admin, tierDiscount.productGid);
    }

    return { ok: true, isActive: nextActive };
  }

  if (intent === "duplicate") {
    const targets = JSON.parse(
      String(formData.get("targets") || "[]"),
    ) as { id: string; title: string }[];

    for (const target of targets) {
      if (target.id === tierDiscount.productGid) continue;
      const targetProductId = target.id.split("/").pop() || "";

      await db.tierDiscount.upsert({
        where: {
          shop_productGid: { shop: session.shop, productGid: target.id },
        },
        update: {
          title: target.title,
          isActive: true,
          tiers: {
            deleteMany: {},
            create: tierDiscount.tiers.map((t, i) => ({
              quantity: t.quantity,
              hasMax: t.hasMax,
              maxQuantity: t.maxQuantity,
              discountType: t.discountType,
              price: t.price,
              label: t.label,
              position: i,
            })),
          },
        },
        create: {
          shop: session.shop,
          productGid: target.id,
          productId: targetProductId,
          title: target.title,
          tiers: {
            create: tierDiscount.tiers.map((t, i) => ({
              quantity: t.quantity,
              hasMax: t.hasMax,
              maxQuantity: t.maxQuantity,
              discountType: t.discountType,
              price: t.price,
              label: t.label,
              position: i,
            })),
          },
        },
      });

      await syncTierMetafield(
        admin,
        target.id,
        tierDiscount.tiers.map((t) => ({
          quantity: t.quantity,
          hasMax: t.hasMax,
          maxQuantity: t.maxQuantity,
          discountType: t.discountType as "FIXED" | "PERCENTAGE",
          price: t.price,
          label: t.label,
        })),
      );
    }

    if (targets.length > 0) {
      await ensureTierDiscountIsActive(admin);
    }

    return { ok: true, duplicated: targets.length };
  }

  const tiers = JSON.parse(String(formData.get("tiers") || "[]")) as {
    quantity: number;
    hasMax: boolean;
    maxQuantity: number | null;
    discountType: "FIXED" | "PERCENTAGE";
    price: number;
    label: string | null;
  }[];

  const validationError = validateTiers(tiers);
  if (validationError) {
    return { error: validationError };
  }

  await db.tier.deleteMany({ where: { tierDiscountId: tierDiscount.id } });
  await db.tierDiscount.update({
    where: { id: tierDiscount.id },
    data: {
      tiers: {
        create: tiers.map((t, i) => ({
          quantity: t.quantity,
          hasMax: t.hasMax,
          maxQuantity: t.maxQuantity,
          discountType: t.discountType,
          price: t.price,
          label: t.label,
          position: i,
        })),
      },
    },
  });

  await syncTierMetafield(admin, tierDiscount.productGid, tiers);
  await ensureTierDiscountIsActive(admin);

  return { ok: true };
};

export default function EditTierDiscount() {
  const { tierDiscount, unitPrice, currencyCode } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const fetcher = useFetcher<typeof action>();

  const [rows, setRows] = useState<TierRow[]>(
    tierDiscount.tiers.map((t) => ({
      key: t.id,
      quantity: String(t.quantity),
      hasMax: t.hasMax,
      maxQuantity: t.maxQuantity === null ? "" : String(t.maxQuantity),
      discountType: t.discountType as "FIXED" | "PERCENTAGE",
      price: String(t.price),
      label: t.label || "",
    })),
  );

  const canSave = rows.length > 0 && rows.every((r) => r.quantity && r.price);

  const handleSave = () => {
    const tiers = rows.map((r) => ({
      quantity: Number(r.quantity),
      hasMax: r.hasMax,
      maxQuantity: r.hasMax && r.maxQuantity ? Number(r.maxQuantity) : null,
      discountType: r.discountType,
      price: Number(r.price),
      label: r.label || null,
    }));
    fetcher.submit(
      { tiers: JSON.stringify(tiers) },
      { method: "post" },
    );
  };

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const handleDelete = () => {
    setDeleteModalOpen(false);
    fetcher.submit({ intent: "delete" }, { method: "post" });
  };

  const handleToggleActive = () => {
    fetcher.submit({ intent: "toggle" }, { method: "post" });
  };

  const handleDuplicate = async () => {
    const selection = await shopify.resourcePicker({
      type: "product",
      multiple: true,
    });
    if (!selection || selection.length === 0) return;

    const targets = selection.map((p) => ({ id: p.id, title: p.title }));
    fetcher.submit(
      { intent: "duplicate", targets: JSON.stringify(targets) },
      { method: "post" },
    );
  };

  const isActive =
    fetcher.data && "isActive" in fetcher.data
      ? fetcher.data.isActive
      : tierDiscount.isActive;

  return (
    <Page>
      <TitleBar title={tierDiscount.title}>
        <button variant="breadcrumb" onClick={() => navigate("/app/tiers")}>
          Tier Discounts
        </button>
      </TitleBar>
      <BlockStack gap="400">
        {fetcher.data && "error" in fetcher.data && (
          <Banner tone="critical">{fetcher.data.error}</Banner>
        )}
        {fetcher.data &&
          "ok" in fetcher.data &&
          !("isActive" in fetcher.data) &&
          !("duplicated" in fetcher.data) && (
            <Banner tone="success">Saved.</Banner>
          )}
        {fetcher.data && "duplicated" in fetcher.data && (
          <Banner tone="success">
            Copied these tiers to {fetcher.data.duplicated}{" "}
            {fetcher.data.duplicated === 1 ? "product" : "products"}.
          </Banner>
        )}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                Status
              </Text>
              <Badge tone={isActive ? "success" : undefined}>
                {isActive ? "Active" : "Inactive"}
              </Badge>
            </InlineStack>
            <Text as="p" tone="subdued" variant="bodySm">
              {isActive
                ? "This discount is live on the storefront."
                : "This discount is hidden from the storefront and won't apply at checkout."}
            </Text>
            <InlineStack>
              <Button
                loading={fetcher.state !== "idle"}
                onClick={handleToggleActive}
              >
                {isActive ? "Deactivate" : "Activate"}
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Quantity tiers
            </Text>
            <TierRowsEditor
              rows={rows}
              onChange={setRows}
              unitPrice={unitPrice}
              currencyCode={currencyCode}
            />
          </BlockStack>
        </Card>

        <InlineStack gap="200">
          <Button
            variant="primary"
            disabled={!canSave}
            loading={fetcher.state !== "idle"}
            onClick={handleSave}
          >
            Save changes
          </Button>
          <Button onClick={handleDuplicate}>Duplicate to other products</Button>
          <Button tone="critical" onClick={() => setDeleteModalOpen(true)}>
            Delete tier discount
          </Button>
        </InlineStack>
      </BlockStack>

      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete tier discount"
        primaryAction={{
          content: "Delete",
          destructive: true,
          loading: fetcher.state !== "idle",
          onAction: handleDelete,
        }}
        secondaryActions={[
          { content: "Cancel", onAction: () => setDeleteModalOpen(false) },
        ]}
      >
        <Modal.Section>
          <Text as="p">
            Delete the tier discount for "{tierDiscount.title}"? This can't
            be undone.
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
