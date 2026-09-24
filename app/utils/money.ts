export function formatMoney(amount: number, currencyCode: string | null): string {
  if (!currencyCode) return amount.toFixed(2);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
    }).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

export function currencySymbol(currencyCode: string | null): string | undefined {
  if (!currencyCode) return undefined;
  try {
    const parts = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? currencyCode;
  } catch {
    return currencyCode;
  }
}
