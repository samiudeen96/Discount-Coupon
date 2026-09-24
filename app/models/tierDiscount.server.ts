// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminGraphqlClient = { graphql: (query: string, options?: any) => Promise<Response> };

export type TierInput = {
  quantity: number; // range start ("from")
  hasMax: boolean; // whether the merchant opted into an upper limit at all
  maxQuantity: number | null; // range end ("to"); null = unbounded. With hasMax=true this means "checked but left blank" (shown as "from+"); with hasMax=false it means "no upper-limit concept" (shown as bare "from")
  discountType: "FIXED" | "PERCENTAGE";
  price: number;
  label: string | null;
};

/**
 * Returns an error message if the tiers aren't safe to save, or null if
 * they're valid. Each tier is a quantity range [quantity, maxQuantity] (or
 * [quantity, +Infinity) when maxQuantity is left blank/unbounded). "To" is
 * optional on every tier, not just the last: the checkout Function always
 * picks the most specific (highest "from") range that matches the cart
 * quantity, so an earlier open-ended tier is still correctly overridden by
 * a later, more specific one when the quantity falls in both.
 */
export function validateTiers(tiers: TierInput[]): string | null {
  if (tiers.length === 0) return "Add at least one tier.";

  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    if (!Number.isFinite(t.quantity) || t.quantity < 1) {
      return "Buy quantity must be at least 1.";
    }
    if (
      t.maxQuantity !== null &&
      (!Number.isFinite(t.maxQuantity) || t.maxQuantity < t.quantity)
    ) {
      return "A tier's \"to\" quantity must be greater than or equal to its \"from\" quantity.";
    }
    if (i > 0 && t.quantity <= tiers[i - 1].quantity) {
      return "Tiers must have strictly increasing \"from\" quantities, lowest to highest.";
    }
    if (t.discountType === "PERCENTAGE") {
      if (!(t.price > 0 && t.price <= 100)) {
        return "Percentage tiers must be greater than 0 and at most 100.";
      }
    } else if (!(t.price > 0)) {
      return "Bundle price must be greater than 0.";
    }
  }

  return null;
}

// Stored on the product as a "gw_tier_discount.tiers" metafield so both the
// theme widget (Liquid) and the Shopify Function can read it directly from
// product.metafields.gw_tier_discount.tiers.
export async function syncTierMetafield(
  admin: AdminGraphqlClient,
  productGid: string,
  tiers: TierInput[],
) {
  const sorted = [...tiers].sort((a, b) => a.quantity - b.quantity);

  const response = await admin.graphql(
    `#graphql
      mutation SyncTierMetafield($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id key namespace }
          userErrors { field message }
        }
      }`,
    {
      variables: {
        metafields: [
          {
            ownerId: productGid,
            namespace: "gw_tier_discount",
            key: "tiers",
            type: "json",
            value: JSON.stringify(sorted),
          },
        ],
      },
    },
  );

  const json = await response.json();
  const userErrors = json?.data?.metafieldsSet?.userErrors;
  if (userErrors?.length) {
    throw new Error(
      `Failed to sync tier metafield: ${userErrors
        .map((e: { message: string }) => e.message)
        .join(", ")}`,
    );
  }
}

/**
 * Ensures a single automatic app discount exists pointing at the
 * tier-discount function, so the function actually runs at checkout. Safe to
 * call repeatedly — it's a no-op once the discount already exists.
 */
export async function ensureTierDiscountIsActive(admin: AdminGraphqlClient) {
  const existing = await admin.graphql(
    `#graphql
      query ExistingTierDiscount {
        shopifyFunctions(first: 25) {
          nodes { id apiType title }
        }
        automaticDiscountNodes: discountNodes(first: 25, query: "method:automatic") {
          nodes {
            id
            discount {
              __typename
              ... on DiscountAutomaticApp {
                title
              }
            }
          }
        }
      }`,
  );
  const json = await existing.json();

  const fn = json?.data?.shopifyFunctions?.nodes?.find(
    (n: { title: string }) => n.title === "GW Tier Discount",
  );
  if (!fn) return;

  const alreadyActive = json?.data?.automaticDiscountNodes?.nodes?.some(
    (n: { discount?: { title?: string } }) =>
      n.discount?.title === "GW Bulk Tier Discount",
  );
  if (alreadyActive) return;

  const response = await admin.graphql(
    `#graphql
      mutation CreateTierDiscount($automaticAppDiscount: DiscountAutomaticAppInput!) {
        discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
          userErrors { field message }
        }
      }`,
    {
      variables: {
        automaticAppDiscount: {
          title: "GW Bulk Tier Discount",
          functionId: fn.id,
          startsAt: new Date().toISOString(),
          discountClasses: ["PRODUCT"],
          combinesWith: {
            orderDiscounts: true,
            productDiscounts: false,
            shippingDiscounts: true,
          },
        },
      },
    },
  );
  const result = await response.json();
  const userErrors = result?.data?.discountAutomaticAppCreate?.userErrors;
  if (userErrors?.length) {
    throw new Error(
      `Failed to activate tier discount: ${userErrors
        .map((e: { message: string }) => e.message)
        .join(", ")}`,
    );
  }
}

