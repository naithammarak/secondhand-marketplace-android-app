// PRODUCT-06: Product image upload service using multipart API; in-memory uploads are opt-in for development.
import { ProductServiceError, registerProductImage } from './product-service.ts';

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
  mockMode?: boolean;
  fetch?: FetchLike;
  getAccessToken?: () => Promise<string | null | undefined> | string | null | undefined;
};

let mockUploadCounter = 100;

export function createImageUploadService(options: ImageUploadServiceOptions = {}) {
  let baseUrl: string | undefined;
  if (options.mockMode !== true && options.baseUrl) {
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
        if (options.mockMode !== true) {
          throw new ProductServiceError('unavailable', 'ยังไม่ได้ตั้งค่า API สำหรับอัปโหลดรูป');
        }
        await new Promise(resolve => setTimeout(resolve, 400));
        mockUploadCounter += 1;
        const id = Math.random().toString(36).slice(2, 10);
        const mockUrl = `mock://product-images/${id}`;
        registerProductImage(mockUrl, { uploadId: mockUploadCounter });
        return { url: mockUrl, uploadId: mockUploadCounter };
      }

      const token = await resolveAccessToken(explicitToken);
      if (!token) {
        throw new ProductServiceError('unauthorized', 'กรุณาเข้าสู่ระบบใหม่');
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

      let response: Response;
      try {
        response = await fetcher(`${baseUrl}/products/images/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
      } catch {
        throw new ProductServiceError('network-error', 'เครือข่ายขัดข้อง กรุณาลองใหม่');
      }

      if (!response.ok) {
        if (response.status === 401) throw new ProductServiceError('unauthorized', 'กรุณาเข้าสู่ระบบใหม่');
        if (response.status === 403) throw new ProductServiceError('forbidden', 'บัญชีผู้ขายยังไม่ได้รับอนุมัติหรือไม่มีสิทธิ์อัปโหลดรูป');
        if (response.status === 409) throw new ProductServiceError('conflict', 'สถานะบัญชีหรือรูปภาพเปลี่ยนไป กรุณาลองใหม่');
        if (response.status === 422) throw new ProductServiceError('validation-error', 'รูปภาพไม่ถูกต้อง กรุณาตรวจสอบชนิดและขนาดไฟล์');
        throw new ProductServiceError('server-error', 'อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่');
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
