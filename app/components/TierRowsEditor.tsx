import { BlockStack, Button, InlineStack, TextField, Select, Text, Icon } from "@shopify/polaris";
import { DeleteIcon } from "@shopify/polaris-icons";

export type DiscountType = "FIXED" | "PERCENTAGE";

export type TierRow = {
  key: string;
  quantity: string;
  discountType: DiscountType;
  price: string;
  label: string;
};

export function emptyTierRow(key: string): TierRow {
  return { key, quantity: "", discountType: "FIXED", price: "", label: "" };
}

const DISCOUNT_TYPE_OPTIONS = [
  { label: "Fixed price", value: "FIXED" },
  { label: "Percentage off", value: "PERCENTAGE" },
];

export default function TierRowsEditor({
  rows,
  onChange,
}: {
  rows: TierRow[];
  onChange: (rows: TierRow[]) => void;
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
        <InlineStack key={row.key} gap="200" blockAlign="end" wrap={false}>
          <div style={{ width: 90 }}>
            <TextField
              label={index === 0 ? "Buy quantity" : undefined}
              type="number"
              min={1}
              autoComplete="off"
              value={row.quantity}
              onChange={(value) => updateRow(row.key, { quantity: value })}
            />
          </div>
          <div style={{ width: 150 }}>
            <Select
              label={index === 0 ? "Discount type" : undefined}
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
                index === 0
                  ? row.discountType === "PERCENTAGE"
                    ? "Discount %"
                    : "Bundle price"
                  : undefined
              }
              type="number"
              step={row.discountType === "PERCENTAGE" ? 1 : 0.01}
              min={0}
              max={row.discountType === "PERCENTAGE" ? 100 : undefined}
              prefix={row.discountType === "FIXED" ? "$" : undefined}
              suffix={row.discountType === "PERCENTAGE" ? "%" : undefined}
              autoComplete="off"
              value={row.price}
              onChange={(value) => updateRow(row.key, { price: value })}
            />
          </div>
          <div style={{ flexGrow: 1 }}>
            <TextField
              label={index === 0 ? "Label (optional)" : undefined}
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
      ))}
      <InlineStack>
        <Button onClick={addRow}>Add tier</Button>
      </InlineStack>
      <Text as="p" tone="subdued" variant="bodySm">
        Tiers should be entered from lowest to highest quantity. A fixed-price
        tier sets the total price for that many units; a percentage tier
        takes that percent off the regular total.
      </Text>
    </BlockStack>
  );
}
