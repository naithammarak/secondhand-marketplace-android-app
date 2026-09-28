import { useEffect, useState } from 'react';
import { productCatalogService, productCatalogStore } from '@/products/product-catalog-instance';

const imageCache = new Map<number, string>();
const inFlightPromises = new Map<number, Promise<string | null>>();

export function getCachedProductImage(id: number): string | undefined {
  return imageCache.get(id);
}

export function setCachedProductImage(id: number, imageUrl: string): void {
  if (imageUrl) {
    imageCache.set(id, imageUrl);
  }
}

export function clearProductImageCache(): void {
  imageCache.clear();
  inFlightPromises.clear();
}

export async function fetchProductImage(id: number): Promise<string | null> {
  if (imageCache.has(id)) {
    return imageCache.get(id)!;
  }
  // Check catalog snapshot items first (zero network cost)
  const storeItems = productCatalogStore?.getSnapshot?.()?.items;
  if (storeItems) {
    const found = storeItems.find(item => item.id === id);
    if (found?.mainImage?.imageUrl) {
      imageCache.set(id, found.mainImage.imageUrl);
      return found.mainImage.imageUrl;
    }
  }

  if (!productCatalogService || typeof productCatalogService.getProduct !== 'function') {
    return null;
  }
  let promise = inFlightPromises.get(id);
  if (!promise) {
    promise = productCatalogService
      .getProduct(id)
      .then(detail => {
        const url =
          detail.images?.find(img => img.photoType === 'MAIN')?.imageUrl ||
          detail.images?.[0]?.imageUrl ||
          null;
        if (url) {
          imageCache.set(id, url);
        }
        inFlightPromises.delete(id);
        return url;
      })
      .catch(() => {
        inFlightPromises.delete(id);
        return null;
      });
    inFlightPromises.set(id, promise);
  }
  return promise;
}

export function useProductImage(id: number, initialUrl?: string | null): string | null {
  const storeItemUrl = id > 0 ? productCatalogStore?.getSnapshot?.()?.items?.find?.(item => item.id === id)?.mainImage?.imageUrl : null;
  const cached = id > 0 ? imageCache.get(id) : undefined;
  const effectiveInitial = initialUrl || cached || storeItemUrl || null;
  const [resolvedImage, setResolvedImage] = useState<{ id: number; url: string } | null>(null);

  useEffect(() => {
    if (id <= 0) return;
    if (initialUrl) {
      imageCache.set(id, initialUrl);
      return;
    }
    if (effectiveInitial) return;
    let active = true;
    void fetchProductImage(id).then(resolved => {
      if (active && resolved) {
        setResolvedImage({ id, url: resolved });
      }
    });
    return () => {
      active = false;
    };
  }, [id, initialUrl, effectiveInitial]);

  if (id <= 0) return null;
  return effectiveInitial ?? (resolvedImage?.id === id ? resolvedImage.url : null);
}