export type CouponCode = {
  code: string;
  title: string;
  summary: string | null;
  endsAt: string | null;
  usageLimit: number | null;
};

/**
 * Live lookup of the shop's currently active discount codes, for the admin
 * Coupons page to let the merchant pick which ones to feature. Does not
 * touch the storefront metafield — see syncCouponCodesMetafield for that.
 */
export async function fetchActiveDiscountCodes(
  admin: AdminGraphqlClient,
): Promise<CouponCode[]> {
  const response = await admin.graphql(
    `#graphql
      query ActiveCouponCodes {
        codeDiscountNodes(first: 50, query: "status:active") {
          nodes {
            codeDiscount {
              __typename
              ... on DiscountCodeBasic {
                title
                summary
                endsAt
                usageLimit
                codes(first: 1) { nodes { code } }
              }
              ... on DiscountCodeBxgy {
                title
                summary
                endsAt
                usageLimit
                codes(first: 1) { nodes { code } }
              }
              ... on DiscountCodeFreeShipping {
                title
                summary
                endsAt
                usageLimit
                codes(first: 1) { nodes { code } }
              }
            }
          }
        }
      }`,
  );
  const json = await response.json();

  type CodeDiscountNode = {
    codeDiscount?: {
      title?: string;
      summary?: string | null;
      endsAt?: string | null;
      usageLimit?: number | null;
      codes?: { nodes?: { code: string }[] };
    };
  };

  const nodes = (json?.data?.codeDiscountNodes?.nodes ?? []) as CodeDiscountNode[];
  return nodes
    .map((n) => {
      const code = n.codeDiscount?.codes?.nodes?.[0]?.code;
      if (!code) return null;
      return {
        code,
        title: n.codeDiscount?.title ?? code,
        summary: n.codeDiscount?.summary ?? null,
        endsAt: n.codeDiscount?.endsAt ?? null,
        usageLimit: n.codeDiscount?.usageLimit ?? null,
      };
    })
    .filter((c): c is CouponCode => c !== null);
}

/**
 * Writes the merchant's selected coupons (from the SelectedCoupon table) to
 * a shop metafield so the storefront coupon slider (theme app extension,
 * which can only read Liquid/metafield data, not call the Admin API) can
 * render them. Best-effort: call sites should swallow errors so a Discounts
 * API hiccup never blocks the rest of the page from loading.
 */
export async function syncCouponCodesMetafield(
  admin: AdminGraphqlClient,
  coupons: CouponCode[],
) {
  const shopResponse = await admin.graphql(
    `#graphql
      query ShopId {
        shop { id }
      }`,
  );
  const shopJson = await shopResponse.json();
  const shopGid = shopJson?.data?.shop?.id;
  if (!shopGid) return;

  await admin.graphql(
    `#graphql
      mutation SyncCouponCodes($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors { field message }
        }
      }`,
    {
      variables: {
        metafields: [
          {
            ownerId: shopGid,
            namespace: "gw_tier_discount",
            key: "coupon_codes",
            type: "json",
            value: JSON.stringify(coupons),
          },
        ],
      },
    },
  );
}

export async function clearTierMetafield(
  admin: AdminGraphqlClient,
  productGid: string,
) {
  await admin.graphql(
    `#graphql
      mutation ClearTierMetafield($ownerId: ID!) {
        metafieldsSet(metafields: [{
          ownerId: $ownerId,
          namespace: "gw_tier_discount",
          key: "tiers",
          type: "json",
          value: "[]"
        }]) {
          userErrors { field message }
        }
      }`,
    { variables: { ownerId: productGid } },
  );
}
