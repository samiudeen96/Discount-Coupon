import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * Resource route: given ?productId=<gid>, returns that product's first
 * variant price. Used only for the tier editor's live savings preview
 * before a TierDiscount record (and its own price lookup) exists yet.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const productGid = new URL(request.url).searchParams.get("productId");
  if (!productGid) return { unitPrice: null, currencyCode: null };

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
      { variables: { id: productGid } },
    );
    const json = await response.json();
    const price = json?.data?.product?.variants?.nodes?.[0]?.price;
    const currencyCode = json?.data?.shop?.currencyCode ?? null;
    return { unitPrice: price ? Number(price) : null, currencyCode };
  } catch {
    return { unitPrice: null, currencyCode: null };
  }
};
