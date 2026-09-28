import { useEffect, useState } from 'react';
import type { ProductListItem } from '@/services/product-catalog-service';
import { productCatalogService } from '@/products/product-catalog-instance';

const brandCache = new Map<number, string>();
const inFlightPromises = new Map<number, Promise<string | null>>();

export function getCachedProductBrand(id: number): string | undefined {
  return brandCache.get(id);
}

export function setCachedProductBrand(id: number, brandName: string): void {
  brandCache.set(id, brandName);
}

export function clearProductBrandCache(): void {
  brandCache.clear();
  inFlightPromises.clear();
}

export async function fetchProductBrand(id: number): Promise<string | null> {
  if (brandCache.has(id)) {
    return brandCache.get(id)!;
  }
  if (!productCatalogService || typeof productCatalogService.getProduct !== 'function') {
    return null;
  }
  let promise = inFlightPromises.get(id);
  if (!promise) {
    promise = productCatalogService
      .getProduct(id)
      .then(detail => {
        const name = detail.brand?.brandName || 'ไม่ระบุแบรนด์';
        brandCache.set(id, name);
        inFlightPromises.delete(id);
        return name;
      })
      .catch(() => {
        inFlightPromises.delete(id);
        return null;
      });
    inFlightPromises.set(id, promise);
  }
  return promise;
}

export function useProductBrand(item: ProductListItem): string {
  const explicit = item.brand?.brandName ?? item.brandName ?? (item as any).brand;
  const cached = brandCache.get(item.id);
  const [brandName, setBrandName] = useState<string | null>(explicit ?? cached ?? null);

  useEffect(() => {
    if (explicit) {
      setBrandName(explicit);
      brandCache.set(item.id, explicit);
      return;
    }
    if (cached) {
      setBrandName(cached);
      return;
    }
    let active = true;
    void fetchProductBrand(item.id).then(resolved => {
      if (active && resolved) {
        setBrandName(resolved);
      }
    });
    return () => {
      active = false;
    };
  }, [item.id, explicit, cached]);

  return brandName ?? explicit ?? cached ?? 'ไม่ระบุแบรนด์';
}
