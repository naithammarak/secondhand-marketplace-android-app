export function isCatalogOnlyMode(): boolean {
  return process.env.EXPO_PUBLIC_CATALOG_ONLY === 'true';
}

export function isBuyerOrdersMode(): boolean {
  return process.env.EXPO_PUBLIC_BUYER_ORDERS === 'true';
}
