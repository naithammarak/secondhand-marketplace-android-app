// PRODUCT-06: Product image upload service supporting real multipart backend upload and fallback mock.
import { registerProductImage } from './product-service.ts';

export interface UploadedImage {
  url: string;
  uploadId?: number;
}

export type UploadFileInput = {
  uri: string;
  name?: string;
  type?: string;
  size?: number;
  file?: unknown;
};

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type ImageUploadServiceOptions = {
  baseUrl?: string;
  fetch?: FetchLike;
  getAccessToken?: () => Promise<string | null | undefined> | string | null | undefined;
};

let mockUploadCounter = 100;

export function createImageUploadService(options: ImageUploadServiceOptions = {}) {
  let baseUrl: string | undefined;
  if (options.baseUrl) {
    const parsed = new URL(options.baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid API origin');
    baseUrl = parsed.origin;
  }

  const fetcher = options.fetch ?? fetch;

  async function resolveAccessToken(explicitToken?: string): Promise<string | null> {
    if (explicitToken) return explicitToken;
    if (options.getAccessToken) {
      const token = await options.getAccessToken();
      if (token) return token;
    }
    try {
      const { getSupabaseClient } = await import('../auth/supabase-client.ts');
      const supabase = getSupabaseClient();
      if (supabase) {
        const sessionRes = await supabase.auth.getSession();
        return sessionRes.data.session?.access_token ?? null;
      }
    } catch {
      // ignore
    }
    return null;
  }

  return {
    async uploadImage(fileInput?: UploadFileInput, explicitToken?: string): Promise<UploadedImage> {
      if (!baseUrl) {
        await new Promise(resolve => setTimeout(resolve, 400));
        mockUploadCounter += 1;
        const id = Math.random().toString(36).slice(2, 10);
        const mockUrl = `mock://product-images/${id}`;
        registerProductImage(mockUrl, { uploadId: mockUploadCounter });
        return { url: mockUrl, uploadId: mockUploadCounter };
      }

      const token = await resolveAccessToken(explicitToken);
      if (!token) {
        throw new Error('Authentication required for image upload');
      }

      const formData = new FormData();
      if (fileInput?.file) {
        formData.append('file', fileInput.file as any);
      } else if (fileInput?.uri) {
        formData.append('file', {
          uri: fileInput.uri,
          name: fileInput.name || `product-${Date.now()}.jpg`,
          type: fileInput.type || 'image/jpeg',
        } as any);
      } else {
        throw new Error('No image file provided for upload');
      }

      const response = await fetcher(`${baseUrl}/products/images/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        let errorMsg = 'Failed to upload image';
        try {
          const errJson = await response.json();
          if (errJson?.error?.message) errorMsg = errJson.error.message;
        } catch {
          // ignore
        }
        throw new Error(errorMsg);
      }

      const json = await response.json();
      const data = json.data ?? json;
      const imageUrl = data.image_url;
      const uploadId = typeof data.upload_id === 'number' ? data.upload_id : undefined;

      if (imageUrl && uploadId) {
        registerProductImage(imageUrl, { uploadId });
      }

      return { url: imageUrl, uploadId };
    },
  };
}

export type ImageUploadService = ReturnType<typeof createImageUploadService>;
