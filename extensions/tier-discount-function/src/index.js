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

  const eligibleTiers = tiers
    .filter((tier) => line.quantity >= tier.quantity)
    .sort((a, b) => b.quantity - a.quantity);

  const tier = eligibleTiers[0];
  if (!tier) return null;

  const unitPrice = Number(line.cost.amountPerQuantity.amount);
  const originalTotal = unitPrice * line.quantity;

  const discountType = tier.discountType === "PERCENTAGE" ? "PERCENTAGE" : "FIXED";

  let discountAmount;
  let message;
  if (discountType === "PERCENTAGE") {
    discountAmount = originalTotal * (tier.price / 100);
    message = `${tier.price}% off ${tier.quantity}+`;
  } else {
    const targetUnitPrice = tier.price / tier.quantity;
    const targetTotal = targetUnitPrice * line.quantity;
    discountAmount = originalTotal - targetTotal;
    message = `Buy ${tier.quantity} for $${tier.price.toFixed(2)}`;
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

// The installed @shopify/shopify_function runtime (v1.x) always invokes the
// entry file's default export, regardless of the `export` name declared in
// shopify.extension.toml, so both are provided here for safety.
export default cartLinesDiscountsGenerateRun;
