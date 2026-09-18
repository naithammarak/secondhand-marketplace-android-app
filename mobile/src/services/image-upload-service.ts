// PRODUCT-06: Mock image upload — backend not connected yet.
export interface UploadedImage {
  url: string;
}

// TODO(PRODUCT-06): Mock only. No file is actually read or stored; this only
// simulates upload latency and hands back a fake, unique URL so the product
// form can exercise a real create/update flow. Replace with a real multipart
// upload call once the backend endpoint exists.
export function createImageUploadService(options: { baseUrl?: string } = {}) {
  return {
    async uploadImage(): Promise<UploadedImage> {
      if (options.baseUrl) throw new Error('Backend image upload API is not implemented yet');
      await new Promise(resolve => setTimeout(resolve, 400));
      const id = Math.random().toString(36).slice(2, 10);
      return { url: `mock://product-images/${id}` };
    },
  };
}
