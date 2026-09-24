import { useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Card,
  IndexTable,
  IndexFilters,
  IndexFiltersMode,
  EmptyState,
  Badge,
  Text,
  useIndexResourceState,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { clearTierMetafield, syncTierMetafield } from "../models/tierDiscount.server";
import { formatMoney } from "../utils/money";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const tierDiscounts = await db.tierDiscount.findMany({
    where: { shop: session.shop },
    include: { tiers: { orderBy: { position: "asc" } } },
    orderBy: { createdAt: "desc" },
  });

  let currencyCode: string | null = null;
  try {
    const response = await admin.graphql(
      `#graphql
        query ShopCurrency {
          shop { currencyCode }
        }`,
    );
    const json = await response.json();
    currencyCode = json?.data?.shop?.currencyCode ?? null;
  } catch {
    currencyCode = null;
  }

  return { tierDiscounts, currencyCode };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const ids = JSON.parse(String(formData.get("ids") || "[]")) as string[];

  const tierDiscounts = await db.tierDiscount.findMany({
    where: { id: { in: ids }, shop: session.shop },
    include: { tiers: { orderBy: { position: "asc" } } },
  });

  if (intent === "bulk-delete") {
    for (const td of tierDiscounts) {
      await clearTierMetafield(admin, td.productGid);
    }
    await db.tierDiscount.deleteMany({
      where: { id: { in: tierDiscounts.map((td) => td.id) }, shop: session.shop },
    });
    return { ok: true };
  }

  if (intent === "bulk-activate" || intent === "bulk-deactivate") {
    const nextActive = intent === "bulk-activate";
    for (const td of tierDiscounts) {
      await db.tierDiscount.update({
        where: { id: td.id },
        data: { isActive: nextActive },
      });
      if (nextActive) {
        await syncTierMetafield(
          admin,
          td.productGid,
          td.tiers.map((t) => ({
            quantity: t.quantity,
            discountType: t.discountType as "FIXED" | "PERCENTAGE",
            price: t.price,
            label: t.label,
          })),
        );
      } else {
        await clearTierMetafield(admin, td.productGid);
      }
    }
    return { ok: true };
  }

  return { error: "Unknown action" };
};

export default function TierDiscountsIndex() {
  const { tierDiscounts, currencyCode } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher<typeof action>();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState(IndexFiltersMode.Default);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tierDiscounts;
    return tierDiscounts.filter((td) => td.title.toLowerCase().includes(q));
  }, [tierDiscounts, query]);

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(filtered);

  const runBulk = (intent: string) => {
    fetcher.submit(
      { intent, ids: JSON.stringify(selectedResources) },
      { method: "post" },
    );
  };

  return (
    <Page fullWidth>
      <TitleBar title="Tier Discounts">
        <button variant="primary" onClick={() => navigate("/app/tiers/new")}>
          Create tier discount
        </button>
      </TitleBar>
      <Card padding="0">
        {tierDiscounts.length === 0 ? (
          <EmptyState
            heading="Set up a quantity-tier discount"
            action={{
              content: "Create tier discount",
              onAction: () => navigate("/app/tiers/new"),
            }}
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <p>
              Pick a product and set up "Buy 2 for $X / Buy 3 for $Y" pricing
              tiers, like the Kite Buy More Save More widget.
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
              resourceName={{ singular: "tier discount", plural: "tier discounts" }}
              itemCount={filtered.length}
              selectedItemsCount={
                allResourcesSelected ? "All" : selectedResources.length
              }
              onSelectionChange={handleSelectionChange}
              bulkActions={[
                {
                  content: "Activate",
                  onAction: () => runBulk("bulk-activate"),
                },
                {
                  content: "Deactivate",
                  onAction: () => runBulk("bulk-deactivate"),
                },
              ]}
              promotedBulkActions={[
                {
                  content: "Delete",
                  onAction: () => runBulk("bulk-delete"),
                },
              ]}
              headings={[
                { title: "Product" },
                { title: "Tiers" },
                { title: "Status" },
              ]}
            >
              {filtered.map((td, index) => (
                <IndexTable.Row
                  id={td.id}
                  key={td.id}
                  position={index}
                  selected={selectedResources.includes(td.id)}
                  onClick={() => navigate(`/app/tiers/${td.id}`)}
                >
                  <IndexTable.Cell>
                    <Text variant="bodyMd" fontWeight="bold" as="span">
                      {td.title}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    {td.tiers
                      .map((t) =>
                        t.discountType === "PERCENTAGE"
                          ? `Buy ${t.quantity}, save ${t.price}%`
                          : `Buy ${t.quantity} for ${formatMoney(t.price, currencyCode)}`,
                      )
                      .join(" · ")}
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone={td.isActive ? "success" : undefined}>
                      {td.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          </>
        )}
      </Card>
    </Page>
  );
}
