import type { ProductCatalogServiceOptions } from '../services/product-catalog-service.ts';

export type ProductCatalogEnvironment = {
  mode?: string;
  baseUrl?: string;
  buildEnvironment?: string;
};

/**
 * Resolve build-time catalog settings without silently selecting mock data.
 * A configured URL defaults to the API; mock data requires an explicit mode.
 */
export function resolveProductCatalogServiceOptions(
  environment: ProductCatalogEnvironment,
): ProductCatalogServiceOptions {
  const mode = environment.mode?.trim().toLowerCase();
  const buildEnvironment = environment.buildEnvironment?.trim().toLowerCase();
  if (mode === 'mock') {
    if (buildEnvironment === 'production') {
      return { mode: 'api', unavailableCode: 'PRODUCT_CATALOG_MOCK_DISABLED_IN_PRODUCTION' };
    }
    return { mode: 'mock' };
  }
  if (mode && mode !== 'api') {
    return { mode: 'api', unavailableCode: 'PRODUCT_CATALOG_MODE_INVALID' };
  }

  const baseUrl = environment.baseUrl?.trim();
  if (!baseUrl) {
    return { mode: 'api', unavailableCode: 'PRODUCT_CATALOG_API_BASE_URL_MISSING' };
  }

  try {
    const parsed = new URL(baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
      return { mode: 'api', unavailableCode: 'PRODUCT_CATALOG_API_BASE_URL_INVALID' };
    }
    return { mode: 'api', baseUrl: parsed.origin };
  } catch {
    return { mode: 'api', unavailableCode: 'PRODUCT_CATALOG_API_BASE_URL_INVALID' };
  }
}
