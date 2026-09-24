import { BlockStack, Button, Checkbox, InlineStack, TextField, Select, Text, Icon } from "@shopify/polaris";
import { DeleteIcon } from "@shopify/polaris-icons";
import { formatMoney, currencySymbol } from "../utils/money";

export type DiscountType = "FIXED" | "PERCENTAGE";

export type TierRow = {
  key: string;
  quantity: string;
  hasMax: boolean; // whether a "to" quantity is set at all
  maxQuantity: string; // ignored (treated as unbounded, "+") unless hasMax
  discountType: DiscountType;
  price: string;
  label: string;
};

export function emptyTierRow(key: string): TierRow {
  return {
    key,
    quantity: "",
    hasMax: false,
    maxQuantity: "",
    discountType: "FIXED",
    price: "",
    label: "",
  };
}

const DISCOUNT_TYPE_OPTIONS = [
  { label: "Fixed price", value: "FIXED" },
  { label: "Percentage off", value: "PERCENTAGE" },
];

function tierPreview(
  row: TierRow,
  unitPrice: number | null,
  currencyCode: string | null,
): string | null {
  const quantity = Number(row.quantity);
  const price = Number(row.price);
  if (!quantity || !price) return null;

  if (row.discountType === "PERCENTAGE") {
    if (!unitPrice) return `${price}% off`;
    const total = unitPrice * quantity * (1 - price / 100);
    return `= ${formatMoney(total, currencyCode)} total for ${quantity} (${price}% off)`;
  }

  // price is the per-unit price at this tier, not a bundle total.
  if (!unitPrice) return `= ${formatMoney(price, currencyCode)}/unit`;
  const percentOff = unitPrice > 0 ? ((unitPrice - price) / unitPrice) * 100 : 0;
  return `= ${formatMoney(price, currencyCode)}/unit (${percentOff.toFixed(0)}% off)`;
}

export default function TierRowsEditor({
  rows,
  onChange,
  unitPrice = null,
  currencyCode = null,
}: {
  rows: TierRow[];
  onChange: (rows: TierRow[]) => void;
  unitPrice?: number | null;
  currencyCode?: string | null;
}) {
  const updateRow = (key: string, patch: Partial<TierRow>) => {
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const removeRow = (key: string) => {
    onChange(rows.filter((r) => r.key !== key));
  };

  const addRow = () => {
    onChange([...rows, emptyTierRow(`tier-${Date.now()}`)]);
  };

  return (
    <BlockStack gap="300">
      {rows.map((row, index) => (
        <div
          key={row.key}
          style={{
            border: "1px solid var(--p-color-border-secondary)",
            borderRadius: "8px",
            padding: "12px",
          }}
        >
          <BlockStack gap="200">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="span" variant="bodySm" tone="subdued" fontWeight="semibold">
                Tier {index + 1}
              </Text>
              <Checkbox
                label="Set an upper limit"
                checked={row.hasMax}
                onChange={(checked) => updateRow(row.key, { hasMax: checked })}
              />
            </InlineStack>
            <InlineStack gap="200" blockAlign="end" wrap={false}>
              <div style={{ width: 80 }}>
                <TextField
                  label="From"
                  type="number"
                  min={1}
                  autoComplete="off"
                  value={row.quantity}
                  onChange={(value) => updateRow(row.key, { quantity: value })}
                />
              </div>
              <div style={{ width: 80 }}>
                <TextField
                  label="To"
                  type="number"
                  min={1}
                  disabled={!row.hasMax}
                  placeholder="+"
                  autoComplete="off"
                  value={row.hasMax ? row.maxQuantity : ""}
                  onChange={(value) => updateRow(row.key, { maxQuantity: value })}
                />
              </div>
              <div style={{ width: 150 }}>
                <Select
                  label="Discount type"
                  options={DISCOUNT_TYPE_OPTIONS}
                  value={row.discountType}
                  onChange={(value) =>
                    updateRow(row.key, { discountType: value as DiscountType })
                  }
                />
              </div>
              <div style={{ width: 130 }}>
                <TextField
                  label={
                    row.discountType === "PERCENTAGE"
                      ? "Discount %"
                      : "Price per unit"
                  }
                  type="number"
                  step={row.discountType === "PERCENTAGE" ? 1 : 0.01}
                  min={0}
                  max={row.discountType === "PERCENTAGE" ? 100 : undefined}
                  prefix={
                    row.discountType === "FIXED"
                      ? currencySymbol(currencyCode)
                      : undefined
                  }
                  suffix={row.discountType === "PERCENTAGE" ? "%" : undefined}
                  autoComplete="off"
                  value={row.price}
                  onChange={(value) => updateRow(row.key, { price: value })}
                />
              </div>
              <div style={{ flexGrow: 1 }}>
                <TextField
                  label="Label (optional)"
                  placeholder="e.g. Most popular"
                  autoComplete="off"
                  value={row.label}
                  onChange={(value) => updateRow(row.key, { label: value })}
                />
              </div>
              <Button
                icon={<Icon source={DeleteIcon} />}
                accessibilityLabel="Remove tier"
                onClick={() => removeRow(row.key)}
                disabled={rows.length <= 1}
              />
            </InlineStack>
            {tierPreview(row, unitPrice, currencyCode) && (
              <Text as="span" tone="subdued" variant="bodySm">
                {tierPreview(row, unitPrice, currencyCode)}
              </Text>
            )}
          </BlockStack>
        </div>
      ))}
      <InlineStack>
        <Button onClick={addRow}>Add tier</Button>
      </InlineStack>
      <Text as="p" tone="subdued" variant="bodySm">
        Each tier is a quantity range, e.g. 1–5, 6–9, 10+. Leave "Set an
        upper limit" unchecked to mean "and up" ("To" shows "+") — a later,
        more specific tier still takes over once its own range is reached.
        A fixed-price tier sets the price for each individual unit once the
        buyer reaches that range (e.g. buy 5+, each unit is $135, so 5 units
        = $675); a percentage tier takes that percent off the regular total
        for any quantity in the range.
      </Text>
    </BlockStack>
  );
}
