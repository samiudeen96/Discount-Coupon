// @ts-check

/**
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunInput} RunInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} FunctionRunResult
 */

/**
 * NOTE: hand-written against the 2025-01 unified Discount Functions API from
 * memory, without a generated `../generated/api` typings file (that file is
 * produced by `shopify app function typegen`, which needs an authenticated
 * CLI session). Before deploying:
 *   1. Run `shopify app function typegen` in this extension to generate
 *      `generated/api.d.ts` and confirm the exact input/output field names
 *      below (especially the `operations` wrapper key — this assumes
 *      `productDiscountsAdd`, matching the Product discount class).
 *   2. Run `shopify app function run` locally with a sample cart to confirm
 *      the JSON output matches what Shopify expects.
 *
 * @param {RunInput} input
 * @returns {FunctionRunResult}
 */
export function cartLinesDiscountsGenerateRun(input) {
  const isProductDiscount = input.discount.discountClasses.includes(
    "PRODUCT",
  );

  if (!isProductDiscount) {
    return { operations: [] };
  }

  const candidates = input.cart.lines
    .map((line) => buildCandidate(line))
    .filter((candidate) => candidate !== null);

  if (candidates.length === 0) {
    return { operations: [] };
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: "ALL",
        },
      },
    ],
  };
}

function buildCandidate(line) {
  const product = line.merchandise?.product;
  const tiersRaw = product?.tiersMetafield?.value;
  if (!tiersRaw) return null;

  /**
   * @type {{
   *   quantity: number;
   *   hasMax?: boolean;
   *   maxQuantity?: number | null;
   *   discountType?: "FIXED" | "PERCENTAGE";
   *   price: number;
   *   label?: string | null;
   * }[]}
   */
  let tiers;
  try {
    tiers = JSON.parse(tiersRaw);
  } catch {
    return null;
  }
  if (!Array.isArray(tiers) || tiers.length === 0) return null;

  // Each tier is a quantity range [quantity, maxQuantity] (maxQuantity ==
  // null means "and up"). If the cart quantity falls in more than one range
  // (touching boundaries), the most specific one — the highest "from" — wins.
  const eligibleTiers = tiers
    .filter(
      (tier) =>
        line.quantity >= tier.quantity &&
        (tier.maxQuantity == null || line.quantity <= tier.maxQuantity),
    )
    .sort((a, b) => b.quantity - a.quantity);

  const tier = eligibleTiers[0];
  if (!tier) return null;

  const unitPrice = Number(line.cost.amountPerQuantity.amount);
  const currencyCode = line.cost.amountPerQuantity.currencyCode;
  const originalTotal = unitPrice * line.quantity;

  const discountType = tier.discountType === "PERCENTAGE" ? "PERCENTAGE" : "FIXED";
  let rangeLabel;
  if (tier.maxQuantity != null) {
    rangeLabel = `${tier.quantity}-${tier.maxQuantity}`;
  } else if (tier.hasMax) {
    rangeLabel = `${tier.quantity}+`;
  } else {
    rangeLabel = `${tier.quantity}`;
  }

  let discountAmount;
  let message;
  if (discountType === "PERCENTAGE") {
    discountAmount = originalTotal * (tier.price / 100);
    message = `${tier.price}% off (buy ${rangeLabel})`;
  } else {
    // tier.price is the per-unit price at this tier (e.g. buy 5+, each unit
    // is $135), applied to every unit in the cart line — not a bundle total
    // for the tier's "from" quantity.
    const targetTotal = tier.price * line.quantity;
    discountAmount = originalTotal - targetTotal;
    message = `Buy ${rangeLabel} at ${formatMoney(tier.price, currencyCode)}/unit`;
  }

  if (discountAmount <= 0) return null;

  return {
    message,
    targets: [{ cartLine: { id: line.id } }],
    value: {
      fixedAmount: {
        amount: discountAmount.toFixed(2),
      },
    },
  };
}

// Functions run in a javy/QuickJS sandbox without the (huge) ICU data
// Intl.NumberFormat needs, so currency symbols are formatted by hand here
// instead. Covers common currencies; anything else falls back to "<code>
// <amount>", which is still correct, just less pretty than a native symbol.
const CURRENCY_SYMBOLS = {
  USD: "$",
  CAD: "$",
  AUD: "$",
  NZD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CNY: "¥",
  INR: "₹",
  AED: "AED ",
  SAR: "SAR ",
};

function formatMoney(amount, currencyCode) {
  const formatted = amount.toFixed(2);
  const symbol = CURRENCY_SYMBOLS[currencyCode];
  return symbol ? `${symbol}${formatted}` : `${currencyCode} ${formatted}`;
}

// The installed @shopify/shopify_function runtime (v1.x) always invokes the
// entry file's default export, regardless of the `export` name declared in
// shopify.extension.toml, so both are provided here for safety.
export default cartLinesDiscountsGenerateRun;
