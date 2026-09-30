export function isCatalogOnlyMode(): boolean {
  return process.env.EXPO_PUBLIC_CATALOG_ONLY === 'true';
}
