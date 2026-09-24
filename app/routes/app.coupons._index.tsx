import { useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Card,
  BlockStack,
  Button,
  InlineStack,
  Text,
  Banner,
  EmptyState,
  IndexTable,
  IndexFilters,
  IndexFiltersMode,
  useIndexResourceState,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  fetchActiveDiscountCodes,
  syncCouponCodesMetafield,
  type CouponCode,
} from "../models/tierDiscount.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const [discounts, selected] = await Promise.all([
    fetchActiveDiscountCodes(admin),
    db.selectedCoupon.findMany({
      where: { shop: session.shop },
      orderBy: { position: "asc" },
    }),
  ]);

  // A previously-featured coupon can stop being active (expired, usage
  // limit hit, deactivated) between visits. Prune it here so the
  // storefront slider never shows a dead code, best-effort.
  const activeCodes = new Set(discounts.map((d) => d.code));
  const stillValid = selected.filter((s) => activeCodes.has(s.code));
  if (stillValid.length !== selected.length) {
    try {
      await db.selectedCoupon.deleteMany({
        where: {
          shop: session.shop,
          code: { notIn: stillValid.map((s) => s.code) },
        },
      });
      await syncCouponCodesMetafield(
        admin,
        discounts.filter((d) => stillValid.some((s) => s.code === d.code)),
      );
    } catch {
      // ignore — worst case the next save reconciles it
    }
  }

  return {
    discounts,
    selectedCodes: stillValid.map((s) => s.code),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();

  const selected = JSON.parse(
    String(formData.get("selected") || "[]"),
  ) as CouponCode[];

  await db.selectedCoupon.deleteMany({ where: { shop: session.shop } });
  if (selected.length > 0) {
    await db.selectedCoupon.createMany({
      data: selected.map((c, i) => ({
        shop: session.shop,
        code: c.code,
        title: c.title,
        summary: c.summary,
        position: i,
      })),
    });
  }

  await syncCouponCodesMetafield(admin, selected);

  return { ok: true };
};

export default function CouponsIndex() {
  const { discounts, selectedCodes } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState(IndexFiltersMode.Default);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return discounts;
    return discounts.filter(
      (d) =>
        d.title.toLowerCase().includes(q) || d.code.toLowerCase().includes(q),
    );
  }, [discounts, query]);

  const rows = useMemo(
    () => filtered.map((d) => ({ ...d, id: d.code })),
    [filtered],
  );

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(rows, {
      selectedResources: selectedCodes,
    });

  const handleSave = () => {
    const selected = discounts.filter((d) => selectedResources.includes(d.code));
    fetcher.submit(
      { selected: JSON.stringify(selected) },
      { method: "post" },
    );
  };

  return (
    <Page fullWidth>
      <TitleBar title="Coupons" />
      <BlockStack gap="400">
        {fetcher.data && "ok" in fetcher.data && (
          <Banner tone="success">Saved. The storefront slider is updated.</Banner>
        )}
        <Card padding="0">
          {discounts.length === 0 ? (
            <EmptyState
              heading="No active discount codes"
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>
                Create a discount code in Shopify Discounts, then come back
                here to feature it in the storefront coupon slider.
              </p>
            </EmptyState>
          ) : (
            <>
              <IndexFilters
                tabs={[{ id: "all", content: "All" }]}
                selected={0}
                onSelect={() => {}}
                mode={mode}
                setMode={setMode}
                queryValue={query}
                queryPlaceholder="Search and filter"
                onQueryChange={setQuery}
                onQueryClear={() => setQuery("")}
                onClearAll={() => setQuery("")}
                filters={[]}
                cancelAction={{ onAction: () => setQuery("") }}
              />
              <IndexTable
                resourceName={{ singular: "coupon", plural: "coupons" }}
                itemCount={rows.length}
                selectedItemsCount={
                  allResourcesSelected ? "All" : selectedResources.length
                }
                onSelectionChange={handleSelectionChange}
                headings={[
                  { title: "Title" },
                  { title: "Code" },
                  { title: "Summary" },
                  { title: "Expires" },
                  { title: "Usage limit" },
                ]}
              >
                {rows.map((d, index) => (
                  <IndexTable.Row
                    id={d.id}
                    key={d.id}
                    position={index}
                    selected={selectedResources.includes(d.id)}
                  >
                    <IndexTable.Cell>
                      <Text variant="bodyMd" fontWeight="bold" as="span">
                        {d.title}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodyMd">
                        {d.code}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" tone="subdued" variant="bodySm">
                        {d.summary || "—"}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" tone="subdued" variant="bodySm">
                        {d.endsAt
                          ? new Date(d.endsAt).toLocaleDateString()
                          : "No end date"}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" tone="subdued" variant="bodySm">
                        {d.usageLimit ?? "Unlimited"}
                      </Text>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            </>
          )}
        </Card>

        {discounts.length > 0 && (
          <InlineStack>
            <Button
              variant="primary"
              loading={fetcher.state !== "idle"}
              onClick={handleSave}
            >
              Save selection
            </Button>
          </InlineStack>
        )}
      </BlockStack>
    </Page>
  );
}
